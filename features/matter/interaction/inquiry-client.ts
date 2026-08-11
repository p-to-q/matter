import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  MAX_INQUIRY_RESPONSE_BYTES,
  parseInquiryAnswer,
  parseInquiryError,
  type InquiryContextPayload,
} from "../protocol/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { clientMatterBasePath } from "../config/base-path";

export type InquiryOutcome =
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryClientReason }>;

export type InquiryClientReason =
  | "NO_PROVIDER"
  | "NO_MATERIAL"
  | "RATE_LIMITED"
  | "BUSY"
  | "TIMED_OUT"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNREACHABLE";

export type AskInquiryInput = Readonly<{
  requestId?: string;
  question: string;
  locale: string;
  context: InquiryContextPayload;
  signal?: AbortSignal;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}>;

export async function askInquiry(input: AskInquiryInput): Promise<InquiryOutcome> {
  if (input.signal?.aborted) return UNREACHABLE;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const boundary = new AbortController();
  const timeout = setTimeout(() => boundary.abort(), INQUIRY_CLIENT_TIMEOUT_MS);
  const relay = () => boundary.abort();
  const requestId = input.requestId ?? createInquiryRequestId();
  input.signal?.addEventListener("abort", relay, { once: true });

  try {
    const response = await fetchImpl(input.endpoint ?? `${clientMatterBasePath()}/api/inquiry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        question: input.question,
        locale: input.locale,
        context: input.context,
      }),
      signal: boundary.signal,
    });
    const payload = await readBoundedJson(response);
    // A refused question was still sent, so it must not be reported as unsent.
    // The route's prose is intentionally discarded: only a strict, closed
    // receipt may select localized interface copy.
    if (!response.ok) return refusalOutcome(response.status, payload);
    const answer = parseInquiryAnswer(payload, requestId, input.context);
    if (answer === null) return UNREACHABLE;
    return answer.status === "answered"
      ? Object.freeze({ status: "answered", text: answer.text })
      : Object.freeze({ status: "unavailable", reason: answer.reason });
  } catch {
    return UNREACHABLE;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", relay);
  }
}

function createInquiryRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `inquiry_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `inquiry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

const UNREACHABLE: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "UNREACHABLE",
});

const RATE_LIMITED: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "RATE_LIMITED",
});

const BUSY: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "BUSY",
});

const TIMED_OUT: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "TIMED_OUT",
});

const TEMPORARILY_UNAVAILABLE: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "TEMPORARILY_UNAVAILABLE",
});

/**
 * Only a strict Matter envelope proves that the application received the
 * question. A legacy, proxy-authored, oversized, or malformed error fails
 * closed to UNREACHABLE even when its HTTP status happens to be 429 or 503.
 */
function refusalOutcome(status: number, payload: unknown): InquiryOutcome {
  const receipt = parseInquiryError(payload);
  if (receipt === null || receipt.code !== "INQUIRY_FAILED" || !receipt.retryable) {
    return UNREACHABLE;
  }
  if (status === 429 && receipt.fallbackReason === undefined) return RATE_LIMITED;
  if (status === 504 && receipt.fallbackReason === undefined) return TIMED_OUT;
  if (status !== 503) return UNREACHABLE;
  switch (receipt.fallbackReason) {
    case undefined:
    case "MODEL_BUSY":
      return BUSY;
    case "MODEL_TIMEOUT":
      return TIMED_OUT;
    case "MODEL_UNAVAILABLE":
    case "MODEL_REJECTED":
      return TEMPORARILY_UNAVAILABLE;
  }
  return UNREACHABLE;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_INQUIRY_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("The inquiry response is too large.");
  }
  const body = response.body;
  if (body === null) throw new Error("The inquiry response has no body.");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_INQUIRY_RESPONSE_BYTES) {
        throw new Error("The inquiry response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (total > MAX_INQUIRY_RESPONSE_BYTES) await body.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged)) as unknown;
}
