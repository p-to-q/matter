import {
  LABEL_CLIENT_TIMEOUT_MS,
  MAX_LABEL_REQUEST_BYTES,
  parseLabelRequest,
} from "../protocol/label-contract";
import { LabelServerError, invalidLabelRequest } from "./label-errors";
import { generateLabel } from "./label-generator";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";

/**
 * Parses, delegates, and translates. No labelling policy lives here: the route
 * only refuses what it cannot understand and turns a server error into the one
 * stable envelope the browser knows how to read. The request boundary itself is
 * shared with every other route that accepts a body.
 */
export async function handleLabelRequest(request: Request): Promise<Response> {
  return withBoundedJsonRequest(request, LABEL_REQUEST_POLICY, async (payload, signal) => {
    const parsed = parseLabelRequest(payload);
    if (!parsed.ok) throw invalidLabelRequest(parsed.message);

    return Response.json(await generateLabel(parsed.request, signal), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}

export function labelErrorResponse(error: unknown): Response {
  const known = error instanceof LabelServerError
    ? error
    : new LabelServerError("LABEL_FAILED", "The label could not be derived.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

const LABEL_REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_LABEL_REQUEST_BYTES,
  timeoutMs: LABEL_CLIENT_TIMEOUT_MS,
  fail: labelBoundaryError,
});

function labelBoundaryError(reason: BoundedRequestFailure): LabelServerError {
  switch (reason) {
    case "too-large":
      return new LabelServerError("INVALID_REQUEST", "The label request is too large.", false, 413);
    case "unsupported-media-type":
      return new LabelServerError("INVALID_REQUEST", "The label request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidLabelRequest("The content length is invalid.");
    case "missing-body":
      return invalidLabelRequest("The label request has no body.");
    case "not-json":
      return invalidLabelRequest("The label request could not be read.");
    case "not-utf8":
      return invalidLabelRequest("The label request is not valid UTF-8.");
    case "timed-out":
      return new LabelServerError("LABEL_FAILED", "The label request timed out.", true, 504);
    case "cancelled":
      return new LabelServerError("LABEL_FAILED", "The label request was cancelled.", true, 499);
  }
}
