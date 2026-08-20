import {
  MAX_TRANSFORM_REQUEST_BYTES,
  buildTransformPlan,
  parseTransformEnvelope,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import { deriveExpandInPlaceLength } from "../protocol/expand-in-place-policy";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";
import { ScenarioGovernor, runScenario, withRequestSignal, type ScenarioAdapter } from "./harness";
import { admitTransformRequest } from "./transform-admission";
import { TransformServerError, invalidTransformRequest } from "./transform-errors";
import { TRANSFORM_SCENARIO, type TransformScenarioInput } from "./transform-harness";
import { resolveTransformAdapter } from "./transform-provider";

const governor = new ScenarioGovernor();
const TURN_LIMITS = Object.freeze({
  maxConcurrentModelCalls: 2,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});
export const TRANSFORM_ROUTE_TIMEOUT_MS = 14_000;

/**
 * One strict material-turn endpoint. It accepts an envelope, lets the model
 * return text only, then constructs the public replacement plan server-side.
 * The browser must still call `planToTreeCommand` immediately before commit.
 */
export async function handleTransformRequest(
  request: Request,
  adapter: ScenarioAdapter | null = resolveTransformAdapter(),
): Promise<Response> {
  const admission = admitTransformRequest(request);
  if (!admission.ok) throw transformAdmissionError(admission.reason);
  try {
    return await withBoundedJsonRequest(request, TURN_REQUEST_POLICY, async (payload, signal) => {
      const parsed = parseTransformEnvelope(payload);
      if (!parsed.ok) throw invalidTransformRequest(parsed.message);
      const plan = await createTransformPlan(parsed.envelope, adapter, signal);
      return Response.json(plan, { headers: { "Cache-Control": "no-store" } });
    });
  } finally {
    admission.release();
  }
}

export async function createTransformPlan(
  envelope: TransformEnvelope,
  adapter: ScenarioAdapter | null,
  signal: AbortSignal,
): Promise<TransformPlan> {
  const input = scenarioInput(envelope);
  if (input === null) throw invalidTransformRequest("The transform degree cannot produce a bounded target.");
  const outcome = await withRequestSignal(
    runScenario(TRANSFORM_SCENARIO, input, adapter, governor, { limits: TURN_LIMITS, signal }),
    signal,
  );
  if (!outcome.ok) throw transformOutcomeError(outcome.fallback);
  return buildTransformPlan(envelope, outcome.value);
}

export function resetTransformGovernor(): void {
  governor.reset();
}

export function transformErrorResponse(error: unknown): Response {
  const known = error instanceof TransformServerError
    ? error
    : new TransformServerError("TURN_FAILED", "Matter could not change this passage just now.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function scenarioInput(envelope: TransformEnvelope): TransformScenarioInput | null {
  const selectedNode = envelope.context.lineage.at(-1);
  if (selectedNode === undefined) return null;
  const surrounding = Object.freeze({
    before: selectedNode.text.slice(0, envelope.selection.start),
    after: selectedNode.text.slice(envelope.selection.end),
  });
  const length = deriveExpandInPlaceLength(
    envelope.selection.selectedText,
    surrounding.before,
    surrounding.after,
    envelope.gesture.amount,
  );
  if (length === null) return null;
  return Object.freeze({
    locale: envelope.locale,
    passage: envelope.selection.selectedText,
    amount: envelope.gesture.amount,
    length,
    // The selected node is already represented exactly by before/passage/after.
    // Repeating it in lineage wastes context and can make it look authoritative twice.
    lineage: Object.freeze(envelope.context.lineage.slice(0, -1)
      .map((node, depth) => Object.freeze({ depth, text: node.text }))),
    surrounding,
  });
}

function transformOutcomeError(reason: "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY"): TransformServerError {
  if (reason === "MODEL_REJECTED") {
    return new TransformServerError(
      "TURN_REJECTED",
      "Matter could not make a bounded change for this stretch. Adjust it and try again.",
      true,
      422,
      reason,
    );
  }
  return new TransformServerError(
    "TURN_UNAVAILABLE",
    "Matter could not change this passage just now.",
    true,
    reason === "MODEL_BUSY" ? 503 : 503,
    reason,
  );
}

const TURN_REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_TRANSFORM_REQUEST_BYTES,
  timeoutMs: TRANSFORM_ROUTE_TIMEOUT_MS,
  fail: transformBoundaryError,
});

function transformBoundaryError(reason: BoundedRequestFailure): TransformServerError {
  switch (reason) {
    case "too-large":
      return new TransformServerError("INVALID_REQUEST", "The transform request is too large.", false, 413);
    case "unsupported-media-type":
      return new TransformServerError("INVALID_REQUEST", "The transform request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidTransformRequest("The transform content length is invalid.");
    case "missing-body":
      return invalidTransformRequest("The transform request has no body.");
    case "not-json":
      return invalidTransformRequest("The transform request could not be read.");
    case "not-utf8":
      return invalidTransformRequest("The transform request is not valid UTF-8.");
    case "timed-out":
      return new TransformServerError("TURN_FAILED", "The transform timed out.", true, 504);
    case "cancelled":
      return new TransformServerError("TURN_FAILED", "The transform was cancelled.", true, 499);
  }
}

function transformAdmissionError(reason: "ORIGIN" | "RATE" | "BUSY"): TransformServerError {
  if (reason === "ORIGIN") {
    return new TransformServerError("INVALID_REQUEST", "This transform origin is not allowed.", false, 403);
  }
  return new TransformServerError(
    "TURN_UNAVAILABLE",
    reason === "RATE" ? "Please wait before changing this passage again." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
    reason === "RATE" ? "MODEL_BUSY" : "MODEL_BUSY",
  );
}
