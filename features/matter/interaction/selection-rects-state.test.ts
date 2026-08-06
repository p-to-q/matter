import { describe, expect, it } from "vitest";
import { clearMeasuredSelectionRects } from "./selection-rects-state";

describe("measured selection rect state", () => {
  it("preserves an existing empty receipt so idle geometry changes do not publish another render", () => {
    const current: readonly never[] = Object.freeze([]);
    expect(clearMeasuredSelectionRects(current)).toBe(current);
  });

  it("clears a non-empty receipt without retaining old geometry", () => {
    const current = [{ x: 1, y: 2, width: 3, height: 4 }];
    const next = clearMeasuredSelectionRects(current);
    expect(next).toEqual([]);
    expect(next).not.toBe(current);
    expect(clearMeasuredSelectionRects(next)).toBe(next);
  });
});
