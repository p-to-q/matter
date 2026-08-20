import type { ScenarioAdapter } from "./harness";
import type { TextSwapScenarioInput } from "./text-swap-harness";
import { resolvePoolAdapter } from "./model-pool";

type FrozenTextSwap = Readonly<{
  locale: TextSwapScenarioInput["locale"];
  passage: string;
  direction: string;
  text: string;
}>;

/** A closed synthetic map. A miss is unavailable, never generic prose. */
export const FROZEN_TEXT_SWAP_FIXTURES: readonly FrozenTextSwap[] = Object.freeze([
  Object.freeze({
    locale: "zh-CN",
    passage: "房间慢慢安静下来",
    direction: "换一种更清楚但保留安静感的说法",
    text: "屋里渐渐恢复了安静",
  }),
  Object.freeze({
    locale: "zh-CN",
    passage: "我们怀念的也许不是一个真实存在过的过去",
    direction: "换一种更凝练的说法",
    text: "我们也许怀念的，并不是一个曾经真实存在的过去",
  }),
]);

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
    return resolvePoolAdapter(environment, {
      minimumAttemptMs: 700,
      maxAttemptShare: 0.6,
      maxOutputTokens: 1_200,
      maxResponseBytes: 40 * 1_024,
      failuresBeforeCooldown: 2,
      cooldownMs: 60_000,
    });
  }
  if (configured === "fixture" || (configured === undefined && environment.NODE_ENV !== "production")) {
    return fixtureTextSwapAdapter;
  }
  return null;
}
