import "server-only";

import type { MatterScenarioId, ScenarioAdapter } from "./harness";
import {
  createPoolAdapter,
  readModelPool,
  type PoolLimits,
} from "./model-pool";
import { readProviderCredential } from "./provider-session-crypto";
import { createUserPoolCandidate } from "./user-provider-registry";

export type RequestModelResolution = Readonly<{
  adapter: ScenarioAdapter | null;
  /** Non-secret namespace for label cache/coalescing ownership. */
  cacheScope: string;
}>;

const SCENARIO_GATES: Readonly<Record<MatterScenarioId, string>> = Object.freeze({
  "matter-transcript-repair": "MATTER_REPAIR_ADAPTER",
  "matter-thought-label": "MATTER_LABEL_ADAPTER",
  "matter-inquiry": "MATTER_INQUIRY_ADAPTER",
  "matter-transform": "MATTER_TRANSFORM_ADAPTER",
  "matter-text-swap": "MATTER_TEXT_SWAP_ADAPTER",
});

// These surfaces are already part of the public product. A valid user lease
// may supply their provider even when Matter's managed adapter is intentionally
// disabled. Private material mutations still require their explicit live gate.
const USER_PROVIDER_PUBLIC_SCENARIOS: ReadonlySet<MatterScenarioId> = new Set([
  "matter-transcript-repair",
  "matter-thought-label",
  "matter-inquiry",
]);

/** Couples each scenario to its existing public capability gate. */
export function resolveScenarioRequestModelAdapter(
  request: Request,
  scenario: MatterScenarioId,
  options: Readonly<{
    fallback: ScenarioAdapter | null;
    limits: PoolLimits;
    environment?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
  }>,
): RequestModelResolution {
  const environment = options.environment ?? process.env;
  const managedAuthorized = environment[SCENARIO_GATES[scenario]] === "live";
  return resolveRequestModelAdapter(request, {
    userAuthorized: managedAuthorized || USER_PROVIDER_PUBLIC_SCENARIOS.has(scenario),
    managedAuthorized,
    fallback: options.fallback,
    limits: options.limits,
    environment,
    now: options.now,
  });
}

/**
 * Inserts a session candidate only for an authorized product surface. Public
 * Repair, Label, and Inquiry may use it without a managed gate; private
 * mutation surfaces still require that gate. The global pool array is never
 * mutated, and the global scenario governor remains the sole concurrency owner
 * across credentials while request-owned health stays scoped.
 */
export function resolveRequestModelAdapter(
  request: Request,
  options: Readonly<{
    userAuthorized: boolean;
    managedAuthorized: boolean;
    fallback: ScenarioAdapter | null;
    limits: PoolLimits;
    environment?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
  }>,
): RequestModelResolution {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  if (!options.userAuthorized) return Object.freeze({ adapter: options.fallback, cacheScope: "managed" });
  const credential = readProviderCredential(request, environment, now());
  if (credential === null) return Object.freeze({ adapter: options.fallback, cacheScope: "managed" });
  const userCandidate = createUserPoolCandidate(credential);
  if (userCandidate === null) return Object.freeze({ adapter: options.fallback, cacheScope: "managed" });
  const candidates = Object.freeze([
    userCandidate,
    ...(options.managedAuthorized ? readModelPool(environment) : []),
  ]);
  return Object.freeze({
    adapter: createPoolAdapter(candidates, options.limits, now),
    cacheScope: credential.scopeId,
  });
}
