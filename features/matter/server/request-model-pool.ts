import "server-only";

import type { MatterScenarioId, ScenarioAdapter } from "./harness";
import {
  createPoolAdapter,
  readModelPool,
  type PoolLimits,
} from "./model-pool";
import { materialModelSurfaceAuthorized } from "./material-model-surface";
import { readProviderCredential } from "./provider-session-crypto";
import { createUserPoolCandidate } from "./user-provider-registry";

export type RequestModelResolution = Readonly<{
  adapter: ScenarioAdapter | null;
  /** Non-secret namespace for label cache/coalescing ownership. */
  cacheScope: string;
}>;

/**
 * The image scenarios are deliberately absent. This resolver exists to splice a
 * person's own chat provider into a public chat surface, and the user-provider
 * registry refuses image models outright. Image generation has its own pool
 * namespace and its own gate, and a person's lease must never reach it by a
 * type that merely happened to include it.
 */
export type LeasedScenarioId = Exclude<MatterScenarioId, "matter-image-brief" | "matter-image">;

const SCENARIO_GATES: Readonly<Record<LeasedScenarioId, string>> = Object.freeze({
  "matter-transcript-repair": "MATTER_REPAIR_ADAPTER",
  "matter-thought-label": "MATTER_LABEL_ADAPTER",
  "matter-inquiry": "MATTER_INQUIRY_ADAPTER",
  "matter-transform": "MATTER_TRANSFORM_ADAPTER",
  "matter-text-swap": "MATTER_TEXT_SWAP_ADAPTER",
});

// These surfaces are already part of the public product. A valid user lease
// may supply their provider even when Matter's managed adapter is intentionally
// disabled. Material mutations carry a separate product-surface gate below.
const USER_PROVIDER_PUBLIC_SCENARIOS: ReadonlySet<LeasedScenarioId> = new Set([
  "matter-transcript-repair",
  "matter-thought-label",
  "matter-inquiry",
]);

/** Couples each scenario to its existing public capability gate. */
export function resolveScenarioRequestModelAdapter(
  request: Request,
  scenario: LeasedScenarioId,
  options: Readonly<{
    fallback: ScenarioAdapter | null;
    limits: PoolLimits;
    environment?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
  }>,
): RequestModelResolution {
  const environment = options.environment ?? process.env;
  const managedAuthorized = environment[SCENARIO_GATES[scenario]] === "live";
  const userAuthorized = scenario === "matter-transform" || scenario === "matter-text-swap"
    ? materialModelSurfaceAuthorized(scenario, environment)
    : USER_PROVIDER_PUBLIC_SCENARIOS.has(scenario);
  if (!userAuthorized) {
    return Object.freeze({ adapter: null, cacheScope: "managed" });
  }
  return resolveRequestModelAdapter(request, {
    userAuthorized,
    managedAuthorized,
    fallback: options.fallback,
    limits: options.limits,
    environment,
    now: options.now,
  });
}

/**
 * Inserts a session candidate only for an authorized product surface. Public
 * Repair, Label, and Inquiry may use it without a managed gate; material
 * mutations require their independent surface gate. The global pool array is never
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
