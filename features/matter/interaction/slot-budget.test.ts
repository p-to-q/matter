import { describe, expect, it } from "vitest";
import {
  parseTargetLines,
  SLOT_BUDGET_LIMITS,
  slotBudgetFromPixels,
  slotBudgetFromTargetLines,
} from "./slot-budget";

describe("slot budget", () => {
  it("exports a frozen bounded integer contract", () => {
    expect(SLOT_BUDGET_LIMITS).toEqual({
      minimumTargetLines: 1,
      maximumTargetLines: 64,
      hysteresisLines: 0.15,
      maximumLineHeightPixels: 512,
    });
    expect(Object.isFrozen(SLOT_BUDGET_LIMITS)).toBe(true);
  });

  it("maps same-space pixels to integer expansion rows", () => {
    expect(slotBudgetFromPixels({
      deltaPixels: 39,
      lineHeightPixels: 30,
      sourceLines: 2,
      previousTargetLines: 2,
    })).toEqual({
      mode: "expand",
      sourceLines: 2,
      targetLines: 3,
      lineDelta: 1,
      flowSlotPixels: 30,
      visibleSlotPixels: 30,
      viewportClipped: false,
    });
  });

  it("holds the previous row inside hysteresis in both directions", () => {
    const project = (deltaPixels: number, previousTargetLines: number) =>
      slotBudgetFromPixels({
        deltaPixels,
        lineHeightPixels: 20,
        sourceLines: 2,
        previousTargetLines,
      })?.targetLines;

    expect(project(12.9, 2)).toBe(2);
    expect(project(13.1, 2)).toBe(3);
    expect(project(7.1, 3)).toBe(3);
    expect(project(6.9, 3)).toBe(2);
  });

  it("can cross several rows in one event without sequential pointer samples", () => {
    expect(slotBudgetFromPixels({
      deltaPixels: 118,
      lineHeightPixels: 20,
      sourceLines: 2,
      previousTargetLines: 2,
    })?.targetLines).toBe(8);
  });

  it("clamps inward travel at the source instead of creating compression", () => {
    expect(slotBudgetFromPixels({
      deltaPixels: -34,
      lineHeightPixels: 20,
      sourceLines: 4,
      previousTargetLines: 4,
    })).toEqual({
        mode: "neutral",
        sourceLines: 4,
        targetLines: 4,
        lineDelta: 0,
      flowSlotPixels: 0,
      visibleSlotPixels: 0,
      viewportClipped: false,
    });
  });

  it("clamps target rows at both semantic bounds", () => {
    expect(slotBudgetFromPixels({
      deltaPixels: -10_000,
      lineHeightPixels: 20,
      sourceLines: 4,
      previousTargetLines: 4,
    })?.targetLines).toBe(4);
    expect(slotBudgetFromPixels({
      deltaPixels: 10_000,
      lineHeightPixels: 20,
      sourceLines: 4,
      previousTargetLines: 4,
    })?.targetLines).toBe(SLOT_BUDGET_LIMITS.maximumTargetLines);
  });

  it("keeps targetLines stable when zoom scales travel and line height equally", () => {
    const base = slotBudgetFromPixels({
      deltaPixels: 52,
      lineHeightPixels: 24,
      sourceLines: 2,
      previousTargetLines: 2,
    })!;
    const zoomed = slotBudgetFromPixels({
      deltaPixels: 104,
      lineHeightPixels: 48,
      sourceLines: 2,
      previousTargetLines: 2,
    })!;

    expect(zoomed.targetLines).toBe(base.targetLines);
    expect(zoomed.lineDelta).toBe(base.lineDelta);
    expect(zoomed.flowSlotPixels).toBe(base.flowSlotPixels * 2);
  });

  it("lets viewport clipping affect only visible preview, not settled intent or flow", () => {
    const clipped = slotBudgetFromPixels({
      deltaPixels: 70,
      lineHeightPixels: 20,
      sourceLines: 2,
      previousTargetLines: 2,
      availableViewportPixels: 17,
    })!;

    expect(clipped).toMatchObject({
      targetLines: 6,
      lineDelta: 4,
      flowSlotPixels: 80,
      visibleSlotPixels: 17,
      viewportClipped: true,
    });
  });

  it("reprojects a settled integer budget after line-height or viewport changes", () => {
    const laptop = slotBudgetFromTargetLines({
      sourceLines: 2,
      targetLines: 5,
      lineHeightPixels: 24,
      availableViewportPixels: 200,
    })!;
    const narrowZoomed = slotBudgetFromTargetLines({
      sourceLines: 2,
      targetLines: 5,
      lineHeightPixels: 36,
      availableViewportPixels: 70,
    })!;

    expect(laptop.targetLines).toBe(5);
    expect(narrowZoomed.targetLines).toBe(5);
    expect(laptop.flowSlotPixels).toBe(72);
    expect(narrowZoomed.flowSlotPixels).toBe(108);
    expect(narrowZoomed.visibleSlotPixels).toBe(70);
  });

  it("strictly parses only safe bounded integer targetLines", () => {
    expect(parseTargetLines(1)).toBe(1);
    expect(parseTargetLines(64)).toBe(64);
    for (const value of [
      0,
      65,
      2.5,
      "2",
      true,
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      {},
    ]) {
      expect(parseTargetLines(value)).toBeNull();
    }
  });

  it("rejects malformed measurement inputs whole", () => {
    const valid = {
      deltaPixels: 20,
      lineHeightPixels: 20,
      sourceLines: 2,
      previousTargetLines: 2,
    } as const;
    expect(slotBudgetFromPixels({ ...valid, deltaPixels: Number.NaN })).toBeNull();
    expect(slotBudgetFromPixels({ ...valid, lineHeightPixels: 0 })).toBeNull();
    expect(slotBudgetFromPixels({ ...valid, lineHeightPixels: 513 })).toBeNull();
    expect(slotBudgetFromPixels({ ...valid, sourceLines: 1.5 })).toBeNull();
    expect(slotBudgetFromPixels({ ...valid, previousTargetLines: 0 })).toBeNull();
    expect(slotBudgetFromPixels({ ...valid, availableViewportPixels: -1 })).toBeNull();
    expect(slotBudgetFromPixels({
      ...valid,
      availableViewportPixels: Number.POSITIVE_INFINITY,
    })).toBeNull();
  });

  it("returns immutable owned values", () => {
    const budget = slotBudgetFromPixels({
      deltaPixels: 20,
      lineHeightPixels: 20,
      sourceLines: 2,
      previousTargetLines: 2,
    })!;
    expect(Object.isFrozen(budget)).toBe(true);
  });
});
