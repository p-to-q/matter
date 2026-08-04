export const MIN_CANVAS_ZOOM = 0.6;
export const MAX_CANVAS_ZOOM = 1.8;

const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_DRAG_THRESHOLD = 8;
const WHEEL_LINE_CSS_PX = 16;
const WHEEL_PAGE_CSS_PX = 800;
const WHEEL_ZOOM_RATE = 0.002;

export type CanvasPointerType = "mouse" | "pen" | "touch";

export type CanvasViewportGesture = Readonly<{
  pointerId: number;
  pointerType: CanvasPointerType;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  originX: number;
  originY: number;
  dragging: boolean;
}>;

export type CanvasViewportState = Readonly<{
  x: number;
  y: number;
  zoom: number;
  userMoved: boolean;
  gesture: CanvasViewportGesture | null;
}>;

export type CanvasViewportEvent =
  | Readonly<{
      type: "pointer-down";
      pointerId: number;
      pointerType: CanvasPointerType;
      isPrimary: boolean;
      button: number;
      clientX: number;
      clientY: number;
    }>
  | Readonly<{
      type: "pointer-move";
      pointerId: number;
      clientX: number;
      clientY: number;
    }>
  | Readonly<{
      type: "pointer-up";
      pointerId: number;
      clientX: number;
      clientY: number;
    }>
  | Readonly<{ type: "pointer-cancel"; pointerId: number }>
  | Readonly<{ type: "lost-pointer-capture"; pointerId: number }>
  | Readonly<{
      type: "wheel";
      clientX: number;
      clientY: number;
      deltaX: number;
      deltaY: number;
      deltaMode: 0 | 1 | 2;
      ctrlKey: boolean;
    }>
  | Readonly<{ type: "reset" }>;

export type CanvasViewportErrorCode =
  | "INVALID_VIEWPORT_STATE"
  | "INVALID_POINTER"
  | "INVALID_POINTER_COORDINATE"
  | "INVALID_WHEEL_DELTA"
  | "INVALID_WHEEL_MODE"
  | "VIEWPORT_OVERFLOW";

export type CanvasViewportResult =
  | Readonly<{ ok: true; state: CanvasViewportState }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: CanvasViewportErrorCode }>;
    }>;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function freezeGesture(
  gesture: CanvasViewportGesture | null,
): CanvasViewportGesture | null {
  return gesture === null ? null : Object.freeze({ ...gesture });
}

function success(
  state: Omit<CanvasViewportState, "gesture"> & {
    gesture: CanvasViewportGesture | null;
  },
): CanvasViewportResult {
  return Object.freeze({
    ok: true,
    state: Object.freeze({ ...state, gesture: freezeGesture(state.gesture) }),
  });
}

function failure(code: CanvasViewportErrorCode): CanvasViewportResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

export const INITIAL_CANVAS_VIEWPORT: CanvasViewportState = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
  userMoved: false,
  gesture: null,
});

function isValidGesture(gesture: CanvasViewportGesture): boolean {
  return (
    Number.isSafeInteger(gesture.pointerId) &&
    gesture.pointerId >= 0 &&
    (gesture.pointerType === "mouse" ||
      gesture.pointerType === "pen" ||
      gesture.pointerType === "touch") &&
    isFiniteNumber(gesture.startX) &&
    isFiniteNumber(gesture.startY) &&
    isFiniteNumber(gesture.lastX) &&
    isFiniteNumber(gesture.lastY) &&
    isFiniteNumber(gesture.originX) &&
    isFiniteNumber(gesture.originY) &&
    typeof gesture.dragging === "boolean"
  );
}

function isValidState(state: CanvasViewportState): boolean {
  return (
    isFiniteNumber(state.x) &&
    isFiniteNumber(state.y) &&
    isFiniteNumber(state.zoom) &&
    state.zoom >= MIN_CANVAS_ZOOM &&
    state.zoom <= MAX_CANVAS_ZOOM &&
    typeof state.userMoved === "boolean" &&
    (state.gesture === null || isValidGesture(state.gesture))
  );
}

function validPointerId(pointerId: number): boolean {
  return Number.isSafeInteger(pointerId) && pointerId >= 0;
}

function validPoint(x: number, y: number): boolean {
  return isFiniteNumber(x) && isFiniteNumber(y);
}

function unchanged(state: CanvasViewportState): CanvasViewportResult {
  return success(state);
}

function movePointer(
  state: CanvasViewportState,
  pointerId: number,
  clientX: number,
  clientY: number,
): CanvasViewportResult {
  if (!validPointerId(pointerId)) {
    return failure("INVALID_POINTER");
  }
  if (!validPoint(clientX, clientY)) {
    return failure("INVALID_POINTER_COORDINATE");
  }

  const gesture = state.gesture;
  if (gesture === null || gesture.pointerId !== pointerId) {
    return unchanged(state);
  }

  const deltaX = clientX - gesture.startX;
  const deltaY = clientY - gesture.startY;
  const threshold =
    gesture.pointerType === "touch"
      ? TOUCH_DRAG_THRESHOLD
      : MOUSE_DRAG_THRESHOLD;
  const dragging =
    gesture.dragging || Math.hypot(deltaX, deltaY) >= threshold;
  const x = dragging ? gesture.originX + deltaX : state.x;
  const y = dragging ? gesture.originY + deltaY : state.y;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return failure("VIEWPORT_OVERFLOW");
  }

  return success({
    ...state,
    x,
    y,
    userMoved: state.userMoved || dragging,
    gesture: { ...gesture, lastX: clientX, lastY: clientY, dragging },
  });
}

function wheelScale(deltaMode: number): number | null {
  if (deltaMode === 0) return 1;
  if (deltaMode === 1) return WHEEL_LINE_CSS_PX;
  if (deltaMode === 2) return WHEEL_PAGE_CSS_PX;
  return null;
}

/**
 * Owns only transient canvas navigation. Material and layout coordinates never
 * enter this reducer, so pointer recovery cannot accidentally author a position.
 */
export function reduceCanvasViewport(
  state: CanvasViewportState,
  event: CanvasViewportEvent,
): CanvasViewportResult {
  if (!isValidState(state)) {
    return failure("INVALID_VIEWPORT_STATE");
  }

  switch (event.type) {
    case "pointer-down": {
      if (!validPointerId(event.pointerId)) {
        return failure("INVALID_POINTER");
      }
      if (!validPoint(event.clientX, event.clientY)) {
        return failure("INVALID_POINTER_COORDINATE");
      }
      if (
        !event.isPrimary ||
        state.gesture !== null ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return unchanged(state);
      }
      if (
        event.pointerType !== "mouse" &&
        event.pointerType !== "pen" &&
        event.pointerType !== "touch"
      ) {
        return failure("INVALID_POINTER");
      }
      return success({
        ...state,
        gesture: {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          originX: state.x,
          originY: state.y,
          dragging: false,
        },
      });
    }

    case "pointer-move":
      return movePointer(
        state,
        event.pointerId,
        event.clientX,
        event.clientY,
      );

    case "pointer-up": {
      const moved = movePointer(
        state,
        event.pointerId,
        event.clientX,
        event.clientY,
      );
      if (!moved.ok || moved.state.gesture?.pointerId !== event.pointerId) {
        return moved;
      }
      return success({ ...moved.state, gesture: null });
    }

    case "pointer-cancel":
    case "lost-pointer-capture": {
      if (!validPointerId(event.pointerId)) {
        return failure("INVALID_POINTER");
      }
      if (state.gesture?.pointerId !== event.pointerId) {
        return unchanged(state);
      }
      return success({ ...state, gesture: null });
    }

    case "wheel": {
      if (!validPoint(event.clientX, event.clientY)) {
        return failure("INVALID_POINTER_COORDINATE");
      }
      if (!isFiniteNumber(event.deltaX) || !isFiniteNumber(event.deltaY)) {
        return failure("INVALID_WHEEL_DELTA");
      }
      const scale = wheelScale(event.deltaMode);
      if (scale === null) {
        return failure("INVALID_WHEEL_MODE");
      }
      const deltaX = event.deltaX * scale;
      const deltaY = event.deltaY * scale;

      if (event.ctrlKey) {
        const zoom = Math.min(
          MAX_CANVAS_ZOOM,
          Math.max(
            MIN_CANVAS_ZOOM,
            state.zoom * Math.exp(-deltaY * WHEEL_ZOOM_RATE),
          ),
        );
        const ratio = zoom / state.zoom;
        const x = event.clientX - (event.clientX - state.x) * ratio;
        const y = event.clientY - (event.clientY - state.y) * ratio;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(zoom)) {
          return failure("VIEWPORT_OVERFLOW");
        }
        if (zoom === state.zoom) {
          return unchanged(state);
        }
        return success({ ...state, x, y, zoom, userMoved: true });
      }

      const x = state.x - deltaX;
      const y = state.y - deltaY;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return failure("VIEWPORT_OVERFLOW");
      }
      if (x === state.x && y === state.y) {
        return unchanged(state);
      }
      return success({ ...state, x, y, userMoved: true });
    }

    case "reset":
      return success(INITIAL_CANVAS_VIEWPORT);

    default:
      return failure("INVALID_VIEWPORT_STATE");
  }
}
