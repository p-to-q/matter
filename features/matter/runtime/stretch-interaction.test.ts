import { describe, expect, it } from "vitest";
import type { SegmentSelection } from "../material/text-segments";
import {
  STRETCH_COMMIT_THRESHOLD,
  STRETCH_MOUSE_PEN_DEADZONE_PX,
  STRETCH_TOUCH_DEADZONE_PX,
  STRETCH_TRAVEL_PX,
  createStretchInteractionState,
  isStretchInteractionKey,
  reduceStretchInteraction,
  stretchCommitBasisFromTransition,
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
  documentEpoch: 3,
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

function setAmount(state: StretchInteractionState, amount: number): StretchInteractionState {
  if (state.mode !== "armed") throw new Error("test setup requires an armed stretch");
  return Object.freeze({ mode: "adjusted", anchor: state.anchor, amount, lastHandle: "bottom" });
}

describe("stretch interaction", () => {
  it("owns one semantic anchor including its document epoch", () => {
    const mutable = {
      selection: { ...SELECTION },
      treeId: ANCHOR.treeId,
      revision: ANCHOR.revision,
      documentEpoch: ANCHOR.documentEpoch,
    };
    const state = armed(mutable);
    mutable.selection.selectedText = "outside mutation";

    expect(state).toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
    expect(state.mode === "armed" && state.anchor).not.toBe(mutable);
    expect(state.mode === "armed" && state.anchor.selection).not.toBe(mutable.selection);
    expect(state.mode === "armed" && state.anchor.selection.selectedText).toBe("语言材料");
  });

  it("rejects malformed or stale anchors without replacing current state", () => {
    const state = armed();
    for (const anchor of [
      { ...ANCHOR, treeId: "" },
      { ...ANCHOR, revision: -1 },
      { ...ANCHOR, documentEpoch: -1 },
      { ...ANCHOR, revision: 1.5 },
      { ...ANCHOR, selection: { ...SELECTION, end: 0 } },
      { ...ANCHOR, selection: { ...SELECTION, selectedText: "" } },
    ] as StretchAnchor[]) {
      expect(reduceStretchInteraction(state, { type: "arm", anchor })).toBe(state);
    }

    expect(reduceStretchInteraction(state, { type: "arm", anchor: ANCHOR })).toBe(state);
    expect(reduceStretchInteraction(state, {
      type: "arm",
      anchor: { ...ANCHOR, documentEpoch: ANCHOR.documentEpoch + 1 },
    })).toMatchObject({ mode: "armed", amount: 0 });
  });

  it("gives either physical grip one valid primary pointer and changes no degree on down", () => {
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
      { ...base, handle: "side" as StretchHandle },
      { ...base, isPrimary: false },
      { ...base, button: 1 },
      { ...base, pointerId: -1 },
      { ...base, pointerId: Number.NaN },
      { ...base, clientY: Number.POSITIVE_INFINITY },
    ]) {
      expect(reduceStretchInteraction(state, event)).toBe(state);
    }

    expect(down()).toMatchObject({
      mode: "dragging",
      amount: 0,
      priorAmount: 0,
      crossedDeadzone: false,
    });
    expect(down(armed(), "mouse", "top")).toMatchObject({
      mode: "dragging",
      handle: "top",
      amount: 0,
      crossedDeadzone: false,
    });
    expect(reduceStretchInteraction(createStretchInteractionState(), base)).toEqual({ mode: "idle" });
  });

  it.each([
    ["mouse", STRETCH_MOUSE_PEN_DEADZONE_PX],
    ["pen", STRETCH_MOUSE_PEN_DEADZONE_PX],
    ["touch", STRETCH_TOUCH_DEADZONE_PX],
  ] as const)("uses the exact %s deadzone before previewing degree", (pointerType, threshold) => {
    const state = down(armed(), pointerType);
    expect(reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 100 + threshold,
    })).toBe(state);

    expect(reduceStretchInteraction(state, {
      type: "pointer-move",
      pointerId: 7,
      clientY: 100 + threshold + 0.001,
    })).toMatchObject({ mode: "dragging", crossedDeadzone: true });
  });

  it("maps 120 downward client pixels to the full degree", () => {
    expect(stretchAmountFromClientDelta(0, STRETCH_TRAVEL_PX / 2)).toBe(0.5);
    expect(stretchAmountFromClientDelta(0.75, STRETCH_TRAVEL_PX)).toBe(1);
    expect(stretchAmountFromClientDelta(0.25, -STRETCH_TRAVEL_PX)).toBe(0);
  });

  it("maps mirrored outward travel from either edge to the same shared degree", () => {
    expect(stretchAmountFromClientDelta(0, -STRETCH_TRAVEL_PX / 2, "top")).toBe(0.5);
    expect(stretchAmountFromClientDelta(0, STRETCH_TRAVEL_PX / 2, "bottom")).toBe(0.5);
    expect(stretchAmountFromClientDelta(0.5, STRETCH_TRAVEL_PX / 2, "top")).toBe(0);
    expect(stretchAmountFromClientDelta(0.5, -STRETCH_TRAVEL_PX / 2, "bottom")).toBe(0);
  });

  it("ignores foreign and non-finite pointer events", () => {
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
    expect(reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 8,
      clientY: 200,
    })).toBe(state);
  });

  it("resets a released amount below 0.15 and commits an exact-threshold basis", () => {
    expect(reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 100 + STRETCH_TRAVEL_PX * (STRETCH_COMMIT_THRESHOLD - 0.001),
    })).toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });

    const committed = reduceStretchInteraction(down(), {
      type: "pointer-up",
      pointerId: 7,
      clientY: 100 + STRETCH_TRAVEL_PX * STRETCH_COMMIT_THRESHOLD,
    });
    expect(committed).toMatchObject({
      mode: "committed",
      amount: STRETCH_COMMIT_THRESHOLD,
      lastHandle: "bottom",
      basis: {
        selection: SELECTION,
        treeId: ANCHOR.treeId,
        baseRevision: ANCHOR.revision,
        documentEpoch: ANCHOR.documentEpoch,
        amount: STRETCH_COMMIT_THRESHOLD,
      },
    });
  });

  it("returns one immutable commit basis and re-grabs without duplicating the commit", () => {
    const mutableSelection = { ...SELECTION };
    const state = down(armed({ ...ANCHOR, selection: mutableSelection }));
    const committed = reduceStretchInteraction(state, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 160,
    });
    expect(committed.mode).toBe("committed");
    if (committed.mode !== "committed") throw new Error("expected commit");
    mutableSelection.selectedText = "mutated later";
    expect(Object.isFrozen(committed.basis)).toBe(true);
    expect(Object.isFrozen(committed.basis.selection)).toBe(true);
    expect(committed.basis.selection.selectedText).toBe("语言材料");
    expect(stretchCommitBasisFromTransition(state, committed)).toBe(committed.basis);
    expect(stretchCommitBasisFromTransition(committed, committed)).toBeNull();
    const regrabbed = reduceStretchInteraction(committed, {
      type: "pointer-down",
      handle: "bottom",
      pointerId: 8,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientY: 100,
    });
    expect(regrabbed).toMatchObject({ mode: "dragging", priorAmount: committed.amount });
    expect(stretchCommitBasisFromTransition(committed, regrabbed)).toBeNull();
    expect(reduceStretchInteraction(committed, { type: "key-down", key: "Enter" })).toBe(committed);
    expect(reduceStretchInteraction(committed, { type: "arm", anchor: ANCHOR })).toBe(committed);
    expect(reduceStretchInteraction(committed, { type: "reopen" })).toEqual({
      mode: "adjusted",
      anchor: ANCHOR,
      amount: committed.amount,
      lastHandle: "bottom",
    });
  });

  it("lets an adjusted keyboard degree submit with one no-move grip release", () => {
    const adjusted = setAmount(armed(), 0.5);
    const pressing = down(adjusted);
    expect(pressing).toMatchObject({
      mode: "dragging",
      amount: 0.5,
      crossedDeadzone: false,
      tapCommits: true,
    });
    const committed = reduceStretchInteraction(pressing, {
      type: "pointer-up",
      pointerId: 7,
      clientY: 100,
    });
    expect(committed).toMatchObject({ mode: "committed", amount: 0.5 });
    expect(stretchCommitBasisFromTransition(pressing, committed)).toMatchObject({ amount: 0.5 });
  });

  it("does not submit an unadjusted, below-threshold, or pending re-grab tap", () => {
    expect(reduceStretchInteraction(down(armed()), {
      type: "pointer-up", pointerId: 7, clientY: 100,
    })).toMatchObject({ mode: "armed", amount: 0 });

    const below = setAmount(armed(), STRETCH_COMMIT_THRESHOLD - .01);
    expect(reduceStretchInteraction(down(below), {
      type: "pointer-up", pointerId: 7, clientY: 100,
    })).toMatchObject({ mode: "adjusted", amount: STRETCH_COMMIT_THRESHOLD - .01 });

    const dragged = reduceStretchInteraction(down(armed()), {
      type: "pointer-up", pointerId: 7, clientY: 160,
    });
    expect(dragged.mode).toBe("committed");
    if (dragged.mode !== "committed") throw new Error("expected committed state");
    const regrabbed = reduceStretchInteraction(dragged, {
      type: "pointer-down",
      handle: "bottom",
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientY: 100,
    });
    expect(regrabbed).toMatchObject({ mode: "dragging", tapCommits: false });
    expect(reduceStretchInteraction(regrabbed, {
      type: "pointer-up", pointerId: 7, clientY: 100,
    })).toMatchObject({ mode: "adjusted", amount: dragged.amount });
  });

  it.each(["pointer-cancel", "lost-pointer-capture"] as const)(
    "restores the prior keyboard-adjusted amount on owning %s",
    (type) => {
      const adjusted = setAmount(armed(), 0.5);
      const dragging = reduceStretchInteraction(down(adjusted), {
        type: "pointer-move",
        pointerId: 7,
        clientY: 220,
      });
      expect(reduceStretchInteraction(dragging, { type, pointerId: 8 })).toBe(dragging);
      expect(reduceStretchInteraction(dragging, { type, pointerId: 7 })).toEqual({
        mode: "adjusted",
        anchor: ANCHOR,
        amount: 0.5,
        lastHandle: "bottom",
      });
    },
  );

  it.each([
    "layout-invalidated",
    "scroll-invalidated",
    "resize-invalidated",
  ] as const)("rolls a drag back on %s without clearing a settled adjustment", (type) => {
    const adjusted = setAmount(armed(), 0.5);
    expect(reduceStretchInteraction(adjusted, { type })).toBe(adjusted);
    expect(reduceStretchInteraction(down(adjusted), { type })).toEqual({
      mode: "adjusted",
      anchor: ANCHOR,
      amount: 0.5,
      lastHandle: "bottom",
    });
  });

  it("keeps keyboard adjustment separate from Enter or Space commit", () => {
    let state = armed();
    state = reduceStretchInteraction(state, { type: "key-down", key: "ArrowUp" });
    expect(state).toMatchObject({ mode: "adjusted", amount: 0.1 });
    expect(reduceStretchInteraction(state, { type: "key-down", key: "Enter" }))
      .toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });

    state = reduceStretchInteraction(state, { type: "key-down", key: "ArrowRight" });
    expect(reduceStretchInteraction(state, { type: "key-down", key: " " }))
      .toMatchObject({ mode: "committed", amount: 0.2 });

    expect(reduceStretchInteraction(armed(), { type: "key-down", key: "PageUp" }))
      .toMatchObject({ mode: "adjusted", amount: 0.5 });
    expect(reduceStretchInteraction(setAmount(armed(), 0.75), { type: "key-down", key: "PageDown" }))
      .toMatchObject({ mode: "adjusted", amount: 0.25 });
    expect(reduceStretchInteraction(setAmount(armed(), 0.8), { type: "key-down", key: "Home" }))
      .toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
    expect(reduceStretchInteraction(armed(), { type: "key-down", key: "End" }))
      .toMatchObject({ mode: "adjusted", amount: 1 });
  });

  it("uses standard vertical-slider keys independently of mirrored physical travel", () => {
    expect(reduceStretchInteraction(armed(), {
      type: "key-down",
      key: "ArrowUp",
      handle: "top",
    })).toMatchObject({ mode: "adjusted", amount: 0.1, lastHandle: "top" });
    expect(reduceStretchInteraction(setAmount(armed(), 0.5), {
      type: "key-down",
      key: "ArrowDown",
      handle: "top",
    })).toMatchObject({ mode: "adjusted", amount: 0.4, lastHandle: "top" });
  });

  it("uses Escape to roll back a drag and clear every non-drag degree", () => {
    const adjusted = setAmount(armed(), 0.5);
    expect(reduceStretchInteraction(down(adjusted), { type: "key-down", key: "Escape" }))
      .toEqual({ mode: "adjusted", anchor: ANCHOR, amount: 0.5, lastHandle: "bottom" });
    expect(reduceStretchInteraction(adjusted, { type: "key-down", key: "Escape" }))
      .toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
    const committed = reduceStretchInteraction(adjusted, { type: "key-down", key: "Enter" });
    expect(reduceStretchInteraction(committed, { type: "key-down", key: "Escape" }))
      .toEqual({ mode: "armed", anchor: ANCHOR, amount: 0 });
  });

  it("recognizes only the closed stretch keyboard vocabulary", () => {
    for (const key of [
      "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "PageDown", "PageUp",
      "Home", "End", "Enter", " ", "Escape",
    ]) {
      expect(isStretchInteractionKey(key)).toBe(true);
    }
    expect(isStretchInteractionKey("Tab")).toBe(false);
    const state = armed();
    expect(reduceStretchInteraction(state, { type: "key-down", key: "Tab" })).toBe(state);
  });

  it.each([
    "selection-invalidated",
    "material-invalidated",
    "navigation-invalidated",
    "disarm",
  ] as const)("clears every anchored phase on %s", (type) => {
    for (const state of [armed(), setAmount(armed(), 0.5), down()]) {
      expect(reduceStretchInteraction(state, { type })).toEqual({ mode: "idle" });
    }
  });
});
