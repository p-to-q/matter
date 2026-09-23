import { describe, expect, it } from "vitest";
import {
  INITIAL_CANVAS_VIEWPORT,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  MIN_INDEX_TARGET_FONT_CSS_PX,
  planCanvasViewportForClientRect,
  projectCanvasAttentionField,
  reduceCanvasViewport,
  type CanvasViewportEvent,
  type CanvasViewportState,
} from "./canvas-viewport";

function apply(
  state: CanvasViewportState,
  event: CanvasViewportEvent,
): CanvasViewportState {
  const result = reduceCanvasViewport(state, event);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}

function down(
  pointerType: "mouse" | "touch" = "mouse",
): Extract<CanvasViewportEvent, { type: "pointer-down" }> {
  return {
    type: "pointer-down",
    pointerId: 3,
    pointerType,
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 80,
  };
}

function pinch(
  contacts: readonly [
    { pointerId: number; x: number; y: number },
    { pointerId: number; x: number; y: number },
    ...{ pointerId: number; x: number; y: number }[],
  ],
): Extract<CanvasViewportEvent, { type: "pinch-start" }> {
  return { type: "pinch-start", contacts };
}

describe("reduceCanvasViewport", () => {
  it("starts only a primary left-button gesture", () => {
    const ignored = apply(INITIAL_CANVAS_VIEWPORT, {
      ...down(),
      isPrimary: false,
    });
    expect(ignored.gesture).toBeNull();

    const rightClick = apply(INITIAL_CANVAS_VIEWPORT, {
      ...down(),
      button: 2,
    });
    expect(rightClick.gesture).toBeNull();

    const active = apply(INITIAL_CANVAS_VIEWPORT, down());
    expect(active.gesture).toMatchObject({
      pointerId: 3,
      startX: 100,
      startY: 80,
      dragging: false,
    });
  });

  it("uses a four CSS pixel mouse threshold without moving below it", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down());
    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 103,
      clientY: 80,
    });
    expect(state).toMatchObject({ x: 0, y: 0, userMoved: false });

    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 104,
      clientY: 80,
    });
    expect(state).toMatchObject({ x: 4, y: 0, userMoved: true });
  });

  it("uses an eight CSS pixel touch threshold", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down("touch"));
    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 107,
      clientY: 80,
    });
    expect(state.x).toBe(0);

    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 108,
      clientY: 80,
    });
    expect(state.x).toBe(8);
  });

  it("keeps one touch gesture continuous across sparse and off-surface samples", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down("touch"));
    for (const [clientX, clientY] of [
      [105, 83],
      [118, 94],
      [-40, 640],
      [250, -30],
    ] as const) {
      state = apply(state, {
        type: "pointer-move",
        pointerId: 3,
        clientX,
        clientY,
      });
    }

    expect(state).toMatchObject({
      x: 150,
      y: -110,
      userMoved: true,
      gesture: {
        pointerId: 3,
        lastX: 250,
        lastY: -30,
        dragging: true,
      },
    });
  });

  it("commits terminal pointer movement and recovers from cancel or lost capture", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down());
    state = apply(state, {
      type: "pointer-up",
      pointerId: 3,
      clientX: 120,
      clientY: 90,
    });
    expect(state).toMatchObject({ x: 20, y: 10, gesture: null });

    state = apply(state, down());
    state = apply(state, { type: "pointer-cancel", pointerId: 3 });
    expect(state.gesture).toBeNull();

    state = apply(state, down());
    state = apply(state, { type: "lost-pointer-capture", pointerId: 3 });
    expect(state.gesture).toBeNull();
  });

  it("ignores events belonging to another pointer", () => {
    const active = apply(INITIAL_CANVAS_VIEWPORT, down());
    const state = apply(active, {
      type: "pointer-move",
      pointerId: 9,
      clientX: 200,
      clientY: 200,
    });
    expect(state).toEqual(active);
  });

  it("pans and zooms around the moving multi-touch centre", () => {
    const before: CanvasViewportState = {
      ...INITIAL_CANVAS_VIEWPORT,
      x: 20,
      y: 10,
    };
    let state = apply(before, pinch([
      { pointerId: 1, x: 100, y: 100 },
      { pointerId: 2, x: 200, y: 100 },
    ]));
    state = apply(state, {
      type: "pointer-move",
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    });
    state = apply(state, {
      type: "pointer-move",
      pointerId: 2,
      clientX: 280,
      clientY: 120,
    });

    expect(state.zoom).toBeCloseTo(1.6);
    expect((200 - state.x) / state.zoom).toBeCloseTo((150 - before.x) / before.zoom);
    expect((120 - state.y) / state.zoom).toBeCloseTo((100 - before.y) / before.zoom);
    expect(state.userMoved).toBe(true);
  });

  it("rebases 1 to 2 to 1 fingers without reusing an old single-touch delta", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down("touch"));
    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 120,
      clientY: 80,
    });
    expect(state.x).toBe(20);

    const beforePinch = state;
    state = apply(state, pinch([
      { pointerId: 3, x: 120, y: 80 },
      { pointerId: 4, x: 220, y: 80 },
    ]));
    expect(state).toMatchObject({ x: beforePinch.x, y: beforePinch.y, zoom: beforePinch.zoom });
    state = apply(state, {
      type: "pointer-move",
      pointerId: 4,
      clientX: 260,
      clientY: 80,
    });
    const beforeLift = state;
    state = apply(state, {
      type: "pointer-up",
      pointerId: 4,
      clientX: 260,
      clientY: 80,
    });
    expect(state).toMatchObject({ x: beforeLift.x, y: beforeLift.y, zoom: beforeLift.zoom });
    expect(state.gesture).toMatchObject({ kind: "pan", pointerId: 3, startX: 120, originX: beforeLift.x });

    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 130,
      clientY: 80,
    });
    expect(state.x).toBeCloseTo(beforeLift.x + 10);
    state = apply(state, {
      type: "pointer-up",
      pointerId: 3,
      clientX: 130,
      clientY: 80,
    });
    expect(state.gesture).toBeNull();
  });

  it("rebases predictably when a third contact joins or one contact is cancelled", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, pinch([
      { pointerId: 1, x: 100, y: 100 },
      { pointerId: 2, x: 200, y: 100 },
    ]));
    state = apply(state, {
      type: "pointer-move",
      pointerId: 2,
      clientX: 240,
      clientY: 100,
    });
    const beforeThird = state;
    state = apply(state, pinch([
      { pointerId: 1, x: 100, y: 100 },
      { pointerId: 2, x: 240, y: 100 },
      { pointerId: 3, x: 170, y: 200 },
    ]));
    expect(state).toMatchObject({ x: beforeThird.x, y: beforeThird.y, zoom: beforeThird.zoom });

    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 170,
      clientY: 230,
    });
    const beforeCancel = state;
    state = apply(state, { type: "pointer-cancel", pointerId: 1 });
    expect(state).toMatchObject({ x: beforeCancel.x, y: beforeCancel.y, zoom: beforeCancel.zoom });
    expect(state.gesture).toMatchObject({ kind: "pinch" });
    if (state.gesture?.kind !== "pinch") throw new Error("Expected a rebased pinch");
    expect(state.gesture.contacts.map(({ pointerId }) => pointerId)).toEqual([2, 3]);
  });

  it("clamps pinch zoom without letting the anchored material point drift", () => {
    const before: CanvasViewportState = {
      ...INITIAL_CANVAS_VIEWPORT,
      x: 30,
      y: -10,
      zoom: 1.7,
    };
    let state = apply(before, pinch([
      { pointerId: 1, x: 100, y: 100 },
      { pointerId: 2, x: 200, y: 100 },
    ]));
    state = apply(state, {
      type: "pointer-move",
      pointerId: 2,
      clientX: 400,
      clientY: 100,
    });
    expect(state.zoom).toBe(MAX_CANVAS_ZOOM);
    const currentCenterX = 250;
    const currentCenterY = 100;
    expect((currentCenterX - state.x) / state.zoom).toBeCloseTo((150 - before.x) / before.zoom);
    expect((currentCenterY - state.y) / state.zoom).toBeCloseTo((100 - before.y) / before.zoom);

    state = apply(state, {
      type: "pointer-move",
      pointerId: 1,
      clientX: 120,
      clientY: 130,
    });
    state = apply(state, {
      type: "pointer-move",
      pointerId: 2,
      clientX: 420,
      clientY: 130,
    });
    expect(state.zoom).toBe(MAX_CANVAS_ZOOM);
    expect((270 - state.x) / state.zoom).toBeCloseTo((150 - before.x) / before.zoom);
    expect((130 - state.y) / state.zoom).toBeCloseTo((100 - before.y) / before.zoom);
  });

  it("clears multi-touch ownership after lost capture and lifecycle cancellation", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, pinch([
      { pointerId: 1, x: 100, y: 100 },
      { pointerId: 2, x: 200, y: 100 },
    ]));
    state = apply(state, { type: "lost-pointer-capture", pointerId: 1 });
    expect(state.gesture).toMatchObject({ kind: "pan", pointerId: 2, dragging: true });
    state = apply(state, { type: "gesture-cancel" });
    expect(state.gesture).toBeNull();
  });

  it("normalizes wheel delta modes and pans opposite the scroll delta", () => {
    const pixels = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      surfaceX: 0,
      surfaceY: 0,
      deltaX: 5,
      deltaY: -3,
      deltaMode: 0,
      ctrlKey: false,
    });
    expect(pixels).toMatchObject({ x: -5, y: 3, userMoved: true });

    const lines = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      surfaceX: 0,
      surfaceY: 0,
      deltaX: 1,
      deltaY: 2,
      deltaMode: 1,
      ctrlKey: false,
    });
    expect(lines).toMatchObject({ x: -16, y: -32 });

    const pages = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      surfaceX: 0,
      surfaceY: 0,
      deltaX: 0,
      deltaY: 1,
      deltaMode: 2,
      ctrlKey: false,
    });
    expect(pages.y).toBe(-800);
  });

  it("keeps the material point beneath the pointer fixed while zooming", () => {
    const before: CanvasViewportState = {
      ...INITIAL_CANVAS_VIEWPORT,
      x: 20,
      y: 10,
    };
    const after = apply(before, {
      type: "wheel",
      surfaceX: 120,
      surfaceY: 60,
      deltaX: 0,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: true,
    });

    expect((120 - after.x) / after.zoom).toBeCloseTo((120 - before.x) / before.zoom);
    expect((60 - after.y) / after.zoom).toBeCloseTo((60 - before.y) / before.zoom);
    expect(after.zoom).toBeGreaterThan(1);
  });

  it("clamps zoom and does not mark a clamped no-op as movement", () => {
    const maximum: CanvasViewportState = {
      ...INITIAL_CANVAS_VIEWPORT,
      zoom: MAX_CANVAS_ZOOM,
    };
    const stillMaximum = apply(maximum, {
      type: "wheel",
      surfaceX: 10,
      surfaceY: 10,
      deltaX: 0,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(stillMaximum).toMatchObject({ zoom: MAX_CANVAS_ZOOM, userMoved: false });

    const minimum = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      surfaceX: 10,
      surfaceY: 10,
      deltaX: 0,
      deltaY: 1e6,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(minimum.zoom).toBe(MIN_CANVAS_ZOOM);
  });

  it("reset restores origin, zoom, movement provenance, and gesture", () => {
    let state = apply(INITIAL_CANVAS_VIEWPORT, down());
    state = apply(state, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 130,
      clientY: 90,
    });
    state = apply(state, {
      type: "wheel",
      surfaceX: 120,
      surfaceY: 80,
      deltaX: 0,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(state.zoom).toBeGreaterThan(1);
    expect(apply(state, { type: "reset" })).toEqual(INITIAL_CANVAS_VIEWPORT);
  });

  it("returns stable failures for invalid finite inputs without throwing", () => {
    const invalidCoordinate = reduceCanvasViewport(INITIAL_CANVAS_VIEWPORT, {
      type: "pointer-move",
      pointerId: 3,
      clientX: Number.NaN,
      clientY: 0,
    });
    expect(invalidCoordinate).toEqual({
      ok: false,
      error: { code: "INVALID_POINTER_COORDINATE" },
    });

    const invalidState = reduceCanvasViewport(
      { ...INITIAL_CANVAS_VIEWPORT, zoom: Number.POSITIVE_INFINITY },
      { type: "reset" },
    );
    expect(invalidState).toEqual({
      ok: false,
      error: { code: "INVALID_VIEWPORT_STATE" },
    });

    const invalidMode = reduceCanvasViewport(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      surfaceX: 0,
      surfaceY: 0,
      deltaX: 0,
      deltaY: 1,
      deltaMode: 9 as 0,
      ctrlKey: false,
    });
    expect(invalidMode).toEqual({
      ok: false,
      error: { code: "INVALID_WHEEL_MODE" },
    });
  });

  it("publishes immutable, serializable snapshots without mutating input", () => {
    const input = apply(INITIAL_CANVAS_VIEWPORT, down());
    const before = JSON.stringify(input);
    const result = reduceCanvasViewport(input, {
      type: "pointer-move",
      pointerId: 3,
      clientX: 120,
      clientY: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);

    expect(JSON.stringify(input)).toBe(before);
    expect(() => JSON.stringify(result.state)).not.toThrow();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.gesture)).toBe(true);
    expect(() => {
      (result.state as { x: number }).x = 999;
    }).toThrow();
  });
});

describe("plan canvas viewport around measured material", () => {
  it("moves the camera by the exact client-space delta without changing zoom", () => {
    const state: CanvasViewportState = {
      ...INITIAL_CANVAS_VIEWPORT,
      x: 20,
      y: -10,
      zoom: 1.4,
    };
    expect(planCanvasViewportForClientRect(
      state,
      { left: 720, top: 510, width: 200, height: 80 },
      { left: 0, top: 0, width: 1280, height: 800 },
      { x: 0, y: 0 },
    )).toEqual({
      durationMs: 257,
      motion: "smooth",
      state: {
        ...state,
        x: -160,
        y: -160,
        userMoved: true,
      },
    });
  });

  it("uses the visual viewport offset and returns the same state at centre", () => {
    const state = { ...INITIAL_CANVAS_VIEWPORT, userMoved: true };
    expect(planCanvasViewportForClientRect(
      state,
      { left: 170, top: 260, width: 100, height: 80 },
      { left: 20, top: 40, width: 400, height: 520 },
      { x: 0, y: 0 },
    )).toEqual({ durationMs: 0, motion: "instant", state });
  });

  it("preserves zoom while material fits and only scales oversized material down", () => {
    const fitting = planCanvasViewportForClientRect(
      { ...INITIAL_CANVAS_VIEWPORT, zoom: 1.25 },
      { left: 90, top: 100, width: 250, height: 120 },
      { left: 0, top: 0, width: 400, height: 500 },
      { x: 0, y: 0 },
    );
    expect(fitting?.state.zoom).toBe(1.25);

    const oversized = planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { left: 100, top: 100, width: 500, height: 500 },
      { left: 0, top: 0, width: 400, height: 500 },
      { x: 0, y: 0 },
    );
    expect(oversized?.state.zoom).toBe(.704);
    expect(oversized?.state).toMatchObject({ x: -46.4, y: 3.6 });
    expect(oversized?.motion).toBe("smooth");
  });

  it("raises only undersized target type to the measured screen-space floor", () => {
    const undersized = planCanvasViewportForClientRect(
      { ...INITIAL_CANVAS_VIEWPORT, zoom: MIN_CANVAS_ZOOM },
      { fontCssPx: 17, left: 110, top: 190, width: 180, height: 40 },
      { left: 0, top: 0, width: 400, height: 500 },
      { x: 0, y: 0 },
    );
    expect(undersized?.state.zoom).toBe(.883);
    expect(17 * (undersized?.state.zoom ?? 0)).toBeGreaterThanOrEqual(MIN_INDEX_TARGET_FONT_CSS_PX);

    const alreadyReadable = planCanvasViewportForClientRect(
      { ...INITIAL_CANVAS_VIEWPORT, zoom: .9 },
      { fontCssPx: 17, left: 110, top: 190, width: 180, height: 40 },
      { left: 0, top: 0, width: 400, height: 500 },
      { x: 0, y: 0 },
    );
    expect(alreadyReadable?.state.zoom).toBe(.9);
  });

  it("keeps the target-specific readable floor when an oversized passage cannot also fit", () => {
    const plan = planCanvasViewportForClientRect(
      { ...INITIAL_CANVAS_VIEWPORT, zoom: .7 },
      { fontCssPx: 17, left: -40, top: -100, width: 1_800, height: 1_200 },
      { left: 0, top: 0, width: 320, height: 480 },
      { x: 0, y: 0 },
    );
    expect(plan?.state.zoom).toBe(.883);
  });

  it("bounds an unusually small authored font at the maximum camera zoom", () => {
    const plan = planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { fontCssPx: 4, left: 120, top: 220, width: 40, height: 12 },
      { left: 0, top: 0, width: 400, height: 500 },
      { x: 0, y: 0 },
    );
    expect(plan?.state.zoom).toBe(MAX_CANVAS_ZOOM);
  });

  it("fits against the exposed attention field rather than the occluded viewport", () => {
    const result = planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { left: 100, top: 300, width: 300, height: 80 },
      { left: 0, top: 0, width: 400, height: 800 },
      { x: 0, y: 0 },
      { x: 348, y: 400, width: 88, height: 800 },
    );
    expect(result?.state.zoom).toBe(MIN_CANVAS_ZOOM);
    expect(result?.state.x).toBe(198);
  });

  it("keeps the minimum readable camera scale when even that cannot fit", () => {
    expect(planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { left: -100, top: -100, width: 2_000, height: 2_000 },
      { left: 0, top: 0, width: 320, height: 480 },
      { x: 0, y: 0 },
    )?.state.zoom).toBe(MIN_CANVAS_ZOOM);
  });

  it("fails closed for active gestures and malformed geometry", () => {
    const active = apply(INITIAL_CANVAS_VIEWPORT, down());
    expect(planCanvasViewportForClientRect(
      active,
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 0, top: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
    )).toBeNull();
    expect(planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { left: 0, top: 0, width: 0, height: 10 },
      { left: 0, top: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
    )).toBeNull();
    expect(planCanvasViewportForClientRect(
      INITIAL_CANVAS_VIEWPORT,
      { fontCssPx: Number.NaN, left: 0, top: 0, width: 10, height: 10 },
      { left: 0, top: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
    )).toBeNull();
  });
});

describe("project the visual attention centre", () => {
  const visual = { left: 0, top: 0, width: 400, height: 800 };
  const canvas = { left: 8, top: 66, width: 384, height: 726 };

  it("uses the browser centre without an overlapping instrument", () => {
    expect(projectCanvasAttentionField(visual, canvas)).toEqual({
      height: 800,
      width: 400,
      x: 200,
      y: 400,
    });
    expect(projectCanvasAttentionField(
      visual,
      canvas,
      { left: 0, top: 0, width: 80, height: 800 },
    )).toEqual({ height: 800, width: 400, x: 200, y: 400 });
  });

  it("gives a nearly full-width drawer the exposed canvas centre", () => {
    expect(projectCanvasAttentionField(
      visual,
      canvas,
      { left: 0, top: 0, width: 304, height: 800 },
    )).toEqual({ height: 800, width: 88, x: 348, y: 400 });
  });

  it("preserves the closed reading centre through a compact surface translation", () => {
    expect(projectCanvasAttentionField(
      visual,
      canvas,
      { left: 0, top: 0, width: 304, height: 800 },
      304,
    )).toEqual({ height: 800, width: 400, x: 504, y: 400 });
  });

  it("blends continuously through an intermediate overlap", () => {
    const point = projectCanvasAttentionField(
      { left: 0, top: 0, width: 800, height: 800 },
      { left: 8, top: 8, width: 784, height: 784 },
      { left: 0, top: 0, width: 320, height: 800 },
    );
    expect(point?.x).toBeGreaterThan(400);
    expect(point?.x).toBeLessThan(556);
    expect(point?.width).toBeGreaterThan(472);
    expect(point?.width).toBeLessThan(800);
  });

  it("ignores a floating or vertically separate occluder", () => {
    expect(projectCanvasAttentionField(
      visual,
      canvas,
      { left: 120, top: 0, width: 180, height: 800 },
    )).toEqual({ height: 800, width: 400, x: 200, y: 400 });
    expect(projectCanvasAttentionField(
      visual,
      canvas,
      { left: 0, top: 0, width: 304, height: 100 },
    )).toEqual({ height: 800, width: 400, x: 200, y: 400 });
  });
});
