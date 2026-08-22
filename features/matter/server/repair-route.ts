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
import { createPublicRequestAdmission } from "./public-request-admission";

/**
 * Parses, delegates, and translates. No repair policy lives here: the route
 * only refuses what it cannot understand and turns a server error into the one
 * stable envelope the browser knows how to read. The request boundary itself is
 * shared with every other route that accepts a body.
 */
export async function handleRepairRequest(request: Request): Promise<Response> {
  const admission = repairAdmission.admit(request);
  if (!admission.ok) throw repairAdmissionError(admission.reason);
  try {
    return await withBoundedJsonRequest(request, REPAIR_REQUEST_POLICY, async (payload, signal) => {
      const parsed = parseRepairRequest(payload);
      if (!parsed.ok) throw invalidRepairRequest(parsed.message);

      return Response.json(await repairTranscript(parsed.request, signal), {
        headers: { "Cache-Control": "no-store" },
      });
    });
  } finally {
    admission.release();
  }
}

const repairAdmission = createPublicRequestAdmission({ requestsPerWindow: 12, maxConcurrent: 4 });

export function resetRepairAdmissionForTests(): void {
  repairAdmission.resetForTests();
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

function repairAdmissionError(reason: "ORIGIN" | "RATE" | "BUSY"): RepairServerError {
  if (reason === "ORIGIN") {
    return new RepairServerError("INVALID_REQUEST", "This repair origin is not allowed.", false, 403);
  }
  return new RepairServerError(
    "REPAIR_FAILED",
    reason === "RATE" ? "Please wait before repairing another transcript." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
  );
}
