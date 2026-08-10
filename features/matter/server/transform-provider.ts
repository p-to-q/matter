import { type TransformScenarioInput } from "./transform-harness";
import type { ScenarioAdapter } from "./harness";
import { resolvePoolAdapter } from "./model-pool";

/**
 * A deterministic local fixture proves the complete material-turn boundary
 * without claiming to be a language model. Production only reaches a provider
 * when this separate gate is explicitly live.
 */
export const fixtureTransformAdapter: ScenarioAdapter = async (call) => {
  const configured = process.env.MATTER_FIXTURE_TRANSFORM;
  if (configured !== undefined) return { text: configured };
  const input = call.input as TransformScenarioInput;
  return { text: fixtureExpansion(input.passage, input.targetCodePoints) };
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

function fixtureExpansion(passage: string, targetCodePoints: number): string {
  const suffix = "，还有一些尚未展开的地方";
  let text = passage;
  while (Array.from(text).length < targetCodePoints) text += suffix;
  return Array.from(text).slice(0, targetCodePoints).join("");
}
