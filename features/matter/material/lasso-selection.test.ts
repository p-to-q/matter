import { describe, expect, it } from "vitest";
import {
  copyLassoSelectionSet,
  lassoAddressFromResolution,
  normalizeLassoSelectionSet,
  primaryLassoSelection,
  settleLassoSelectionSet,
} from "./lasso-selection";

const selection = (nodeId: string, start: number, end: number, selectedText: string) => ({
  type: "segment-range" as const,
  nodeId,
  start,
  end,
  selectedText,
});

describe("single lasso address", () => {
  it("owns exactly one punctuation-bounded selection", () => {
    const range = selection("a", 0, 2, "甲");
    const address = lassoAddressFromResolution({
      kind: "selection",
      mode: "contiguous-segment-range",
      selection: range,
    });
    expect(address).toEqual({ kind: "contiguous-segment-range", range });
    expect(primaryLassoSelection(address)).toEqual(range);
  });

  it("rejects a malformed range instead of publishing an address", () => {
    const malformed = selection("a", 2, 2, "甲");
    expect(lassoAddressFromResolution({
      kind: "selection",
      mode: "contiguous-segment-range",
      selection: malformed,
    })).toBeNull();
  });
});

describe("lasso selection mode", () => {
  const first = selection("a", 0, 5, "第一段");
  const second = selection("b", 0, 4, "另一段");

  it("owns, deduplicates, copies, and settles several passages", () => {
    const normalized = normalizeLassoSelectionSet([first, first, second]);
    expect(normalized).toEqual([first, second]);
    expect(copyLassoSelectionSet(normalized)).toBe("第一段\n\n另一段");
    expect(settleLassoSelectionSet(Object.freeze([first]), {
      kind: "selection",
      mode: "selection-set",
      selection: first,
      selections: [first, second],
    })).toEqual([first, second]);
  });

  it("keeps selection-set and Elastic cardinality fail-closed", () => {
    const current = Object.freeze([first, second]);
    expect(lassoAddressFromResolution({
      kind: "selection",
      mode: "selection-set",
      selection: first,
      selections: [first, second],
    })).toBeNull();
    expect(settleLassoSelectionSet(current, {
      kind: "selection",
      mode: "selection-set",
      selection: first,
      selections: [first],
    })).toBe(current);
    expect(settleLassoSelectionSet(current, {
      kind: "selection",
      mode: "contiguous-segment-range",
      selection: first,
      selections: [first, second],
    })).toBe(current);
    expect(settleLassoSelectionSet(current, {
      kind: "selection",
      mode: "selection-set",
      selection: second,
      selections: [first, second],
    })).toBe(current);
  });

  it("clears only for a trustworthy empty loop and preserves on ambiguity", () => {
    const current = Object.freeze([first, second]);
    expect(settleLassoSelectionSet(current, { kind: "empty-closed" })).toEqual([]);
    expect(settleLassoSelectionSet(current, { kind: "ambiguous" })).toBe(current);
    expect(settleLassoSelectionSet(current, { kind: "uncommitted" })).toBe(current);
  });
});
