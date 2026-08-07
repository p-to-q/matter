import {
  TRANSCRIPT_REPAIR_PROMPT_VERSION,
  decideRepairRequest,
  normalizeRepairInput,
  type NormalizedRepairInput,
} from "../material/transcript-repair";
import { normalizeAdmittedTranscript } from "../runtime/transcript-punctuation";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
  type ScenarioGovernorLimits,
} from "./harness";
import { resolvePoolAdapter } from "./model-pool";
import type {
  RepairFallbackReason,
  RepairRequest,
  RepairSuccess,
} from "./repair-contract";
import { REPAIR_SCENARIO } from "./repair-harness";

/**
 * Settles one repair request.
 *
 * The floor is the words as heard, and it is never far away: this module's only
 * job is to decide whether asking is worth it, ask through the shared harness,
 * and settle either way. There is no cache and no request coalescing, unlike
 * labelling — two people never say the same sentence twice, so a cache here
 * would hold memory and answer nothing.
 */

export type RepairGeneratorLimits = ScenarioGovernorLimits;

export const DEFAULT_REPAIR_LIMITS: RepairGeneratorLimits = Object.freeze({
  maxConcurrentModelCalls: 4,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});

const governor = new ScenarioGovernor();

export function resetRepairGeneratorState(): void {
  governor.reset();
}

export async function repairTranscript(
  request: RepairRequest,
  requestSignal: AbortSignal,
  adapter: ScenarioAdapter | null = resolveRepairAdapter(),
  limits: RepairGeneratorLimits = DEFAULT_REPAIR_LIMITS,
  now: () => number = Date.now,
): Promise<RepairSuccess> {
  const input = normalizeRepairInput({
    text: request.text,
    locale: request.locale,
    vocabulary: request.vocabulary,
  });
  if (!decideRepairRequest(input)) {
    return settle(request, input.text, "verbatim", "NOT_WORTH_ASKING");
  }

  const outcome = await withRequestSignal(
    runScenario(REPAIR_SCENARIO, input, adapter, governor, { now, limits }),
    requestSignal,
  );
  return outcome.ok
    ? settle(request, outcome.value, "model")
    : settle(request, input.text, "verbatim", outcome.fallback);
}

/**
 * Proves the whole model path without a provider. The fixture returns the
 * deterministic normalization the browser would have applied anyway, so the
 * wire, the adjudication, and the admission path are all exercised while the
 * admitted material stays exactly what a fixture run is expected to produce.
 * `MATTER_FIXTURE_REPAIR` pins one answer for a deterministic browser test.
 */
export const fixtureRepairAdapter: ScenarioAdapter = async (call) => {
  const configured = process.env.MATTER_FIXTURE_REPAIR;
  if (configured !== undefined) return { text: configured };
  const input = call.input as NormalizedRepairInput;
  return { text: normalizeAdmittedTranscript(input.text) };
};

export function resolveRepairAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  const configured = environment.MATTER_REPAIR_ADAPTER;
  if (configured === "off") return null;
  if (configured === "live") return resolvePoolAdapter(environment);
  if (configured === "fixture" || (configured === undefined && environment.NODE_ENV !== "production")) {
    return fixtureRepairAdapter;
  }
  return null;
}

function settle(
  request: RepairRequest,
  text: string,
  source: "verbatim" | "model",
  fallbackReason?: RepairFallbackReason,
): RepairSuccess {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
    operationId: request.operationId,
    attempt: request.attempt,
    text,
    source,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}
