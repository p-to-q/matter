import { describe, expect, it } from "vitest";
import { lassoPointerSamples } from "./lasso-pointer-samples";

describe("lasso pointer samples", () => {
  it("falls back when coalescing is missing, empty, or throws", () => {
    const terminal = { clientX: 9, clientY: 7 };
    expect(lassoPointerSamples(terminal)).toEqual([terminal]);
    expect(lassoPointerSamples({
      ...terminal,
      getCoalescedEvents: () => [],
    })).toEqual([terminal]);
    expect(lassoPointerSamples({
      ...terminal,
      getCoalescedEvents: () => { throw new Error("unsupported"); },
    })).toEqual([terminal]);
  });

  it("keeps ordered history and always appends a newer terminal coordinate", () => {
    const samples = lassoPointerSamples({
      clientX: 12,
      clientY: 10,
      getCoalescedEvents: () => [
        { clientX: 2, clientY: 2 },
        { clientX: 8, clientY: 7 },
      ],
    });
    expect(samples).toEqual([
      { clientX: 2, clientY: 2 },
      { clientX: 8, clientY: 7 },
      { clientX: 12, clientY: 10 },
    ]);
    expect(Object.isFrozen(samples)).toBe(true);
  });

  it("deduplicates the terminal event and drops non-finite history", () => {
    expect(lassoPointerSamples({
      clientX: 12,
      clientY: 10,
      getCoalescedEvents: () => [
        { clientX: Number.NaN, clientY: 2 },
        { clientX: 12, clientY: 10 },
      ],
    })).toEqual([{ clientX: 12, clientY: 10 }]);
    expect(lassoPointerSamples({ clientX: Infinity, clientY: 0 })).toEqual([]);
  });
});
