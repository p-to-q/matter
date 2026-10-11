import { clientMatterBasePath } from "../config/base-path";
import { MODEL_DEADLINES } from "../config/model-deadlines";
import {
  IMAGE_MEDIA_TYPES,
  IMAGE_RESPONSE_HEADERS,
  MAX_IMAGE_BYTES,
  parseImageResultMeta,
  type ImageRequestEnvelope,
} from "../protocol/image-contract";
import { inspectImageStructure } from "../protocol/image-structure";
import {
  PICTURE_SERVER_ERROR_CODES,
  type GeneratedPicture,
  type PictureFailureReason,
  type PictureServerErrorCode,
} from "../runtime/picture-turn";
import { BoundedByteAccumulator } from "../runtime/bounded-byte-accumulator";
import { parseImagePointer } from "../tree/image-pointer";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline } from "./request-deadline";

export type PictureRequestResult =
  | Readonly<{ ok: true; picture: GeneratedPicture }>
  | Readonly<{ ok: false; reason: PictureFailureReason; retryable: boolean }>;

export type PictureRequestOptions = Readonly<{
  fetch?: typeof fetch;
  signal: AbortSignal;
  deadlineMs?: number;
}>;

// The error envelope is one short line of JSON.
const MAX_ERROR_RESPONSE_BYTES = 4 * 1024;
const MAX_ERROR_MESSAGE_CODE_POINTS = 500;
// A failure invites a second paid attempt only where the server could not have
// been billed: a rate limit, a shed before any relay, or a brief refusal. Any
// other status, even one the server marks retryable, may follow a billed relay.
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 503, 422]);

/**
 * One transport attempt for one picture; it never retries and never throws for
 * an outcome. The bytes are returned exactly as received: re-encoding would
 * destroy the provider's embedded provenance and change the hash the pointer
 * names. Errors carry a closed reason and nothing the person wrote.
 */
export async function requestPicture(
  envelope: ImageRequestEnvelope,
  options: PictureRequestOptions,
): Promise<PictureRequestResult> {
  const { signal } = options;
  if (signal.aborted) return failure("aborted", false);
  const deadline = createRequestDeadline(
    signal,
    options.deadlineMs ?? MODEL_DEADLINES.image.clientMs,
    "The picture request timed out.",
  );
  try {
    const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const response = await Promise.race([
      send(`${clientMatterBasePath()}/api/image`, {
        method: "POST",
        headers: {
          accept: `${IMAGE_MEDIA_TYPES.join(", ")}, application/json`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(envelope),
        cache: "no-store",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
    const picture = response.ok
      ? await readPicture(response, deadline)
      : await refuse(response, deadline);
    return Object.freeze({ ok: true, picture });
  } catch (error) {
    if (signal.aborted) return failure("aborted", false);
    if (deadline.didTimeout()) return failure("timeout", false);
    if (error instanceof PictureRefusal) return failure(error.reason, error.retryable);
    return failure("network", false);
  } finally {
    deadline.dispose();
  }
}

/** Internal: carries a classified outcome out of the attempt without a message. */
class PictureRefusal extends Error {
  constructor(readonly reason: PictureFailureReason, readonly retryable = false) {
    super(reason);
    this.name = "PictureRefusal";
  }
}

function failure(reason: PictureFailureReason, retryable: boolean): PictureRequestResult {
  return Object.freeze({ ok: false, reason, retryable });
}

const invalid = () => new PictureRefusal("invalid-response");

async function refuse(
  response: Response,
  deadline: ReturnType<typeof createRequestDeadline>,
): Promise<never> {
  let payload: unknown;
  try {
    payload = await Promise.race([
      readBoundedJsonResponse(response, MAX_ERROR_RESPONSE_BYTES, deadline.signal),
      deadline.settlement,
    ]);
  } catch {
    // An abort or deadline is classified by the caller before this matters;
    // anything else here is a refusal that is not our envelope.
    throw invalid();
  }
  const envelope = parseErrorEnvelope(payload);
  if (envelope === null) throw invalid();
  throw new PictureRefusal(
    `server-error:${envelope.code}`,
    envelope.retryable && RETRYABLE_STATUSES.has(response.status),
  );
}

async function readPicture(
  response: Response,
  deadline: ReturnType<typeof createRequestDeadline>,
): Promise<GeneratedPicture> {
  const mediaType = (IMAGE_MEDIA_TYPES as readonly string[]).find(
    (candidate) => candidate === response.headers.get("content-type")?.trim().toLowerCase(),
  );
  const declared = response.headers.get("content-length");
  if (
    mediaType === undefined ||
    (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_IMAGE_BYTES))
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw invalid();
  }
  const bytes = await Promise.race([readBytes(response, deadline.signal), deadline.settlement]);
  if (declared !== null && Number(declared) !== bytes.byteLength) throw invalid();

  const meta = parseImageResultMeta({
    mediaType,
    byteLength: bytes.byteLength,
    width: headerInteger(response, IMAGE_RESPONSE_HEADERS.width),
    height: headerInteger(response, IMAGE_RESPONSE_HEADERS.height),
    contentHash: response.headers.get(IMAGE_RESPONSE_HEADERS.sha256),
  });
  if (meta === null) throw invalid();

  let digest: string;
  try {
    digest = await sha256Hex(bytes);
  } catch {
    // Without a digest the bytes cannot be verified, and unverified bytes are refused.
    throw invalid();
  }
  if (digest !== meta.contentHash) throw invalid();

  const structure = inspectImageStructure(bytes, meta.mediaType);
  if (!structure.ok || structure.width !== meta.width || structure.height !== meta.height) {
    throw invalid();
  }
  const pointer = parseImagePointer(meta);
  if (pointer === null) throw invalid();
  return Object.freeze({ bytes, pointer });
}

async function readBytes(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const body = response.body;
  if (body === null) throw invalid();
  if (signal.aborted) {
    void body.cancel(signal.reason).catch(() => undefined);
    signal.throwIfAborted();
  }
  const reader = body.getReader();
  const accumulator = new BoundedByteAccumulator(MAX_IMAGE_BYTES);
  let oversized = false;
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (value === undefined) continue;
      if (!accumulator.append(value)) {
        oversized = true;
        throw invalid();
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (signal.aborted || oversized) cancel();
    reader.releaseLock();
  }
  return accumulator.snapshot();
}

function headerInteger(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  return value !== null && /^\d{1,6}$/u.test(value) ? Number(value) : null;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The image protocol owns no client-side error parser; this reads exactly the
// server's `{ error: { code, message, retryable } }` and keeps only what it needs.
function parseErrorEnvelope(
  value: unknown,
): Readonly<{ code: PictureServerErrorCode; retryable: boolean }> | null {
  if (!isRecord(value) || !hasExactKeys(value, ["error"]) || !isRecord(value.error)) return null;
  const error = value.error;
  if (!hasExactKeys(error, ["code", "message", "retryable"])) return null;
  if (
    typeof error.code !== "string" ||
    !(PICTURE_SERVER_ERROR_CODES as readonly string[]).includes(error.code) ||
    typeof error.message !== "string" ||
    error.message.length === 0 ||
    Array.from(error.message).length > MAX_ERROR_MESSAGE_CODE_POINTS ||
    typeof error.retryable !== "boolean"
  ) return null;
  return { code: error.code as PictureServerErrorCode, retryable: error.retryable };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
