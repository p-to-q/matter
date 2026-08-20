import { describe, expect, it, vi } from "vitest";
import { deriveExpandInPlaceLength } from "../protocol/expand-in-place-policy";
import { ScenarioGovernor, runScenario, type ScenarioCall } from "./harness";
import { TRANSFORM_SCENARIO, adjudicateTransform, type TransformScenarioInput } from "./transform-harness";
import { FROZEN_TRANSFORM_FIXTURES, fixtureTransformAdapter } from "./transform-provider";

function inputFor(
  fixture: (typeof FROZEN_TRANSFORM_FIXTURES)[number],
): TransformScenarioInput {
  const sourceGraphemes = Array.from(fixture.passage).length;
  const amount = fixture.requestedDeltaGraphemes / (2 * sourceGraphemes);
  const length = deriveExpandInPlaceLength(fixture.passage, "", "", amount);
  if (length === null || length.requestedDeltaGraphemes !== fixture.requestedDeltaGraphemes) {
    throw new Error("Frozen fixture must have a representable stretch degree.");
  }
  return Object.freeze({
    locale: fixture.locale,
    passage: fixture.passage,
    amount,
    length,
    lineage: Object.freeze([]),
    surrounding: Object.freeze({ before: "", after: "" }),
  });
}

function callFor(input: TransformScenarioInput): ScenarioCall {
  const budget = TRANSFORM_SCENARIO.budget(input);
  return Object.freeze({
    scenario: TRANSFORM_SCENARIO.id,
    prompt: TRANSFORM_SCENARIO.compile(input),
    locale: TRANSFORM_SCENARIO.locale(input),
    input,
    deadlineMs: budget.deadlineMs,
    maxOutputTokens: budget.maxOutputTokens,
  });
}

describe("frozen transform fixtures", () => {
  it("maps every frozen case to a policy-valid expansion", async () => {
    for (const fixture of FROZEN_TRANSFORM_FIXTURES) {
      const input = inputFor(fixture);
      const response = await fixtureTransformAdapter(callFor(input), new AbortController().signal);
      expect(response.text).toBe(fixture.text);
      expect(adjudicateTransform(response.text, input)).toEqual({ ok: true, value: fixture.text });
    }
  });

  it("has no generic fallback: an unmatched passage settles unavailable", async () => {
    const input = inputFor(FROZEN_TRANSFORM_FIXTURES[0]!);
    const unmatched = Object.freeze({ ...input, passage: "这是另一个没有冻结答案的短句" });
    const observations = vi.fn();
    await expect(runScenario(
      TRANSFORM_SCENARIO,
      unmatched,
      fixtureTransformAdapter,
      new ScenarioGovernor(),
      { observe: observations },
    )).resolves.toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
    expect(observations).toHaveBeenCalledWith(expect.objectContaining({ reason: "MODEL_UNAVAILABLE" }));
  });
});
