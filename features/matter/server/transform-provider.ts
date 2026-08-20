import type { ScenarioAdapter } from "./harness";
import type { TransformScenarioInput } from "./transform-harness";
import { resolvePoolAdapter } from "./model-pool";

type FrozenFixtureExpansion = Readonly<{
  locale: TransformScenarioInput["locale"];
  passage: string;
  requestedDeltaGraphemes: number;
  text: string;
}>;

/**
 * Fixture language is a closed synthetic corpus, not a fallback writer. An
 * unmatched passage is unavailable so development can never mistake invented
 * generic prose for a model-quality result.
 */
export const FROZEN_TRANSFORM_FIXTURES: readonly FrozenFixtureExpansion[] = Object.freeze([
  Object.freeze({
    locale: "zh-CN",
    passage: "这件事可能没那么重要",
    requestedDeltaGraphemes: 10,
    text: "这件事在眼下这个时刻可能没那么显得重要",
  }),
  Object.freeze({
    locale: "zh-CN",
    passage: "我们怀念的也许不是一个真实存在过的过去",
    requestedDeltaGraphemes: 19,
    text: "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去",
  }),
  Object.freeze({
    locale: "zh-CN",
    passage: "而是那个过去在今天仍然允许我们想象的其他生活",
    requestedDeltaGraphemes: 22,
    text: "而是那个过去在今天仍然带着松动的边界，持续允许我们缓慢想象仍有开放余地的其他生活",
  }),
  Object.freeze({
    locale: "zh-CN",
    passage: "被允许想象的其他生活",
    requestedDeltaGraphemes: 20,
    text: "被允许沿着眼前松动的边界缓慢想象的、仍然保留清晰细节和余地的其他生活",
  }),
]);

export const fixtureTransformAdapter: ScenarioAdapter = async (call) => {
  const input = call.input as TransformScenarioInput;
  const fixture = FROZEN_TRANSFORM_FIXTURES.find((candidate) =>
    candidate.locale === input.locale &&
    candidate.passage === input.passage &&
    candidate.requestedDeltaGraphemes === input.length.requestedDeltaGraphemes
  );
  if (fixture === undefined) throw new Error("No frozen transform fixture matches this passage and degree.");
  return Object.freeze({ text: fixture.text });
};

export function resolveTransformAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  const configured = environment.MATTER_TRANSFORM_ADAPTER;
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
    return fixtureTransformAdapter;
  }
  return null;
}
