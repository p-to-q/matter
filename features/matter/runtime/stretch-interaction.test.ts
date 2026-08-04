import { describe, expect, it } from "vitest";
import type { SegmentSelection } from "../material/text-segments";
import {
  STRETCH_MOUSE_PEN_DEADZONE_PX,
  STRETCH_TOUCH_DEADZONE_PX,
  STRETCH_TRAVEL_PX,
  createStretchInteractionState,
  reduceStretchInteraction,
  stretchAmountFromClientDelta,
  type StretchAnchor,
  type StretchHandle,
  type StretchInteractionState,
  type StretchPointerType,
} from "./stretch-interaction";

const SELECTION: SegmentSelection = {
  type: "segment-range",
  nodeId: "node_a",
  start: 0,
  end: 4,
  selectedText: "语言材料",
};

const ANCHOR: StretchAnchor = {
  selection: SELECTION,
  treeId: "tree_a",
  revision: 12,
};

function armed(anchor: StretchAnchor = ANCHOR): StretchInteractionState {
  return reduceStretchInteraction(createStretchInteractionState(), {
    type: "arm",
    anchor,
  });
}

function down(
  state = armed(),
  pointerType: StretchPointerType = "mouse",
  handle: StretchHandle = "bottom",
): StretchInteractionState {
  return reduceStretchInteraction(state, {
    type: "pointer-down",
    handle,
    pointerId: 7,
    pointerType,
    isPrimary: true,
    button: 0,
    clientY: 100,
  });
}

describe("stretch interaction", () => {
  it("arms an owned semantic selection at one material identity and revision", () => {
    const mutable = {
      selection: { ...SELECTION },
      treeId: ANCHOR.treeId,
      revision: ANCHOR.revision,
    };
    const state = armed(mutable);
    mutable.selection.selectedText = "outside mutation";

    expect(state).toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
    expect(state.mode === "armed" && state.anchor).not.toBe(mutable);
    expect(state.mode === "armed" && state.anchor.selection).not.toBe(mutable.selection);
    expect(state.mode === "armed" && state.anchor.selection.selectedText).toBe("语言材料");
  });

  it("rejects malformed anchors without replacing the current state", () => {
    const state = armed();
    for (const anchor of [
      { ...ANCHOR, treeId: "" },
      { ...ANCHOR, revision: -1 },
      { ...ANCHOR, revision: 1.5 },
      { ...ANCHOR, selection: { ...SELECTION, end: 0 } },
      { ...ANCHOR, selection: { ...SELECTION, selectedText: "" } },
    ] as StretchAnchor[]) {
      expect(reduceStretchInteraction(state, { type: "arm", anchor })).toBe(state);
    }
  });

  it("keeps degree for an identical anchor and resets it for a new anchor", () => {
    const committed = reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    });
    expect(committed).toMatchObject({ mode: "committed", amount: 0.5 });
    expect(reduceStretchInteraction(committed, { type: "arm", anchor: ANCHOR })).toBe(committed);

    const revised = { ...ANCHOR, revision: ANCHOR.revision + 1 };
    expect(reduceStretchInteraction(committed, { type: "arm", anchor: revised })).toEqual({
      mode: "armed",
      anchor: revised,
      amount: 0,
    });
  });

  it("requires either recognized handle and one valid primary pointer", () => {
    const state = armed();
    const base = {
      type: "pointer-down" as const,
      handle: "bottom" as const,
      pointerId: 7,
      pointerType: "mouse" as const,
      isPrimary: true,
      button: 0,
      clientY: 100,
    };
    for (const event of [
      { ...base, isPrimary: false },
      { ...base, button: 1 },
      { ...base, pointerId: -1 },
      { ...base, pointerId: Number.NaN },
      { ...base, clientY: Number.POSITIVE_INFINITY },
    ]) {
      expect(reduceStretchInteraction(state, event)).toBe(state);
    }
    expect(reduceStretchInteraction(createStretchInteractionState(), base)).toEqual({ mode: "idle" });

    const owned = down();
    expect(reduceStretchInteraction(owned, { ...base, pointerId: 8 })).toBe(owned);
    expect(down(armed(), "mouse", "top")).toMatchObject({ mode: "dragging", handle: "top" });
  });

  it.each([
    ["mouse", STRETCH_MOUSE_PEN_DEADZONE_PX],
    ["pen", STRETCH_MOUSE_PEN_DEADZONE_PX],
    ["touch", STRETCH_TOUCH_DEADZONE_PX],
  ] as const)("uses the exact %s deadzone before changing degree", (pointerType, threshold) => {
    const state = down(armed(), pointerType);
    const atThreshold = reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 100 + threshold,
    });
    expect(atThreshold).toBe(state);

    const outside = reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 100 + threshold + Number.EPSILON * 100,
    });
    expect(outside).toMatchObject({ mode: "dragging", crossedDeadzone: true });
  });

  it("maps outward travel from either handle to one non-negative degree", () => {
    expect(stretchAmountFromClientDelta(0, STRETCH_TRAVEL_PX / 2, "bottom")).toBe(0.5);
    expect(stretchAmountFromClientDelta(0, -STRETCH_TRAVEL_PX / 2, "top")).toBe(0.5);
    expect(stretchAmountFromClientDelta(0.75, STRETCH_TRAVEL_PX, "bottom")).toBe(1);
    expect(stretchAmountFromClientDelta(0.75, -STRETCH_TRAVEL_PX, "top")).toBe(1);
    expect(stretchAmountFromClientDelta(0.25, -STRETCH_TRAVEL_PX, "bottom")).toBe(0);
    expect(stretchAmountFromClientDelta(0.25, STRETCH_TRAVEL_PX, "top")).toBe(0);
  });

  it("ignores foreign and non-finite moves and keeps ownership after crossing", () => {
    const state = down();
    expect(reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 8,
      clientY: 200,
    })).toBe(state);
    expect(reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: Number.NaN,
    })).toBe(state);

    const moved = reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 160,
    });
    const returnedInsideDeadzone = reduceStretchInteraction(moved, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 101,
    });
    expect(returnedInsideDeadzone).toMatchObject({
      mode: "dragging",
      crossedDeadzone: true,
      amount: 1 / STRETCH_TRAVEL_PX,
    });
  });

  it("uses the final pointer-up coordinate and commits only after crossing", () => {
    const state = down();
    expect(reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 8,
      clientY: 160,
    })).toBe(state);
    expect(reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 7,
      clientY: Number.NaN,
    })).toBe(state);
    expect(reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 104,
    })).toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
    expect(reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    })).toEqual({ mode: "committed", anchor: ANCHOR, amount: 0.5, lastHandle: "bottom" });
  });

  it("supports cumulative adjustment and intentional return to zero", () => {
    const first = reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    });
    const second = down(first);
    expect(reduceStretchInteraction(second, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 130,
    })).toMatchObject({ mode: "committed", amount: 0.75 });
    expect(reduceStretchInteraction(second, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 40,
    })).toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
  });

  it("sets a bounded degree without pointer state for an accessible control", () => {
    expect(reduceStretchInteraction(armed(), { type: "set-amount", amount: 0.25 }))
      .toMatchObject({ mode: "committed", amount: 0.25 });
    expect(reduceStretchInteraction(armed(), { type: "set-amount", amount: 5 }))
      .toMatchObject({ mode: "committed", amount: 1 });
    expect(reduceStretchInteraction(down(), { type: "set-amount", amount: 0.5 }))
      .toMatchObject({ mode: "dragging" });
    expect(reduceStretchInteraction(armed(), { type: "set-amount", amount: Number.NaN }))
      .toMatchObject({ mode: "armed", amount: 0 });
  });

  it.each(["pointer-cancel", "lost-pointer-capture"] as const)(
    "restores the prior committed degree on owning %s",
    (type) => {
      const committed = reduceStretchInteraction(down(), {
        type: "pointer-up",
        pointerId: 7,
        clientY: 160,
      });
      const dragging = reduceStretchInteraction(down(committed), {
        type: "pointer-move",
        pointerId: 7,
        clientY: 220,
      });
      expect(reduceStretchInteraction(dragging, { type, pointerId: 8 })).toBe(dragging);
      expect(reduceStretchInteraction(dragging, { type, pointerId: 7 })).toEqual({
        mode: "committed",
        anchor: ANCHOR,
        amount: 0.5,
        lastHandle: "bottom",
      });
    },
  );

  it("cancels active layout-stale pixels but preserves settled semantic degree", () => {
    const committed = reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    });
    expect(reduceStretchInteraction(committed, { type: "layout-invalidated" })).toBe(committed);

    const dragging = down(committed);
    expect(reduceStretchInteraction(dragging, { type: "layout-invalidated" })).toEqual({
      mode: "committed",
      anchor: ANCHOR,
      amount: 0.5,
      lastHandle: "bottom",
    });
  });

  it("commits the active handle only for transient preview and restores it on cancel", () => {
    const topCommitted = reduceStretchInteraction(down(armed(), "mouse", "top"), {
      type: "pointer-up", pointerId: 7, clientY: 40,
    });
    expect(topCommitted).toMatchObject({ mode: "committed", amount: 0.5, lastHandle: "top" });
    const bottomDragging = reduceStretchInteraction(down(topCommitted, "mouse", "bottom"), {
      type: "pointer-move", pointerId: 7, clientY: 130,
    });
    expect(reduceStretchInteraction(bottomDragging, {
      type: "pointer-cancel", pointerId: 7,
    })).toEqual({ mode: "committed", anchor: ANCHOR, amount: 0.5, lastHandle: "top" });
  });

  it.each([
    "selection-invalidated",
    "material-invalidated",
    "navigation-invalidated",
    "disarm",
  ] as const)("clears every anchored phase on %s", (type) => {
    for (const state of [armed(), down(), reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    })]) {
      expect(reduceStretchInteraction(state, { type })).toEqual({ mode: "idle" });
    }
  });
});
