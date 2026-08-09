import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { clientMatterBasePath } from "../config/base-path";
import {
  LABEL_CLIENT_TIMEOUT_MS,
  MAX_LABEL_RESPONSE_BYTES,
  isLabelSuccess,
  type LabelBasis,
  type LabelErrorCode,
  type LabelReference,
  type LabelSuccess,
} from "../protocol/label-contract";
import { PROTOCOL_VERSION } from "../tree/model";

export class LabelClientError extends Error {
  constructor(
    readonly code: LabelErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LabelClientError";
  }
}

export type LabelRequestInput = Readonly<{
  operationId: string;
  basis: LabelBasis;
  locale: string;
  maxGraphemes: number;
  text: string;
  reference: LabelReference;
  signal: AbortSignal;
  timeoutMs?: number;
}>;

/**
 * Asks the server to improve one label. The caller already has a label on
 * screen, so this boundary is allowed to fail: the deadline is short, there is
 * no retry, and a rejected or unreadable answer is simply not applied.
 */
export async function requestLabel(input: LabelRequestInput): Promise<LabelSuccess> {
  const body = JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    operationId: input.operationId,
    basis: input.basis,
    locale: input.locale,
    maxGraphemes: input.maxGraphemes,
    text: input.text,
    reference: input.reference,
  });
  const deadline = withDeadline(input.signal, input.timeoutMs ?? LABEL_CLIENT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await Promise.race([
      fetch(`${clientMatterBasePath()}/api/label`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body,
        cache: "no-store",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
  } catch (error) {
    if (deadline.didTimeout()) {
      throw new LabelClientError("LABEL_FAILED", "The label request timed out.", true);
    }
    if (input.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new LabelClientError("LABEL_UNAVAILABLE", "Label generation is unavailable.", true);
  } finally {
    deadline.dispose();
  }

  const text = await readBoundedText(response, MAX_LABEL_RESPONSE_BYTES);
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new LabelClientError("LABEL_FAILED", "The label response could not be read.", true);
  }
  if (!response.ok) throw parseErrorEnvelope(payload);
  if (!isLabelSuccess(payload, {
    operationId: input.operationId,
    basis: input.basis,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
  })) {
    throw new LabelClientError("LABEL_FAILED", "The label response was invalid.", false);
  }
  return payload;
}

/**
 * Reads at most `maxBytes` and refuses malformed UTF-8. A replacement character
 * would turn a broken response into a plausible-looking label.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new LabelClientError("LABEL_FAILED", "The label response is too large.", false);
  }
  const body = response.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new LabelClientError("LABEL_FAILED", "The label response is too large.", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (total > maxBytes) await body.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    throw new LabelClientError("LABEL_FAILED", "The label response was not valid UTF-8.", false);
  }
}

function withDeadline(parent: AbortSignal, timeoutMs: number): {
  signal: AbortSignal;
  settlement: Promise<never>;
  didTimeout: () => boolean;
  dispose: () => void;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new LabelClientError("INVALID_REQUEST", "The label timeout is invalid.", false);
  }
  const controller = new AbortController();
  let timedOut = false;
  let rejectSettlement!: (reason: unknown) => void;
  const settlement = new Promise<never>((_resolve, reject) => {
    rejectSettlement = reject;
  });
  settlement.catch(() => undefined);

  const abortFromParent = () => {
    controller.abort(parent.reason);
    rejectSettlement(parent.reason ?? new DOMException("Aborted", "AbortError"));
  };
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("The label request timed out.", "TimeoutError");
    controller.abort(reason);
    rejectSettlement(reason);
  }, timeoutMs);

  return {
    signal: controller.signal,
    settlement,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}

function parseErrorEnvelope(payload: unknown): LabelClientError {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error !== null &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    "message" in payload.error &&
    "retryable" in payload.error &&
    typeof payload.error.message === "string" &&
    typeof payload.error.retryable === "boolean" &&
    isLabelErrorCodeValue(payload.error.code)
  ) {
    return new LabelClientError(payload.error.code, payload.error.message, payload.error.retryable);
  }
  return new LabelClientError("LABEL_FAILED", "The label could not be derived.", true);
}

function isLabelErrorCodeValue(value: unknown): value is LabelErrorCode {
  return value === "INVALID_REQUEST" || value === "LABEL_UNAVAILABLE" || value === "LABEL_FAILED";
}
