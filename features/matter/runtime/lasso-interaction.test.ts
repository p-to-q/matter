import { describe, expect, it } from "vitest";
import type { SegmentSelection } from "../material/text-segments";
import type { LassoAddress } from "../material/lasso-selection";
import {
  createLassoInteractionState,
  reduceLassoInteraction,
} from "./lasso-interaction";

const OLD_SELECTION: SegmentSelection = {
  type: "segment-range",
  nodeId: "node_a",
  start: 0,
  end: 3,
  selectedText: "旧选择",
};

const NEW_SELECTION: SegmentSelection = {
  type: "segment-range",
  nodeId: "node_a",
  start: 4,
  end: 7,
  selectedText: "新选择",
};

function address(range: SegmentSelection): LassoAddress {
  return { kind: "contiguous-segment-range", range };
}

const OLD_ADDRESS = address(OLD_SELECTION);
const NEW_ADDRESS = address(NEW_SELECTION);

function ready(selection: SegmentSelection | null = OLD_SELECTION) {
  return reduceLassoInteraction(createLassoInteractionState(selection && address(selection)), {
    type: "activate",
  });
}

function drawing(selection: SegmentSelection | null = OLD_SELECTION) {
  return reduceLassoInteraction(ready(selection), {
    type: "pointer-down",
    pointerId: 7,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
  });
}

describe("lasso interaction", () => {
  it("requires explicit mode activation before a primary pointer can own a stroke", () => {
    const inactive = createLassoInteractionState(OLD_ADDRESS);
    const down = {
      type: "pointer-down",
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
    } as const;

    expect(reduceLassoInteraction(inactive, down)).toBe(inactive);
    expect(reduceLassoInteraction(inactive, { type: "activate" })).toEqual({
      mode: "ready",
      address: OLD_ADDRESS,
    });
    expect(drawing()).toEqual({
      mode: "drawing",
      address: null,
      startAddress: OLD_ADDRESS,
      pointerId: 7,
      pointerType: "mouse",
    });
  });

  it.each(["mouse", "pen", "touch"] as const)(
    "owns a normalized %s pointer type for the complete stroke",
    (pointerType) => {
      const result = reduceLassoInteraction(ready(), {
        type: "pointer-down",
        pointerId: 7,
        pointerType,
        isPrimary: true,
        button: 0,
      });
      expect(result).toMatchObject({ mode: "drawing", pointerType });
    },
  );

  it("rejects secondary, non-primary, malformed, and concurrent pointers", () => {
    const state = ready();
    for (const event of [
      { type: "pointer-down", pointerId: 7, pointerType: "mouse", isPrimary: false, button: 0 },
      { type: "pointer-down", pointerId: 7, pointerType: "mouse", isPrimary: true, button: 1 },
      { type: "pointer-down", pointerId: -1, pointerType: "mouse", isPrimary: true, button: 0 },
      { type: "pointer-down", pointerId: Number.NaN, pointerType: "mouse", isPrimary: true, button: 0 },
      { type: "pointer-down", pointerId: 7, pointerType: "unknown", isPrimary: true, button: 0 },
    ] as const) {
      expect(reduceLassoInteraction(state, event)).toBe(state);
    }

    const owned = drawing();
    expect(reduceLassoInteraction(owned, {
      type: "pointer-down",
      pointerId: 8,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
    })).toBe(owned);
  });

  it("publishes a valid resolved selection only for the owning pointer", () => {
    const state = drawing();
    expect(reduceLassoInteraction(state, {
      type: "pointer-up",
      pointerId: 8,
      resolution: { kind: "selection", mode: "contiguous-segment-range", selection: NEW_SELECTION },
    })).toBe(state);

    const result = reduceLassoInteraction(state, {
      type: "pointer-up",
      pointerId: 7,
      resolution: { kind: "selection", mode: "contiguous-segment-range", selection: NEW_SELECTION },
    });
    expect(result).toEqual({ mode: "ready", address: NEW_ADDRESS });
    expect(result.address).not.toBe(NEW_ADDRESS);
  });

  it("never publishes an Elastic address for a higher-level selection set", () => {
    const result = reduceLassoInteraction(drawing(), {
      type: "pointer-up",
      pointerId: 7,
      resolution: {
        kind: "selection",
        mode: "selection-set",
        selection: NEW_SELECTION,
        selections: [NEW_SELECTION, { ...NEW_SELECTION, nodeId: "node_b" }],
      },
    });
    expect(result).toEqual({ mode: "ready", address: null });
    expect(reduceLassoInteraction(drawing(), {
      type: "pointer-up",
      pointerId: 7,
      resolution: {
        kind: "selection",
        mode: "selection-set",
        selection: NEW_SELECTION,
        selections: [NEW_SELECTION],
      },
    })).toEqual({ mode: "ready", address: OLD_ADDRESS });
  });

  it("accepts one exact keyboard-addressed segment only while the tool is ready", () => {
    expect(reduceLassoInteraction(ready(), {
      type: "keyboard-select",
      selection: NEW_SELECTION,
    })).toEqual({ mode: "ready", address: NEW_ADDRESS });
    expect(reduceLassoInteraction(createLassoInteractionState(), {
      type: "keyboard-select",
      selection: NEW_SELECTION,
    })).toEqual({ mode: "inactive", address: null });
    expect(reduceLassoInteraction(drawing(), {
      type: "keyboard-select",
      selection: NEW_SELECTION,
    })).toEqual(drawing());
  });

  it("clears the previous selection only after a trustworthy empty closed loop", () => {
    expect(reduceLassoInteraction(drawing(), {
      type: "pointer-up",
      pointerId: 7,
      resolution: { kind: "empty-closed" },
    })).toEqual({ mode: "ready", address: null });
  });

  it.each(["uncommitted", "ambiguous"] as const)(
    "restores the starting selection after an %s stroke",
    (kind) => {
      expect(reduceLassoInteraction(drawing(), {
        type: "pointer-up",
        pointerId: 7,
        resolution: { kind },
      })).toEqual({ mode: "ready", address: OLD_ADDRESS });
    },
  );

  it("restores the starting selection for a malformed selected result", () => {
    const malformed = { ...NEW_SELECTION, end: NEW_SELECTION.start };
    expect(reduceLassoInteraction(drawing(), {
      type: "pointer-up",
      pointerId: 7,
      resolution: { kind: "selection", mode: "contiguous-segment-range", selection: malformed },
    })).toEqual({ mode: "ready", address: OLD_ADDRESS });
  });

  it.each(["pointer-cancel", "lost-pointer-capture"] as const)(
    "restores the start snapshot on owning %s",
    (type) => {
      const state = drawing();
      expect(reduceLassoInteraction(state, { type, pointerId: 8 })).toBe(state);
      expect(reduceLassoInteraction(state, { type, pointerId: 7 })).toEqual({
        mode: "ready",
        address: OLD_ADDRESS,
      });
    },
  );

  it("restores the start snapshot when the tool is deactivated mid-stroke", () => {
    expect(reduceLassoInteraction(drawing(), { type: "deactivate" })).toEqual({
      mode: "inactive",
      address: OLD_ADDRESS,
    });
  });

  it("cancels layout-stale ink but retains a semantic selection for remeasurement", () => {
    expect(reduceLassoInteraction(drawing(), {
      type: "layout-invalidated",
    })).toEqual({ mode: "ready", address: OLD_ADDRESS });

    const stable = ready();
    expect(reduceLassoInteraction(stable, { type: "layout-invalidated" })).toBe(stable);
  });

  it.each(["material-invalidated", "navigation-invalidated"] as const)(
    "clears semantic selection and any active stroke on %s",
    (type) => {
      expect(reduceLassoInteraction(drawing(), { type })).toEqual({
        mode: "ready",
        address: null,
      });
      expect(reduceLassoInteraction(createLassoInteractionState(OLD_ADDRESS), {
        type,
      })).toEqual({ mode: "inactive", address: null });
    },
  );

  it("owns the caller's initial selection snapshot", () => {
    const mutable = { ...OLD_SELECTION };
    const state = createLassoInteractionState(address(mutable));
    mutable.selectedText = "changed outside";
    expect(state.address?.kind === "contiguous-segment-range" && state.address.range.selectedText).toBe("旧选择");
  });
});
