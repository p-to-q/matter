import { describe, expect, it } from "vitest";
import {
  INITIAL_CANVAS_VIEWPORT,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
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

  it("normalizes wheel delta modes and pans opposite the scroll delta", () => {
    const pixels = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      clientX: 0,
      clientY: 0,
      deltaX: 5,
      deltaY: -3,
      deltaMode: 0,
      ctrlKey: false,
    });
    expect(pixels).toMatchObject({ x: -5, y: 3, userMoved: true });

    const lines = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      clientX: 0,
      clientY: 0,
      deltaX: 1,
      deltaY: 2,
      deltaMode: 1,
      ctrlKey: false,
    });
    expect(lines).toMatchObject({ x: -16, y: -32 });

    const pages = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      clientX: 0,
      clientY: 0,
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
      clientX: 120,
      clientY: 60,
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
      clientX: 10,
      clientY: 10,
      deltaX: 0,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(stillMaximum).toMatchObject({ zoom: MAX_CANVAS_ZOOM, userMoved: false });

    const minimum = apply(INITIAL_CANVAS_VIEWPORT, {
      type: "wheel",
      clientX: 10,
      clientY: 10,
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
      clientX: 0,
      clientY: 0,
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
