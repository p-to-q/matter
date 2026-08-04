import type { SegmentSelection } from "../material/text-segments";

export const STRETCH_MOUSE_PEN_DEADZONE_PX = 4;
export const STRETCH_TOUCH_DEADZONE_PX = 8;
export const STRETCH_TRAVEL_PX = 120;

export type StretchPointerType = "mouse" | "pen" | "touch";
export type StretchHandle = "top" | "bottom";

export type StretchAnchor = Readonly<{
  selection: SegmentSelection;
  treeId: string;
  revision: number;
}>;

export type StretchInteractionState =
  | Readonly<{ mode: "idle" }>
  | Readonly<{ mode: "armed"; anchor: StretchAnchor; amount: 0 }>
  | Readonly<{
      mode: "dragging";
      anchor: StretchAnchor;
      amount: number;
      priorAmount: number;
      priorLastHandle: StretchHandle | null;
      handle: StretchHandle;
      pointerId: number;
      pointerType: StretchPointerType;
      startClientY: number;
      crossedDeadzone: boolean;
    }>
  | Readonly<{
      mode: "committed";
      anchor: StretchAnchor;
      amount: number;
      lastHandle: StretchHandle;
    }>;

export type StretchInteractionEvent =
  | Readonly<{ type: "arm"; anchor: StretchAnchor }>
  | Readonly<{ type: "disarm" }>
  | Readonly<{
      type: "pointer-down";
      handle: StretchHandle;
      pointerId: number;
      pointerType: StretchPointerType;
      isPrimary: boolean;
      button: number;
      clientY: number;
    }>
  | Readonly<{ type: "pointer-move"; pointerId: number; clientY: number }>
  | Readonly<{ type: "pointer-up"; pointerId: number; clientY: number }>
  | Readonly<{ type: "pointer-cancel"; pointerId: number }>
  | Readonly<{ type: "lost-pointer-capture"; pointerId: number }>
  | Readonly<{ type: "set-amount"; amount: number; handle?: StretchHandle }>
  | Readonly<{ type: "selection-invalidated" }>
  | Readonly<{ type: "material-invalidated" }>
  | Readonly<{ type: "navigation-invalidated" }>
  | Readonly<{ type: "layout-invalidated" }>;

/**
 * Owns semantic stretch degree and primary-pointer authority. Client geometry
 * enters as plain CSS pixels; handle measurement and rendering stay at the DOM
 * edge, and no state here belongs in material history.
 */
export function createStretchInteractionState(): StretchInteractionState {
  return IDLE;
}

export function reduceStretchInteraction(
  state: StretchInteractionState,
  event: StretchInteractionEvent,
): StretchInteractionState {
  switch (event.type) {
    case "arm":
      if (!isAnchor(event.anchor)) return state;
      if (state.mode !== "idle" && sameAnchor(state.anchor, event.anchor)) {
        return state;
      }
      return armedState(event.anchor);
    case "disarm":
    case "selection-invalidated":
    case "material-invalidated":
    case "navigation-invalidated":
      return state.mode === "idle" ? state : IDLE;
    case "pointer-down":
      if (
        (state.mode !== "armed" && state.mode !== "committed") ||
        !isHandle(event.handle) ||
        !event.isPrimary ||
        event.button !== 0 ||
        !isPointerId(event.pointerId) ||
        !isPointerType(event.pointerType) ||
        !Number.isFinite(event.clientY)
      ) {
        return state;
      }
      return Object.freeze({
        mode: "dragging",
        anchor: ownAnchor(state.anchor),
        amount: state.amount,
        priorAmount: state.amount,
        priorLastHandle: state.mode === "committed" ? state.lastHandle : null,
        handle: event.handle,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientY: event.clientY,
        crossedDeadzone: false,
      });
    case "pointer-move":
      return moveOwnedPointer(state, event.pointerId, event.clientY);
    case "pointer-up": {
      if (!Number.isFinite(event.clientY)) return state;
      const moved = moveOwnedPointer(state, event.pointerId, event.clientY);
      if (moved.mode !== "dragging" || moved.pointerId !== event.pointerId) {
        return state;
      }
      if (!moved.crossedDeadzone) {
        return settledState(moved.anchor, moved.priorAmount, moved.priorLastHandle);
      }
      return settledState(moved.anchor, moved.amount, moved.handle);
    }
    case "pointer-cancel":
    case "lost-pointer-capture":
      if (state.mode !== "dragging" || state.pointerId !== event.pointerId) {
        return state;
      }
      return settledState(state.anchor, state.priorAmount, state.priorLastHandle);
    case "set-amount":
      if (
        (state.mode !== "armed" && state.mode !== "committed") ||
        !Number.isFinite(event.amount)
      ) {
        return state;
      }
      if (event.handle !== undefined && !isHandle(event.handle)) return state;
      return settledState(
        state.anchor,
        clampAmount(event.amount),
        event.handle ?? (state.mode === "committed" ? state.lastHandle : "bottom"),
      );
    case "layout-invalidated":
      return state.mode === "dragging"
        ? settledState(state.anchor, state.priorAmount, state.priorLastHandle)
        : state;
    default:
      return assertNever(event);
  }
}

function moveOwnedPointer(
  state: StretchInteractionState,
  pointerId: number,
  clientY: number,
): StretchInteractionState {
  if (
    state.mode !== "dragging" ||
    state.pointerId !== pointerId ||
    !Number.isFinite(clientY)
  ) {
    return state;
  }
  const delta = clientY - state.startClientY;
  const crossedDeadzone =
    state.crossedDeadzone || Math.abs(delta) > deadzoneFor(state.pointerType);
  if (!crossedDeadzone) return state;
  const amount = stretchAmountFromClientDelta(state.priorAmount, delta, state.handle);
  if (state.crossedDeadzone && amount === state.amount) return state;
  return Object.freeze({ ...state, amount, crossedDeadzone: true });
}

/** Outward movement expands; reversing either handle reduces the shared degree. */
export function stretchAmountFromClientDelta(
  priorAmount: number,
  deltaClientY: number,
  handle: StretchHandle = "bottom",
): number {
  if (!isAmount(priorAmount) || !Number.isFinite(deltaClientY) || !isHandle(handle)) {
    return priorAmount;
  }
  const directedDelta = handle === "top" ? -deltaClientY : deltaClientY;
  return clampAmount(priorAmount + directedDelta / STRETCH_TRAVEL_PX);
}

function deadzoneFor(pointerType: StretchPointerType): number {
  return pointerType === "touch"
    ? STRETCH_TOUCH_DEADZONE_PX
    : STRETCH_MOUSE_PEN_DEADZONE_PX;
}

function settledState(
  anchor: StretchAnchor,
  amount: number,
  lastHandle: StretchHandle | null,
): StretchInteractionState {
  return amount === 0 || lastHandle === null
    ? armedState(anchor)
    : Object.freeze({ mode: "committed", anchor: ownAnchor(anchor), amount, lastHandle });
}

function armedState(anchor: StretchAnchor): StretchInteractionState {
  return Object.freeze({ mode: "armed", anchor: ownAnchor(anchor), amount: 0 });
}

function ownAnchor(anchor: StretchAnchor): StretchAnchor {
  return Object.freeze({
    selection: Object.freeze({ ...anchor.selection }),
    treeId: anchor.treeId,
    revision: anchor.revision,
  });
}

function sameAnchor(left: StretchAnchor, right: StretchAnchor): boolean {
  return (
    left.treeId === right.treeId &&
    left.revision === right.revision &&
    left.selection.type === right.selection.type &&
    left.selection.nodeId === right.selection.nodeId &&
    left.selection.start === right.selection.start &&
    left.selection.end === right.selection.end &&
    left.selection.selectedText === right.selection.selectedText
  );
}

function isAnchor(anchor: StretchAnchor): boolean {
  const selection = anchor?.selection;
  return (
    typeof anchor?.treeId === "string" &&
    anchor.treeId.length > 0 &&
    Number.isSafeInteger(anchor.revision) &&
    anchor.revision >= 0 &&
    selection?.type === "segment-range" &&
    typeof selection.nodeId === "string" &&
    selection.nodeId.length > 0 &&
    Number.isSafeInteger(selection.start) &&
    Number.isSafeInteger(selection.end) &&
    selection.start >= 0 &&
    selection.end > selection.start &&
    typeof selection.selectedText === "string" &&
    selection.selectedText.length > 0
  );
}

function isPointerId(pointerId: number): boolean {
  return Number.isSafeInteger(pointerId) && pointerId >= 0;
}

function isPointerType(value: string): value is StretchPointerType {
  return value === "mouse" || value === "pen" || value === "touch";
}

function isHandle(value: string): value is StretchHandle {
  return value === "top" || value === "bottom";
}

function isAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function clampAmount(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled stretch event: ${String(value)}`);
}

const IDLE: StretchInteractionState = Object.freeze({ mode: "idle" });
