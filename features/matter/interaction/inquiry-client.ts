import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  parseInquiryAnswer,
  type InquiryContextPayload,
} from "../server/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { clientMatterBasePath } from "../config/base-path";

export type InquiryOutcome =
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryClientReason }>;

export type InquiryClientReason = "NO_PROVIDER" | "NO_MATERIAL" | "UNREACHABLE";

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
    if (!response.ok) return UNREACHABLE;
    const answer = parseInquiryAnswer(await response.json() as unknown, requestId, input.context);
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
