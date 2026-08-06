import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  type InquiryAnswer,
  type InquiryContextPayload,
} from "../server/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { clientMatterBasePath } from "../config/base-path";

/**
 * The browser half of the inquiry boundary. It parses the response rather than
 * trusting it, and it turns every failure — network, deadline, malformed body —
 * into one of the same stated outcomes the server uses. The caller therefore
 * never has to guess whether silence meant "no model" or "no connection".
 */

export type InquiryOutcome =
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryClientReason }>;

export type InquiryClientReason =
  | "NO_PROVIDER"
  | "NO_MATERIAL"
  /** The request never completed: offline, refused, or out of time. */
  | "UNREACHABLE";

export type AskInquiryInput = Readonly<{
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
  input.signal?.addEventListener("abort", relay, { once: true });

  try {
    const response = await fetchImpl(input.endpoint ?? `${clientMatterBasePath()}/api/inquiry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        question: input.question,
        locale: input.locale,
        context: input.context,
      }),
      signal: boundary.signal,
    });
    if (!response.ok) return UNREACHABLE;
    return readAnswer(await response.json() as unknown);
  } catch {
    // Every failure here is the same fact to a reader: the question did not
    // reach an answer. The distinctions live in the server's own logs.
    return UNREACHABLE;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", relay);
  }
}

function readAnswer(payload: unknown): InquiryOutcome {
  if (typeof payload !== "object" || payload === null) return UNREACHABLE;
  const answer = payload as Partial<InquiryAnswer>;
  if (answer.status === "answered") {
    const text = (answer as { text?: unknown }).text;
    return typeof text === "string" && text.trim().length > 0
      ? Object.freeze({ status: "answered", text })
      : UNREACHABLE;
  }
  if (answer.status === "unavailable") {
    const reason = (answer as { reason?: unknown }).reason;
    return reason === "NO_PROVIDER" || reason === "NO_MATERIAL"
      ? Object.freeze({ status: "unavailable", reason })
      : UNREACHABLE;
  }
  return UNREACHABLE;
}

const UNREACHABLE: InquiryOutcome = Object.freeze({
  status: "unavailable",
  reason: "UNREACHABLE",
});
