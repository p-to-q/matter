import {
  TRANSCRIPT_REPAIR_PROMPT_VERSION,
  decideRepairRequest,
  normalizeRepairInput,
  type NormalizedRepairInput,
} from "../material/transcript-repair";
import { repairAdmittedTranscriptWords } from "../runtime/transcript-punctuation";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
  type ScenarioGovernorLimits,
} from "./harness";
import { DEFAULT_POOL_LIMITS, resolvePoolAdapter } from "./model-pool";
import type {
  RepairFallbackReason,
  RepairRequest,
  RepairSuccess,
} from "../protocol/repair-contract";
import { REPAIR_SCENARIO } from "./repair-harness";

/**
 * Settles one repair request.
 *
 * The floor is the request text, and it is never far away: this module's only
 * job is to decide whether asking is worth it, ask through the shared harness,
 * and settle either way. There is no cache and no request coalescing, unlike
 * labelling — two people never say the same sentence twice, so a cache here
 * would retain user language and answer almost nothing.
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
  });
  if (!decideRepairRequest(input)) {
    return settle(request, input.text, "verbatim", "NOT_WORTH_ASKING");
  }

  const outcome = await withRequestSignal(
    runScenario(REPAIR_SCENARIO, input, adapter, governor, {
      now,
      limits,
      signal: requestSignal,
    }),
    requestSignal,
  );
  return outcome.ok
    ? settle(request, outcome.value, "model")
    : settle(request, input.text, "verbatim", outcome.fallback);
}

/**
 * Proves the whole model path without a provider. The fixture returns the
 * deterministic late-repair floor, so the wire and adjudication are exercised
 * against the same conservative rule result as the browser-local port.
 * `MATTER_FIXTURE_REPAIR` pins one answer for a deterministic browser test.
 */
export const fixtureRepairAdapter: ScenarioAdapter = async (call) => {
  const configured = process.env.MATTER_FIXTURE_REPAIR;
  if (configured !== undefined) return { text: configured };
  const input = call.input as NormalizedRepairInput;
  return { text: repairAdmittedTranscriptWords(input.text, input.locale) };
};

/**
 * Repair spends one usable provider window instead of buying two windows that
 * are both shorter than this prompt can finish in. A fast refusal or transport
 * failure still leaves almost the whole deadline for the next candidate; only
 * a relay that consumes the useful window prevents a same-request fallback.
 * That stalled candidate is cooled by the pool before a nearby request.
 *
 * The person's deterministic transcript is already visible and remains the
 * safe floor, so this scenario-specific allocation is preferable to widening
 * the twelve-second mutation lease or making every pool-backed surface wait.
 */
export const REPAIR_POOL_LIMITS = Object.freeze({
  ...DEFAULT_POOL_LIMITS,
  // The fastest historical Repair completion was about 0.9 s. A smaller tail
  // is not a fallback; it can only time out and cool a candidate that never
  // received a usable opportunity.
  minimumAttemptMs: 1_000,
  maxAttemptShare: 0.95,
});

export function resolveRepairAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  const configured = environment.MATTER_REPAIR_ADAPTER;
  if (configured === "off") return null;
  if (configured === "live") return resolvePoolAdapter(environment, REPAIR_POOL_LIMITS);
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
