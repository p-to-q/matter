import type { SegmentSelection } from "../material/text-segments";
import {
  lassoAddressFromResolution,
  lassoSelectionSetFromResolution,
  type LassoAddress,
  type LassoAddressResolution,
} from "../material/lasso-selection";

export type LassoPointerType = "mouse" | "pen" | "touch";

export type LassoResolution = LassoAddressResolution;

export type LassoInteractionState =
  | Readonly<{
      mode: "inactive" | "ready";
      address: LassoAddress | null;
    }>
  | Readonly<{
      mode: "drawing";
      address: null;
      startAddress: LassoAddress | null;
      pointerId: number;
      pointerType: LassoPointerType;
    }>;

export type LassoInteractionEvent =
  | Readonly<{ type: "activate" }>
  | Readonly<{ type: "deactivate" }>
  | Readonly<{ type: "clear-selection" }>
  | Readonly<{ type: "keyboard-select"; selection: SegmentSelection }>
  | Readonly<{
      type: "pointer-down";
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      button: number;
    }>
  | Readonly<{
      type: "pointer-up";
      pointerId: number;
      resolution: LassoResolution;
    }>
  | Readonly<{ type: "pointer-cancel"; pointerId: number }>
  | Readonly<{ type: "lost-pointer-capture"; pointerId: number }>
  | Readonly<{ type: "layout-invalidated" }>
  | Readonly<{ type: "material-invalidated" }>
  | Readonly<{ type: "navigation-invalidated" }>;

/**
 * Owns lasso mode, primary-pointer authority, and the optional Elastic address.
 * The controller owns a higher-level selection set; geometry owns sampling and
 * thresholds; DOM capture and painting stay at the rendering edge. None of
 * this state belongs in material history.
 */
export function createLassoInteractionState(
  address: LassoAddress | null = null,
): LassoInteractionState {
  return idleState("inactive", ownAddress(address));
}

export function reduceLassoInteraction(
  state: LassoInteractionState,
  event: LassoInteractionEvent,
): LassoInteractionState {
  switch (event.type) {
    case "activate":
      if (state.mode === "inactive") return idleState("ready", state.address);
      return state;
    case "deactivate":
      return idleState(
        "inactive",
        state.mode === "drawing" ? state.startAddress : state.address,
      );
    case "clear-selection":
      return idleState(state.mode === "inactive" ? "inactive" : "ready", null);
    case "keyboard-select":
      if (state.mode !== "ready" || !isSelectionShape(event.selection)) return state;
      return idleState("ready", {
        kind: "contiguous-segment-range",
        range: event.selection,
      });
    case "pointer-down":
      if (
        state.mode !== "ready" ||
        !event.isPrimary ||
        event.button !== 0 ||
        !isPointerId(event.pointerId) ||
        !isPointerType(event.pointerType)
      ) {
        return state;
      }
      return Object.freeze({
        mode: "drawing",
        address: null,
        startAddress: ownAddress(state.address),
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      });
    case "pointer-up":
      if (state.mode !== "drawing" || state.pointerId !== event.pointerId) {
        return state;
      }
      return idleState(
        "ready",
        addressFromResolution(event.resolution, state.startAddress),
      );
    case "pointer-cancel":
    case "lost-pointer-capture":
      return cancelOwnedStroke(state, event.pointerId);
    case "layout-invalidated":
      // Layout invalidates measured ink, not a semantic address that can be
      // revalidated and measured again by the rendering boundary.
      return state.mode === "drawing"
        ? idleState("ready", state.startAddress)
        : state;
    case "material-invalidated":
    case "navigation-invalidated":
      return state.mode === "inactive"
        ? idleState("inactive", null)
        : idleState("ready", null);
    default:
      return assertNever(event);
  }
}

function cancelOwnedStroke(
  state: LassoInteractionState,
  pointerId: number,
): LassoInteractionState {
  if (state.mode !== "drawing" || state.pointerId !== pointerId) return state;
  return idleState("ready", state.startAddress);
}

function addressFromResolution(
  resolution: LassoResolution,
  startAddress: LassoAddress | null,
): LassoAddress | null {
  switch (resolution.kind) {
    case "selection":
      if (lassoSelectionSetFromResolution(resolution) === null) {
        return ownAddress(startAddress);
      }
      if (resolution.mode === "selection-set") return null;
      // A malformed handoff is ambiguous, so it cannot erase a prior address.
      return isSelectionShape(resolution.selection)
        ? lassoAddressFromResolution(resolution) ?? ownAddress(startAddress)
        : ownAddress(startAddress);
    case "empty-closed":
      // Only a trustworthy completed loop can intentionally clear selection.
      return null;
    case "uncommitted":
    case "ambiguous":
      return ownAddress(startAddress);
    default:
      return assertNever(resolution);
  }
}

function idleState(
  mode: "inactive" | "ready",
  address: LassoAddress | null,
): LassoInteractionState {
  return Object.freeze({ mode, address: ownAddress(address) });
}

function ownAddress(address: LassoAddress | null): LassoAddress | null {
  return address === null
    ? null
    : Object.freeze({ ...address, range: Object.freeze({ ...address.range }) });
}

function isPointerId(pointerId: number): boolean {
  return Number.isSafeInteger(pointerId) && pointerId >= 0;
}

function isPointerType(pointerType: string): pointerType is LassoPointerType {
  return pointerType === "mouse" || pointerType === "pen" || pointerType === "touch";
}

function isSelectionShape(value: SegmentSelection): boolean {
  return (
    value.type === "segment-range" &&
    typeof value.nodeId === "string" &&
    value.nodeId.length > 0 &&
    Number.isSafeInteger(value.start) &&
    Number.isSafeInteger(value.end) &&
    value.start >= 0 &&
    value.end > value.start &&
    typeof value.selectedText === "string" &&
    value.selectedText.length > 0
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled lasso event: ${String(value)}`);
}
