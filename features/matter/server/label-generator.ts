import {
  decideModelRequest,
  deriveProvisionalLabel,
  labelFingerprint,
  normalizeLabelInput,
  validateSemanticLabel,
  type NormalizedLabelInput,
} from "../material/semantic-label";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  ScenarioGovernor,
  runScenario,
  withRequestSignal,
  type ScenarioAdapter,
  type ScenarioGovernorLimits,
} from "./harness";
import {
  LABEL_PROVIDER_TIMEOUT_MS,
  type LabelFallbackReason,
  type LabelRequest,
  type LabelSuccess,
} from "./label-contract";
import { LabelServerError } from "./label-errors";
import { LABEL_SCENARIO, buildLabelPrompt } from "./label-harness";
import { resolvePoolAdapter } from "./model-pool";

/**
 * Settles one label request.
 *
 * Two rules shape everything here. A label request always settles with a label,
 * because the browser has already shown one and a failure must not be visible.
 * And a model answer is a suggestion: the shared harness accepts it only after
 * the same deterministic validation and adjudication the browser will run again.
 *
 * What is specific to labelling, and therefore lives here rather than in the
 * harness, is memory: unlike an utterance, the same thought is named over and
 * over, so identical questions are cached and coalesced.
 */

export type LabelGeneratorLimits = ScenarioGovernorLimits & Readonly<{
  timeoutMs: number;
  cacheEntries: number;
  cacheTtlMs: number;
}>;

export const DEFAULT_LABEL_LIMITS: LabelGeneratorLimits = Object.freeze({
  timeoutMs: LABEL_PROVIDER_TIMEOUT_MS,
  maxConcurrentModelCalls: 4,
  cacheEntries: 256,
  cacheTtlMs: 10 * 60_000,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});

type CacheEntry = Readonly<{ label: string; expiresAtMs: number }>;

/**
 * Process-local state. It is a cache and a health counter, never authority:
 * every horizontal replica may hold a different view without changing what a
 * person sees, because the deterministic label is always available.
 */
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ModelAttempt>>();
const governor = new ScenarioGovernor();

export function resetLabelGeneratorState(): void {
  cache.clear();
  inFlight.clear();
  governor.reset();
}

export async function generateLabel(
  request: LabelRequest,
  requestSignal: AbortSignal,
  adapter: ScenarioAdapter | null = resolveLabelAdapter(),
  limits: LabelGeneratorLimits = DEFAULT_LABEL_LIMITS,
  now: () => number = Date.now,
): Promise<LabelSuccess> {
  const input = normalizeLabelInput({
    text: request.text,
    locale: request.locale,
    maxGraphemes: request.maxGraphemes,
    context: {
      parentLabel: request.reference.parentLabel ?? null,
      parentExcerpt: request.reference.parentExcerpt ?? null,
      siblingLabels: request.reference.siblingLabels ?? [],
    },
  });
  const provisional = deriveProvisionalLabel(input);

  if (adapter === null) return settle(request, provisional.text, "MODEL_UNAVAILABLE");
  if (!decideModelRequest(input, provisional).request) {
    return settle(request, provisional.text, undefined, "provisional");
  }

  const key = labelFingerprint(input, request.promptVersion);
  const cached = readCache(key, input, now());
  if (cached !== null) return settle(request, cached, undefined, "model");

  const attempt = await withRequestSignal(
    shareModelCall(key, async () => {
      const outcome = await runScenario(LABEL_SCENARIO, input, adapter, governor, {
        now,
        limits,
        deadlineCeilingMs: limits.timeoutMs,
      });
      return outcome.ok
        ? { label: outcome.value }
        : { label: null, reason: outcome.fallback };
    }),
    requestSignal,
  );

  if (attempt.label === null) return settle(request, provisional.text, attempt.reason);
  writeCache(key, attempt.label, now(), limits);
  return settle(request, attempt.label, undefined, "model");
}

type ModelAttempt = Readonly<
  { label: string; reason?: undefined } | { label: null; reason: LabelFallbackReason }
>;

export { buildLabelPrompt };

/**
 * Proves the whole model path without a provider: it compresses harder than the
 * browser did, which is what a model is asked for, and its answer still has to
 * pass the same validation and adjudication as any real one.
 */
export const fixtureLabelAdapter: ScenarioAdapter = async (call) => {
  const configured = process.env.MATTER_FIXTURE_LABEL;
  if (configured !== undefined) return { text: configured };
  const input = call.input as NormalizedLabelInput;
  const tighter = normalizeLabelInput({
    text: input.text,
    locale: input.locale,
    maxGraphemes: Math.max(2, input.maxGraphemes - 2),
  });
  return { text: deriveProvisionalLabel(tighter).text };
};

export function resolveLabelAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  const configured = environment.MATTER_LABEL_ADAPTER;
  if (configured === "off") return null;
  // A `live` deployment without a usable pool is not an error: it labels
  // deterministically, which is the same thing a person sees while any model
  // is still thinking.
  if (configured === "live") return resolvePoolAdapter(environment);
  if (configured === "fixture" || (configured === undefined && environment.NODE_ENV !== "production")) {
    return fixtureLabelAdapter;
  }
  return null;
}

function shareModelCall(
  key: string,
  run: () => Promise<ModelAttempt>,
): Promise<ModelAttempt> {
  // Two nodes with identical material and context are the same question. One
  // provider call answers both; neither caller can cancel the other's work.
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;
  const flight = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, flight);
  return flight;
}

/**
 * A cache hit is re-validated rather than trusted. The bound, the sibling set,
 * or the prompt version may have moved since the entry was written, and a
 * stored label that no longer passes is deleted instead of shown.
 */
function readCache(key: string, input: NormalizedLabelInput, nowMs: number): string | null {
  const entry = cache.get(key);
  if (entry === undefined) return null;
  if (entry.expiresAtMs <= nowMs) {
    cache.delete(key);
    return null;
  }
  const validation = validateSemanticLabel(entry.label, {
    locale: input.locale,
    maxGraphemes: input.maxGraphemes,
    siblingLabels: input.context.siblingLabels,
  });
  if (!validation.ok) {
    cache.delete(key);
    return null;
  }
  // Refresh recency: Map preserves insertion order, which is the eviction order.
  cache.delete(key);
  cache.set(key, entry);
  return validation.label;
}

function writeCache(key: string, label: string, nowMs: number, limits: LabelGeneratorLimits): void {
  cache.delete(key);
  cache.set(key, Object.freeze({ label, expiresAtMs: nowMs + limits.cacheTtlMs }));
  while (cache.size > limits.cacheEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function settle(
  request: LabelRequest,
  label: string,
  fallbackReason?: LabelFallbackReason,
  source: "provisional" | "model" = "provisional",
): LabelSuccess {
  if (label.length === 0) {
    throw new LabelServerError(
      "LABEL_FAILED",
      "The label could not be derived.",
      true,
      500,
      request.operationId,
    );
  }
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: request.promptVersion,
    operationId: request.operationId,
    basis: request.basis,
    label,
    source,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}
