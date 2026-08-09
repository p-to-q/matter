import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  MAX_INQUIRY_REQUEST_BYTES,
  inquiryBasis,
  inquiryReceipt,
  parseInquiryRequest,
  type InquiryAnswer,
  type InquiryRequest,
} from "../protocol/inquiry-contract";
import { InquiryServerError, invalidInquiryRequest } from "./inquiry-errors";
import { resolveInquiryAdapter } from "./inquiry-provider";
import { INQUIRY_SCENARIO } from "./inquiry-harness";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
} from "./harness";
import { admitInquiryRequest } from "./inquiry-admission";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";

export async function handleInquiryRequest(
  request: Request,
  adapter: ScenarioAdapter | null = resolveInquiryAdapter(),
): Promise<Response> {
  const admission = admitInquiryRequest(request);
  if (!admission.ok) throw inquiryAdmissionError(admission.reason);
  try {
    return await withBoundedJsonRequest(request, INQUIRY_REQUEST_POLICY, async (payload, signal) => {
      const parsed = parseInquiryRequest(payload);
      if (!parsed.ok) throw invalidInquiryRequest(parsed.message);
      return Response.json(await answerInquiry(parsed.request, adapter, signal), {
        headers: { "Cache-Control": "no-store" },
      });
    });
  } finally {
    admission.release();
  }
}

/**
 * Provider ownership stays here. Until a memory/model adapter is configured,
 * the UI receives a stated unavailable reason rather than invented prose.
 */
export async function answerInquiry(
  request: InquiryRequest,
  adapter: ScenarioAdapter | null,
  signal: AbortSignal,
): Promise<InquiryAnswer> {
  const receipt = inquiryReceipt(request.context);
  const basis = inquiryBasis(request);
  if (receipt.lineageNodes === 0) {
    return Object.freeze({ protocolVersion: request.protocolVersion, basis, status: "unavailable", reason: "NO_MATERIAL", receipt });
  }
  if (adapter === null) {
    return Object.freeze({ protocolVersion: request.protocolVersion, basis, status: "unavailable", reason: "NO_PROVIDER", receipt });
  }
  const outcome = await withRequestSignal(
    runScenario(INQUIRY_SCENARIO, request, adapter, inquiryGovernor, {
      limits: INQUIRY_LIMITS,
      signal,
    }),
    signal,
  );
  // Unlike labelling and repair, an unanswered inquiry has no floor to fall back
  // to: the person asked a question and is owed either an answer or the fact
  // that there is none. It is the one scenario whose failure is visible.
  if (!outcome.ok) {
    throw new InquiryServerError(
      "INQUIRY_FAILED",
      "Matter could not answer just now.",
      true,
      503,
      outcome.fallback,
    );
  }
  return Object.freeze({ protocolVersion: request.protocolVersion, basis, status: "answered", text: outcome.value, receipt });
}

/** Shared across requests: one cooling provider should not be paid for twice. */
const inquiryGovernor = new ScenarioGovernor();
const INQUIRY_LIMITS = Object.freeze({
  maxConcurrentModelCalls: 3,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});

export function resetInquiryGovernor(): void {
  inquiryGovernor.reset();
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

function inquiryAdmissionError(reason: "ORIGIN" | "RATE" | "BUSY"): InquiryServerError {
  if (reason === "ORIGIN") {
    return new InquiryServerError("INVALID_REQUEST", "This inquiry origin is not allowed.", false, 403);
  }
  return new InquiryServerError(
    "INQUIRY_FAILED",
    reason === "RATE" ? "Please wait before asking again." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
  );
}
