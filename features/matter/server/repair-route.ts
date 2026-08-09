import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";
import {
  MAX_REPAIR_REQUEST_BYTES,
  REPAIR_CLIENT_TIMEOUT_MS,
  parseRepairRequest,
} from "../protocol/repair-contract";
import { RepairServerError, invalidRepairRequest } from "./repair-errors";
import { repairTranscript } from "./repair-generator";

/**
 * Parses, delegates, and translates. No repair policy lives here: the route
 * only refuses what it cannot understand and turns a server error into the one
 * stable envelope the browser knows how to read. The request boundary itself is
 * shared with every other route that accepts a body.
 */
export async function handleRepairRequest(request: Request): Promise<Response> {
  return withBoundedJsonRequest(request, REPAIR_REQUEST_POLICY, async (payload, signal) => {
    const parsed = parseRepairRequest(payload);
    if (!parsed.ok) throw invalidRepairRequest(parsed.message);

    return Response.json(await repairTranscript(parsed.request, signal), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}

export function repairErrorResponse(error: unknown): Response {
  const known = error instanceof RepairServerError
    ? error
    : new RepairServerError("REPAIR_FAILED", "The transcript could not be repaired.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

const REPAIR_REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_REPAIR_REQUEST_BYTES,
  timeoutMs: REPAIR_CLIENT_TIMEOUT_MS,
  fail: repairBoundaryError,
});

function repairBoundaryError(reason: BoundedRequestFailure): RepairServerError {
  switch (reason) {
    case "too-large":
      return new RepairServerError("INVALID_REQUEST", "The repair request is too large.", false, 413);
    case "unsupported-media-type":
      return new RepairServerError("INVALID_REQUEST", "The repair request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidRepairRequest("The content length is invalid.");
    case "missing-body":
      return invalidRepairRequest("The repair request has no body.");
    case "not-json":
      return invalidRepairRequest("The repair request could not be read.");
    case "not-utf8":
      return invalidRepairRequest("The repair request is not valid UTF-8.");
    case "timed-out":
      return new RepairServerError("REPAIR_FAILED", "The repair request timed out.", true, 504);
    case "cancelled":
      return new RepairServerError("REPAIR_FAILED", "The repair request was cancelled.", true, 499);
  }
}
