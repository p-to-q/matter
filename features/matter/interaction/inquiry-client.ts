import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  MAX_INQUIRY_RESPONSE_BYTES,
  parseInquiryAnswer,
  parseInquiryError,
  type InquiryContextPayload,
} from "../protocol/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { clientMatterBasePath } from "../config/base-path";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline } from "./request-deadline";

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
  const deadline = createRequestDeadline(
    input.signal,
    INQUIRY_CLIENT_TIMEOUT_MS,
    "The inquiry timed out.",
  );
  const requestId = input.requestId ?? createInquiryRequestId();

  try {
    // AbortSignal is advisory to an injected transport. The explicit race
    // keeps the browser deadline authoritative even when a relay ignores it.
    const response = await Promise.race([
      fetchImpl(input.endpoint ?? `${clientMatterBasePath()}/api/inquiry`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          question: input.question,
          locale: input.locale,
          context: input.context,
        }),
        cache: "no-store",
        redirect: "error",
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
    const payload = await Promise.race([
      readBoundedJsonResponse(
        response,
        MAX_INQUIRY_RESPONSE_BYTES,
        deadline.signal,
      ),
      deadline.settlement,
    ]);
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
    return deadline.didTimeout() ? TIMED_OUT : UNREACHABLE;
  } finally {
    deadline.dispose();
  }
}

export function createInquiryRequestId(): string {
  const runtimeCrypto = typeof globalThis.crypto === "undefined"
    ? undefined
    : globalThis.crypto as unknown as Readonly<{
      randomUUID?: () => string;
      getRandomValues?: (array: Uint32Array) => Uint32Array;
    }>;
  if (typeof runtimeCrypto?.randomUUID === "function") {
    return `inquiry_${runtimeCrypto.randomUUID().replaceAll("-", "")}`;
  }
  if (typeof runtimeCrypto?.getRandomValues === "function") {
    const words = runtimeCrypto.getRandomValues(new Uint32Array(4));
    return `inquiry_${Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("")}`;
  }
  fallbackInquirySequence = fallbackInquirySequence >= Number.MAX_SAFE_INTEGER
    ? 1
    : fallbackInquirySequence + 1;
  return `inquiry_${Date.now().toString(36)}_${fallbackInquirySequence.toString(36)}_${Math.random().toString(36).slice(2)}`;
}

let fallbackInquirySequence = 0;

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
