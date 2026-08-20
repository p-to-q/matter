import type { SegmentSelection } from "../material/text-segments";

export const STRETCH_MOUSE_PEN_DEADZONE_PX = 4;
export const STRETCH_TOUCH_DEADZONE_PX = 8;
export const STRETCH_TRAVEL_PX = 120;
export const STRETCH_COMMIT_THRESHOLD = 0.15;

export type StretchPointerType = "mouse" | "pen" | "touch";

export type StretchHandle = "bottom";

export type StretchAnchor = Readonly<{
  selection: SegmentSelection;
  treeId: string;
  revision: number;
  documentEpoch: number;
}>;

export type StretchCommitBasis = Readonly<{
  selection: SegmentSelection;
  treeId: string;
  baseRevision: number;
  documentEpoch: number;
  amount: number;
}>;

export type StretchInteractionState =
  | Readonly<{ mode: "idle" }>
  | Readonly<{ mode: "armed"; anchor: StretchAnchor; amount: 0 }>
  | Readonly<{ mode: "adjusted"; anchor: StretchAnchor; amount: number }>
  | Readonly<{
      mode: "dragging";
      anchor: StretchAnchor;
      amount: number;
      priorAmount: number;
      pointerId: number;
      pointerType: StretchPointerType;
      startClientY: number;
      crossedDeadzone: boolean;
      tapCommits: boolean;
    }>
  | Readonly<{
      mode: "committed";
      anchor: StretchAnchor;
      amount: number;
      lastHandle: "bottom";
      basis: StretchCommitBasis;
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
  | Readonly<{ type: "key-down"; key: string }>
  | Readonly<{ type: "reopen" }>
  | Readonly<{ type: "selection-invalidated" }>
  | Readonly<{ type: "material-invalidated" }>
  | Readonly<{ type: "navigation-invalidated" }>
  | Readonly<{ type: "layout-invalidated" }>
  | Readonly<{ type: "scroll-invalidated" }>
  | Readonly<{ type: "resize-invalidated" }>;

/**
 * Owns one downward stretch degree and its release boundary. The returned
 * commit basis is data only; requests and durable mutation stay outside this
 * reducer and its browser hook.
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
        (state.mode !== "armed" && state.mode !== "adjusted" && state.mode !== "committed") ||
        event.handle !== "bottom" ||
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
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientY: event.clientY,
        crossedDeadzone: false,
        tapCommits: state.mode === "adjusted" && state.amount >= STRETCH_COMMIT_THRESHOLD,
      });
    case "reopen":
      return state.mode === "committed"
        ? adjustedState(state.anchor, state.amount)
        : state;
    case "pointer-move":
      return moveOwnedPointer(state, event.pointerId, event.clientY);
    case "pointer-up": {
      if (!Number.isFinite(event.clientY)) return state;
      const moved = moveOwnedPointer(state, event.pointerId, event.clientY);
      if (moved.mode !== "dragging" || moved.pointerId !== event.pointerId) {
        return state;
      }
      if (!moved.crossedDeadzone) {
        return moved.tapCommits
          ? commitOrReset(moved.anchor, moved.priorAmount)
          : adjustedState(moved.anchor, moved.priorAmount);
      }
      return commitOrReset(moved.anchor, moved.amount);
    }
    case "pointer-cancel":
    case "lost-pointer-capture":
      if (state.mode !== "dragging" || state.pointerId !== event.pointerId) {
        return state;
      }
      return adjustedState(state.anchor, state.priorAmount);
    case "set-amount":
      if (
        (state.mode !== "armed" && state.mode !== "adjusted") ||
        !Number.isFinite(event.amount) ||
        (event.handle !== undefined && event.handle !== "bottom")
      ) {
        return state;
      }
      return adjustedState(state.anchor, clampAmount(event.amount));
    case "key-down":
      return reduceKeyDown(state, event.key);
    case "layout-invalidated":
    case "scroll-invalidated":
    case "resize-invalidated":
      return state.mode === "dragging"
        ? adjustedState(state.anchor, state.priorAmount)
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
  const amount = stretchAmountFromClientDelta(state.priorAmount, delta);
  if (state.crossedDeadzone && amount === state.amount) return state;
  return Object.freeze({ ...state, amount, crossedDeadzone: true });
}

/** Downward client-pixel travel expands; upward travel reduces toward zero. */
export function stretchAmountFromClientDelta(
  priorAmount: number,
  deltaClientY: number,
): number {
  if (!isAmount(priorAmount) || !Number.isFinite(deltaClientY)) {
    return priorAmount;
  }
  return clampAmount(priorAmount + deltaClientY / STRETCH_TRAVEL_PX);
}

/** Maps one pointer-up on the transient rail without starting a drag. */
export function stretchAmountFromRailPosition(
  clientY: number,
  railTop: number,
  railHeight: number = STRETCH_TRAVEL_PX,
): number | null {
  if (!Number.isFinite(clientY) || !Number.isFinite(railTop) ||
      !Number.isFinite(railHeight) || railHeight <= 0) return null;
  return clampAmount((clientY - railTop) / railHeight);
}

export function isStretchInteractionKey(key: string): boolean {
  return KEYBOARD_KEYS.has(key);
}

export function stretchCommitBasisFromTransition(
  previous: StretchInteractionState,
  next: StretchInteractionState,
): StretchCommitBasis | null {
  return previous.mode !== "committed" && next.mode === "committed"
    ? next.basis
    : null;
}

function reduceKeyDown(
  state: StretchInteractionState,
  key: string,
): StretchInteractionState {
  if (!isStretchInteractionKey(key) || state.mode === "idle") return state;
  if (key === "Escape") {
    return state.mode === "dragging"
      ? adjustedState(state.anchor, state.priorAmount)
      : armedState(state.anchor);
  }
  if (state.mode === "dragging" || state.mode === "committed") return state;
  if (key === "Enter" || key === " ") {
    return commitOrReset(state.anchor, state.amount);
  }
  const amount = state.amount;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return adjustedState(state.anchor, amount + KEYBOARD_STEP);
    case "ArrowUp":
    case "ArrowLeft":
      return adjustedState(state.anchor, amount - KEYBOARD_STEP);
    case "PageUp":
      return adjustedState(state.anchor, amount + KEYBOARD_PAGE_STEP);
    case "PageDown":
      return adjustedState(state.anchor, amount - KEYBOARD_PAGE_STEP);
    case "Home":
      return armedState(state.anchor);
    case "End":
      return adjustedState(state.anchor, 1);
    default:
      return state;
  }
}

function deadzoneFor(pointerType: StretchPointerType): number {
  return pointerType === "touch"
    ? STRETCH_TOUCH_DEADZONE_PX
    : STRETCH_MOUSE_PEN_DEADZONE_PX;
}

function commitOrReset(
  anchor: StretchAnchor,
  amount: number,
): StretchInteractionState {
  if (amount < STRETCH_COMMIT_THRESHOLD) return armedState(anchor);
  const ownedAnchor = ownAnchor(anchor);
  const basis = Object.freeze({
    selection: ownedAnchor.selection,
    treeId: ownedAnchor.treeId,
    baseRevision: ownedAnchor.revision,
    documentEpoch: ownedAnchor.documentEpoch,
    amount,
  });
  return Object.freeze({
    mode: "committed",
    anchor: ownedAnchor,
    amount,
    lastHandle: "bottom",
    basis,
  });
}

function adjustedState(
  anchor: StretchAnchor,
  amount: number,
): StretchInteractionState {
  const bounded = clampAmount(amount);
  return bounded === 0
    ? armedState(anchor)
    : Object.freeze({ mode: "adjusted", anchor: ownAnchor(anchor), amount: bounded });
}

function armedState(anchor: StretchAnchor): StretchInteractionState {
  return Object.freeze({ mode: "armed", anchor: ownAnchor(anchor), amount: 0 });
}

function ownAnchor(anchor: StretchAnchor): StretchAnchor {
  return Object.freeze({
    selection: Object.freeze({ ...anchor.selection }),
    treeId: anchor.treeId,
    revision: anchor.revision,
    documentEpoch: anchor.documentEpoch,
  });
}

function sameAnchor(left: StretchAnchor, right: StretchAnchor): boolean {
  return (
    left.treeId === right.treeId &&
    left.revision === right.revision &&
    left.documentEpoch === right.documentEpoch &&
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
    Number.isSafeInteger(anchor.documentEpoch) &&
    anchor.documentEpoch >= 0 &&
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

function isAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function clampAmount(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled stretch event: ${String(value)}`);
}

const KEYBOARD_STEP = 0.1;
const KEYBOARD_PAGE_STEP = 0.5;
const KEYBOARD_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  "Enter",
  " ",
  "Escape",
]);
const IDLE: StretchInteractionState = Object.freeze({ mode: "idle" });
