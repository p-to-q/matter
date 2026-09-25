import type { ScenarioAdapter } from "./harness";
import type { TextSwapScenarioInput } from "./text-swap-harness";
import { FROZEN_TEXT_SWAP_FIXTURES } from "./text-swap-fixtures";
import { resolvePoolAdapter } from "./model-pool";

export { FROZEN_TEXT_SWAP_FIXTURES, LAUNCH_POINT_TALK_FIXTURE } from "./text-swap-fixtures";

export const fixtureTextSwapAdapter: ScenarioAdapter = async (call) => {
  const input = call.input as TextSwapScenarioInput;
  const fixture = FROZEN_TEXT_SWAP_FIXTURES.find((candidate) =>
    candidate.locale === input.locale &&
    candidate.passage === input.passage &&
    candidate.direction === input.direction
  );
  if (fixture === undefined) throw new Error("No frozen text swap fixture matches this locale, passage, and direction.");
  return Object.freeze({ text: fixture.text });
};

export function resolveTextSwapAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  const configured = environment.MATTER_TEXT_SWAP_ADAPTER;
  if (configured === "live") {
    return resolvePoolAdapter(environment, TEXT_SWAP_POOL_LIMITS);
  }
  if (configured === "fixture" || (configured === undefined && environment.NODE_ENV !== "production")) {
    return fixtureTextSwapAdapter;
  }
  return null;
}

export const TEXT_SWAP_POOL_LIMITS = Object.freeze({
  minimumAttemptMs: 700,
  maxAttemptShare: 0.6,
  maxOutputTokens: 1_200,
  maxResponseBytes: 40 * 1_024,
  failuresBeforeCooldown: 2,
  cooldownMs: 60_000,
});
