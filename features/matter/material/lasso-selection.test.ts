import { describe, expect, it } from "vitest";
import {
  copyLassoSelectionSet,
  normalizeLassoSelectionSet,
  settleLassoSelectionSet,
} from "./lasso-selection";

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

  it("keeps every resolved passage after pointer-up instead of clearing the tray", () => {
    const first = selection("a", 0, 2, "甲");
    const second = selection("b", 4, 6, "乙");

    expect(settleLassoSelectionSet([], {
      kind: "selection",
      selection: first,
      selections: [first, second],
    })).toEqual([first, second]);
  });

  it("restores the starting set after an ambiguous stroke and clears only a closed empty loop", () => {
    const start = normalizeLassoSelectionSet([selection("a", 0, 2, "甲")]);

    expect(settleLassoSelectionSet(start, { kind: "ambiguous" })).toBe(start);
    expect(settleLassoSelectionSet(start, { kind: "empty-closed" })).toEqual([]);
  });
});
