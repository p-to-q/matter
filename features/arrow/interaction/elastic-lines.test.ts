import { describe, expect, it } from "vitest";
import {
  distributeElasticLines,
  elasticGridHeight,
  elasticRowCount,
} from "./elastic-lines";

describe("elastic line distribution", () => {
  it("adds bounded rows as vertical degree increases", () => {
    expect(elasticRowCount(0, 8)).toBe(1);
    expect(elasticRowCount(0.5, 8)).toBe(4);
    expect(elasticRowCount(1, 8)).toBe(6);
    expect(elasticRowCount(1, 2)).toBe(2);
  });

  it("preserves text while balancing different line contents", () => {
    const text = "那个过去在今天仍然允许我们想象其他生活";
    const lines = distributeElasticLines(text, 1);

    expect(lines).toHaveLength(6);
    expect(lines.flat().join("")).toBe(text);
    expect(new Set(lines.map((line) => line.join(""))).size).toBe(6);
  });

  it("keeps the fixed grid tall enough for every generated line", () => {
    expect(elasticGridHeight(1, 6)).toBeGreaterThanOrEqual(326);
    expect(elasticGridHeight(0.2, 2)).toBeGreaterThanOrEqual(118);
  });
});
