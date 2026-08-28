import {
  MAX_TEXT_SWAP_REQUEST_BYTES,
  buildTextSwapPlan,
  parseTextSwapEnvelope,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";
import { MODEL_DEADLINES } from "../config/model-deadlines";
import { deriveTextSwapLength } from "../protocol/text-swap-policy";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
  type ScenarioObservation,
} from "./harness";
import {
  classifyMaterialTurnFailure,
  createMaterialTurnObservationOwner,
  jsonByteLength,
  type MaterialTurnObservationOptions,
} from "./material-turn-observation";
import { admitTransformRequest } from "./transform-admission";
import { TextSwapServerError, invalidTextSwapRequest } from "./text-swap-errors";
import { TEXT_SWAP_SCENARIO, type TextSwapScenarioInput } from "./text-swap-harness";
import { resolveTextSwapAdapter } from "./text-swap-provider";

const governor = new ScenarioGovernor();
const TURN_LIMITS = Object.freeze({
  maxConcurrentModelCalls: 2,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});
export const TEXT_SWAP_ROUTE_TIMEOUT_MS = MODEL_DEADLINES.textSwap.routeMs;

export async function handleTextSwapRequest(
  request: Request,
  adapter: ScenarioAdapter | null = resolveTextSwapAdapter(),
  observationOptions: MaterialTurnObservationOptions = {},
): Promise<Response> {
  // Swap and fixed expand share one public generative-mutation perimeter while
  // keeping separate protocol, provider switch, scenario health, and prompt.
  const observation = createMaterialTurnObservationOwner("paraphrase-in-place", observationOptions);
  let admissionReason: "ORIGIN" | "RATE" | "BUSY" | undefined;
  try {
    const admission = admitTransformRequest(request);
    if (!admission.ok) {
      admissionReason = admission.reason;
      throw admissionError(admission.reason);
    }
    try {
      return await withBoundedJsonRequest(request, REQUEST_POLICY, async (payload, signal, metadata) => {
        observation.noteRequestBytes(metadata.requestBytes);
        const parsed = parseTextSwapEnvelope(payload);
        if (!parsed.ok) throw invalidTextSwapRequest(parsed.message);
        const input = scenarioInput(parsed.envelope);
        if (input === null) {
          throw invalidTextSwapRequest("The text swap cannot fit inside the material bounds.");
        }
        observation.noteBasis({
          locale: input.locale,
          amount: "tool-owned",
          targetGraphemes: input.length.maximumAcceptedGraphemes,
        });
        const plan = await createTextSwapPlanFromInput(
          parsed.envelope,
          input,
          adapter,
          signal,
          observation.noteScenario,
        );
        const response = Response.json(plan, { headers: { "Cache-Control": "no-store" } });
        observation.settle({ outcome: "success", reason: "NONE", responseBytes: jsonByteLength(plan) });
        return response;
      });
    } finally {
      admission.release();
    }
  } catch (error) {
    const terminal = classifyMaterialTurnFailure({
      ...(admissionReason === undefined ? {} : { admissionReason }),
      cancelled: error instanceof DOMException && error.name === "AbortError",
      ...(error instanceof TextSwapServerError ? { serverError: error } : {}),
    });
    observation.settle({
      ...terminal,
      ...(terminal.outcome === "cancelled" ? {} : { responseBytes: textSwapErrorByteLength(error) }),
    });
    throw error;
  }
}

export async function createTextSwapPlan(
  envelope: TextSwapEnvelope,
  adapter: ScenarioAdapter | null,
  signal: AbortSignal,
): Promise<TextSwapPlan> {
  const input = scenarioInput(envelope);
  if (input === null) throw invalidTextSwapRequest("The text swap cannot fit inside the material bounds.");
  return createTextSwapPlanFromInput(envelope, input, adapter, signal);
}

async function createTextSwapPlanFromInput(
  envelope: TextSwapEnvelope,
  input: TextSwapScenarioInput,
  adapter: ScenarioAdapter | null,
  signal: AbortSignal,
  observe?: (observation: ScenarioObservation) => void,
): Promise<TextSwapPlan> {
  const outcome = await withRequestSignal(
    runScenario(TEXT_SWAP_SCENARIO, input, adapter, governor, {
      limits: TURN_LIMITS,
      signal,
      ...(observe === undefined ? {} : { observe }),
    }),
    signal,
  );
  if (!outcome.ok) throw outcomeError(outcome.fallback);
  return buildTextSwapPlan(envelope, outcome.value);
}

export function resetTextSwapGovernor(): void {
  governor.reset();
}

export function textSwapErrorResponse(error: unknown): Response {
  const known = normalizeTextSwapError(error);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeTextSwapError(error: unknown): TextSwapServerError {
  return error instanceof TextSwapServerError
    ? error
    : new TextSwapServerError("TURN_FAILED", "Matter could not swap this passage just now.", true, 500);
}

function textSwapErrorByteLength(error: unknown): number {
  return jsonByteLength(normalizeTextSwapError(error).envelope());
}

function scenarioInput(envelope: TextSwapEnvelope): TextSwapScenarioInput | null {
  const selectedNode = envelope.context.lineage.at(-1);
  if (selectedNode === undefined) return null;
  const surrounding = Object.freeze({
    before: selectedNode.text.slice(0, envelope.selection.start),
    after: selectedNode.text.slice(envelope.selection.end),
  });
  const length = deriveTextSwapLength(envelope.selection.selectedText, surrounding.before, surrounding.after);
  if (length === null) return null;
  return Object.freeze({
    locale: envelope.locale,
    passage: envelope.selection.selectedText,
    direction: envelope.direction.text,
    length,
    lineage: Object.freeze(envelope.context.lineage.slice(0, -1)
      .map((node, depth) => Object.freeze({ depth, text: node.text }))),
    surrounding,
  });
}

function outcomeError(reason: "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY"): TextSwapServerError {
  if (reason === "MODEL_REJECTED") {
    return new TextSwapServerError(
      "TURN_REJECTED",
      "Matter could not make a bounded wording change. Try another direction.",
      true,
      422,
      reason,
    );
  }
  return new TextSwapServerError(
    "TURN_UNAVAILABLE",
    "Matter could not swap this passage just now.",
    true,
    503,
    reason,
  );
}

const REQUEST_POLICY: BoundedRequestPolicy = Object.freeze({
  maxBytes: MAX_TEXT_SWAP_REQUEST_BYTES,
  timeoutMs: TEXT_SWAP_ROUTE_TIMEOUT_MS,
  fail: boundaryError,
});

function boundaryError(reason: BoundedRequestFailure): TextSwapServerError {
  switch (reason) {
    case "too-large":
      return new TextSwapServerError("INVALID_REQUEST", "The text swap request is too large.", false, 413);
    case "unsupported-media-type":
      return new TextSwapServerError("INVALID_REQUEST", "The text swap request format is invalid.", false, 415);
    case "invalid-content-length":
      return invalidTextSwapRequest("The text swap content length is invalid.");
    case "missing-body":
      return invalidTextSwapRequest("The text swap request has no body.");
    case "not-json":
      return invalidTextSwapRequest("The text swap request could not be read.");
    case "not-utf8":
      return invalidTextSwapRequest("The text swap request is not valid UTF-8.");
    case "timed-out":
      return new TextSwapServerError("TURN_FAILED", "The text swap timed out.", true, 504);
    case "cancelled":
      return new TextSwapServerError("TURN_FAILED", "The text swap was cancelled.", true, 499);
  }
}

function admissionError(reason: "ORIGIN" | "RATE" | "BUSY"): TextSwapServerError {
  if (reason === "ORIGIN") {
    return new TextSwapServerError("INVALID_REQUEST", "This text swap origin is not allowed.", false, 403);
  }
  return new TextSwapServerError(
    "TURN_UNAVAILABLE",
    reason === "RATE" ? "Please wait before swapping this passage again." : "Matter is busy. Please try again shortly.",
    true,
    reason === "RATE" ? 429 : 503,
    "MODEL_BUSY",
  );
}
