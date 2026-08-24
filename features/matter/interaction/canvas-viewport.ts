export const MIN_CANVAS_ZOOM = 0.6;
export const MAX_CANVAS_ZOOM = 1.8;
export const MIN_INDEX_TARGET_FONT_CSS_PX = 15;

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

export type ClientRectGeometry = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type CanvasTargetGeometry = ClientRectGeometry & Readonly<{
  fontCssPx?: number;
}>;

export type ClientPointGeometry = Readonly<{
  x: number;
  y: number;
}>;

export type CanvasAttentionGeometry = ClientPointGeometry & Readonly<{
  width: number;
  height: number;
}>;

export type CanvasViewportFocusPlan = Readonly<{
  durationMs: number;
  motion: "instant" | "smooth";
  state: CanvasViewportState;
}>;

const ATTENTION_BLEND_START = .24;
const ATTENTION_BLEND_END = .72;

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
      surfaceX: number;
      surfaceY: number;
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

function isValidClientRect(rect: ClientRectGeometry): boolean {
  return (
    isFiniteNumber(rect.left) &&
    isFiniteNumber(rect.top) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
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
      if (!validPoint(event.surfaceX, event.surfaceY)) {
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
        const x = event.surfaceX - (event.surfaceX - state.x) * ratio;
        const y = event.surfaceY - (event.surfaceY - state.y) * ratio;
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

/**
 * Plans one transient camera move around measured client geometry. Zoom is
 * preserved while the target both fits and remains readable. A target below
 * the screen-space type floor is enlarged only to that floor; oversized
 * material may scale down only until the same floor. Readability is
 * authoritative when the two constraints conflict, so that case is a centred
 * best effort rather than an illegible fit. DOM measurement and motion
 * presentation stay at the render edge.
 */
export function planCanvasViewportForClientRect(
  state: CanvasViewportState,
  target: CanvasTargetGeometry,
  visualViewport: ClientRectGeometry,
  worldOrigin: ClientPointGeometry,
  attention?: CanvasAttentionGeometry,
): CanvasViewportFocusPlan | null {
  if (
    !isValidState(state) ||
    state.gesture !== null ||
    !isValidClientRect(target) ||
    !isValidClientRect(visualViewport) ||
    !validPoint(worldOrigin.x, worldOrigin.y) ||
    (target.fontCssPx !== undefined && (
      !isFiniteNumber(target.fontCssPx) || target.fontCssPx <= 0
    )) ||
    (attention !== undefined && (
      !validPoint(attention.x, attention.y) ||
      !isFiniteNumber(attention.width) || attention.width <= 0 ||
      !isFiniteNumber(attention.height) || attention.height <= 0
    ))
  ) return null;

  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const viewportCenterX = attention?.x ?? visualViewport.left + visualViewport.width / 2;
  const viewportCenterY = attention?.y ?? visualViewport.top + visualViewport.height / 2;
  const attentionWidth = attention?.width ?? visualViewport.width;
  const attentionHeight = attention?.height ?? visualViewport.height;
  const safeInset = Math.min(attentionWidth, attentionHeight) * .06;
  const availableWidth = attentionWidth - safeInset * 2;
  const availableHeight = attentionHeight - safeInset * 2;
  const naturalWidth = target.width / state.zoom;
  const naturalHeight = target.height / state.zoom;
  const fittedZoom = Math.min(
    state.zoom,
    availableWidth / naturalWidth,
    availableHeight / naturalHeight,
  );
  const readableZoom = target.fontCssPx === undefined
    ? MIN_CANVAS_ZOOM
    : Math.min(MAX_CANVAS_ZOOM, Math.max(
        MIN_CANVAS_ZOOM,
        MIN_INDEX_TARGET_FONT_CSS_PX / target.fontCssPx,
      ));
  const zoom = Math.min(
    MAX_CANVAS_ZOOM,
    Math.max(ceilClientValue(readableZoom), roundClientValue(fittedZoom)),
  );
  const worldTargetX = (targetCenterX - worldOrigin.x - state.x) / state.zoom;
  const worldTargetY = (targetCenterY - worldOrigin.y - state.y) / state.zoom;
  const x = roundClientValue(viewportCenterX - worldOrigin.x - worldTargetX * zoom);
  const y = roundClientValue(viewportCenterY - worldOrigin.y - worldTargetY * zoom);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  const next = x === state.x && y === state.y && zoom === state.zoom
    ? state
    : Object.freeze({ ...state, x, y, zoom, userMoved: true });
  const travel = Math.hypot(x - state.x, y - state.y) +
    Math.abs(zoom - state.zoom) * Math.min(visualViewport.width, visualViewport.height);
  const motionThreshold = Math.min(visualViewport.width, visualViewport.height) * .015;
  if (next === state || travel <= motionThreshold) {
    return Object.freeze({ durationMs: 0, motion: "instant", state: next });
  }
  const travelRatio = Math.min(1, travel / Math.hypot(visualViewport.width, visualViewport.height));
  return Object.freeze({
    durationMs: Math.round(220 + travelRatio * 240),
    motion: "smooth",
    state: next,
  });
}

/**
 * Blends the browser centre toward the still-visible canvas only when an
 * overlapping instrument consumes a material share of the visual viewport.
 * A compact disclosure may instead publish its exact temporary surface shift:
 * the open target then keeps the camera that will become browser-centred when
 * that purely presentational shift is removed. Smoothstep avoids a sudden jump
 * for the ordinary adaptive path.
 */
export function projectCanvasAttentionField(
  visualViewport: ClientRectGeometry,
  canvas: ClientRectGeometry,
  occluder?: ClientRectGeometry,
  returnTranslationX = 0,
): CanvasAttentionGeometry | null {
  if (
    !isValidClientRect(visualViewport) ||
    !isValidClientRect(canvas) ||
    (occluder !== undefined && !isValidClientRect(occluder)) ||
    !isFiniteNumber(returnTranslationX)
  ) return null;
  const browserCenter = Object.freeze({
    height: visualViewport.height,
    width: visualViewport.width,
    x: visualViewport.left + visualViewport.width / 2,
    y: visualViewport.top + visualViewport.height / 2,
  });
  if (occluder === undefined) return browserCenter;

  const canvasLeft = Math.max(visualViewport.left, canvas.left);
  const canvasRight = Math.min(visualViewport.left + visualViewport.width, canvas.left + canvas.width);
  const overlapLeft = Math.max(canvasLeft, occluder.left);
  const overlapRight = Math.min(canvasRight, occluder.left + occluder.width);
  const canvasTop = Math.max(visualViewport.top, canvas.top);
  const canvasBottom = Math.min(visualViewport.top + visualViewport.height, canvas.top + canvas.height);
  const overlapTop = Math.max(canvasTop, occluder.top);
  const overlapBottom = Math.min(canvasBottom, occluder.top + occluder.height);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  const coversAttentionY = overlapTop <= browserCenter.y && overlapBottom >= browserCenter.y;
  const touchesLeftEdge = occluder.left <= canvasLeft + 1 && overlapRight < canvasRight;
  const touchesRightEdge = occluder.left + occluder.width >= canvasRight - 1 && overlapLeft > canvasLeft;
  if (
    overlapWidth === 0 ||
    overlapHeight === 0 ||
    canvasRight <= canvasLeft ||
    !coversAttentionY ||
    (!touchesLeftEdge && !touchesRightEdge)
  ) return browserCenter;

  if (returnTranslationX !== 0) {
    return Object.freeze({
      ...browserCenter,
      x: roundClientValue(browserCenter.x + returnTranslationX),
    });
  }

  const visibleLeft = touchesLeftEdge ? Math.max(canvasLeft, overlapRight) : canvasLeft;
  const visibleRight = touchesLeftEdge ? canvasRight : Math.min(canvasRight, overlapLeft);
  if (visibleRight <= visibleLeft) return browserCenter;
  const share = overlapWidth / visualViewport.width;
  const progress = Math.max(0, Math.min(1,
    (share - ATTENTION_BLEND_START) / (ATTENTION_BLEND_END - ATTENTION_BLEND_START),
  ));
  const weight = progress * progress * (3 - 2 * progress);
  const exposedCenterX = visibleLeft + (visibleRight - visibleLeft) / 2;
  const exposedWidth = visibleRight - visibleLeft;
  return Object.freeze({
    height: visualViewport.height,
    width: roundClientValue(visualViewport.width + (exposedWidth - visualViewport.width) * weight),
    x: roundClientValue(browserCenter.x + (exposedCenterX - browserCenter.x) * weight),
    y: browserCenter.y,
  });
}

function roundClientValue(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function ceilClientValue(value: number): number {
  return Math.ceil(value * 1_000) / 1_000;
}
