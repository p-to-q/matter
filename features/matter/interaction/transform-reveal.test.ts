import { describe, expect, it } from "vitest";
import {
  TRANSFORM_REVEAL_MAX_TOTAL_MS,
  TRANSFORM_REVEAL_MIN_TOTAL_MS,
  planTransformReveal,
} from "./transform-reveal";

describe("transform reveal", () => {
  it("keeps stable language visible and groups inserted language into a bounded arrival", () => {
    const plan = planTransformReveal(
      "这件事可能没那么重要",
      "这件事在此刻可能没有原先想的那么重要",
    );

    expect(plan).not.toBeNull();
    expect(plan?.parts.map((part) => part.text).join(""))
      .toBe("这件事在此刻可能没有原先想的那么重要");
    expect(plan?.groupCount).toBeGreaterThanOrEqual(2);
    expect(plan?.groupCount).toBeLessThanOrEqual(4);
    expect(plan?.totalMs).toBeGreaterThanOrEqual(TRANSFORM_REVEAL_MIN_TOTAL_MS);
    expect(plan?.totalMs).toBeLessThanOrEqual(TRANSFORM_REVEAL_MAX_TOTAL_MS);
    expect(plan?.parts.some((part) => part.group === null)).toBe(true);
  });

  it("does not animate a no-op", () => {
    expect(planTransformReveal("same", "same")).toBeNull();
  });

  it("splits one continuous insertion into perceptible grapheme-safe groups", () => {
    const plan = planTransformReveal("source", "source with 👨‍👩‍👧‍👦 detail");

    expect(plan?.parts.map((part) => part.text).join(""))
      .toBe("source with 👨‍👩‍👧‍👦 detail");
    expect(plan?.groupCount).toBeGreaterThanOrEqual(2);
    expect(plan?.groupCount).toBeLessThanOrEqual(4);
    expect(plan?.parts.filter((part) => part.group !== null)
      .some((part) => part.text.includes("👨‍👩‍👧‍👦"))).toBe(true);
  });

  it("allows a single-grapheme change to remain one indivisible group", () => {
    expect(planTransformReveal("source", "source!")?.groupCount).toBe(1);
  });
});
