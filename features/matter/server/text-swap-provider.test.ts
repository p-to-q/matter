import { describe, expect, it, vi } from "vitest";
import { deriveTextSwapLength } from "../protocol/text-swap-policy";
import { ScenarioGovernor, runScenario, type ScenarioCall } from "./harness";
import { TEXT_SWAP_SCENARIO, adjudicateTextSwap, type TextSwapScenarioInput } from "./text-swap-harness";
import {
  FROZEN_TEXT_SWAP_FIXTURES,
  fixtureTextSwapAdapter,
  resolveTextSwapAdapter,
} from "./text-swap-provider";

function inputFor(fixture: (typeof FROZEN_TEXT_SWAP_FIXTURES)[number]): TextSwapScenarioInput {
  const length = deriveTextSwapLength(fixture.passage, "", "");
  if (length === null) throw new Error("frozen text swap must fit");
  return Object.freeze({
    locale: fixture.locale,
    passage: fixture.passage,
    direction: fixture.direction,
    length,
    lineage: Object.freeze([]),
    surrounding: Object.freeze({ before: "", after: "" }),
  });
}

function callFor(input: TextSwapScenarioInput): ScenarioCall {
  const budget = TEXT_SWAP_SCENARIO.budget(input);
  return Object.freeze({
    scenario: TEXT_SWAP_SCENARIO.id,
    prompt: TEXT_SWAP_SCENARIO.compile(input),
    locale: input.locale,
    input,
    deadlineMs: budget.deadlineMs,
    maxOutputTokens: budget.maxOutputTokens,
  });
}

describe("text swap provider", () => {
  it("maps every exact frozen locale+passage+direction case to a policy-valid answer", async () => {
    for (const fixture of FROZEN_TEXT_SWAP_FIXTURES) {
      const input = inputFor(fixture);
      const response = await fixtureTextSwapAdapter(callFor(input), new AbortController().signal);
      expect(response.text).toBe(fixture.text);
      expect(adjudicateTextSwap(response.text, input)).toEqual({ ok: true, value: fixture.text });
    }
  });

  it("has no generic fallback for a fixture miss", async () => {
    const fixture = FROZEN_TEXT_SWAP_FIXTURES[0]!;
    const input = Object.freeze({ ...inputFor(fixture), direction: "换一个完全不同的方向" });
    const observations = vi.fn();
    await expect(runScenario(
      TEXT_SWAP_SCENARIO,
      input,
      fixtureTextSwapAdapter,
      new ScenarioGovernor(),
      { observe: observations },
    )).resolves.toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
  });

  it("uses an independent production-off adapter switch", () => {
    expect(resolveTextSwapAdapter({ NODE_ENV: "production" })).toBeNull();
    expect(resolveTextSwapAdapter({ NODE_ENV: "development" })).toBe(fixtureTextSwapAdapter);
    expect(resolveTextSwapAdapter({ NODE_ENV: "development", MATTER_TEXT_SWAP_ADAPTER: "off", MATTER_TRANSFORM_ADAPTER: "fixture" }))
      .toBeNull();
  });
});
