import { describe, expect, it } from "vitest";
import { copyLassoSelectionSet, normalizeLassoSelectionSet } from "./lasso-selection";

const selection = (nodeId: string, start: number, end: number, selectedText: string) => ({
  type: "segment-range" as const,
  nodeId,
  start,
  end,
  selectedText,
});

describe("transient lasso selection sets", () => {
  it("deduplicates geometry repeats while preserving authored visual order", () => {
    const set = normalizeLassoSelectionSet([
      selection("a", 0, 2, "甲"),
      selection("a", 0, 2, "甲"),
      selection("b", 4, 6, "乙"),
    ]);
    expect(set).toHaveLength(2);
    expect(copyLassoSelectionSet(set)).toBe("甲\n\n乙");
  });
});
