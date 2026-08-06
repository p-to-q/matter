import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  MAX_INQUIRY_REQUEST_BYTES,
  inquiryReceipt,
  parseInquiryRequest,
  type InquiryAnswer,
  type InquiryRequest,
} from "./inquiry-contract";
import { InquiryServerError, invalidInquiryRequest } from "./inquiry-errors";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";

/**
 * Parses, decides, and translates. The question is read, answered against the
 * context it carried, and then dropped: nothing here writes it to a log, a
 * store, or a third party. That is the whole reason this route exists rather
 * than the browser talking to a provider itself.
 */
export async function handleInquiryRequest(request: Request): Promise<Response> {
  return withBoundedJsonRequest(request, INQUIRY_REQUEST_POLICY, async (payload) => {
    const parsed = parseInquiryRequest(payload);
    if (!parsed.ok) throw invalidInquiryRequest(parsed.message);

    return Response.json(answerInquiry(parsed.request), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}

/**
 * The whole answering policy, in one readable place.
 *
 * No provider is configured in any deployment today, so every question resolves
 * to a stated reason rather than prose. The receipt is still real: it reports
 * what this request actually carried, which is the difference between "nothing
 * happened" and "nothing was ever going to happen". When a provider is wired
 * in, it replaces this branch and nothing else has to move.
 */
export function answerInquiry(request: InquiryRequest): InquiryAnswer {
  const receipt = inquiryReceipt(request.context);
  if (receipt.lineageNodes === 0) {
    return Object.freeze({ status: "unavailable", reason: "NO_MATERIAL", receipt });
  }
  return Object.freeze({ status: "unavailable", reason: "NO_PROVIDER", receipt });
}

export function inquiryErrorResponse(error: unknown): Response {
  const known = error instanceof InquiryServerError
    ? error
    : new InquiryServerError("INQUIRY_FAILED", "The inquiry could not be answered.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

const INQUIRY_REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_INQUIRY_REQUEST_BYTES,
  timeoutMs: INQUIRY_CLIENT_TIMEOUT_MS,
  fail: inquiryBoundaryError,
});

function inquiryBoundaryError(reason: BoundedRequestFailure): InquiryServerError {
  switch (reason) {
    case "too-large":
      return new InquiryServerError("INVALID_REQUEST", "The inquiry request is too large.", false, 413);
    case "unsupported-media-type":
      return new InquiryServerError("INVALID_REQUEST", "The inquiry request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidInquiryRequest("The content length is invalid.");
    case "missing-body":
      return invalidInquiryRequest("The inquiry request has no body.");
    case "not-json":
      return invalidInquiryRequest("The inquiry request could not be read.");
    case "not-utf8":
      return invalidInquiryRequest("The inquiry request is not valid UTF-8.");
    case "timed-out":
      return new InquiryServerError("INQUIRY_FAILED", "The inquiry timed out.", true, 504);
    case "cancelled":
      return new InquiryServerError("INQUIRY_FAILED", "The inquiry was cancelled.", true, 499);
  }
}
