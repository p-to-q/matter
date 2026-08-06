import type { SegmentSelection } from "../material/text-segments";

export type LassoPointerType = "mouse" | "pen" | "touch";

export type LassoResolution =
  | Readonly<{ kind: "selection"; selection: SegmentSelection }>
  | Readonly<{
      kind: "empty-closed" | "uncommitted" | "ambiguous";
    }>;

export type LassoInteractionState =
  | Readonly<{
      mode: "inactive" | "ready";
      selection: SegmentSelection | null;
    }>
  | Readonly<{
      mode: "drawing";
      selection: null;
      startSelection: SegmentSelection | null;
      pointerId: number;
      pointerType: LassoPointerType;
    }>;

export type LassoInteractionEvent =
  | Readonly<{ type: "activate" }>
  | Readonly<{ type: "deactivate" }>
  | Readonly<{ type: "clear-selection" }>
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
 * Owns lasso mode, primary-pointer authority, and semantic selection handoff.
 * Geometry owns sampling and thresholds; DOM capture and painting stay at the
 * rendering edge. No state from this reducer belongs in material history.
 */
export function createLassoInteractionState(
  selection: SegmentSelection | null = null,
): LassoInteractionState {
  return idleState("inactive", ownSelection(selection));
}

export function reduceLassoInteraction(
  state: LassoInteractionState,
  event: LassoInteractionEvent,
): LassoInteractionState {
  switch (event.type) {
    case "activate":
      if (state.mode === "inactive") return idleState("ready", state.selection);
      return state;
    case "deactivate":
      return idleState(
        "inactive",
        state.mode === "drawing" ? state.startSelection : state.selection,
      );
    case "clear-selection":
      return idleState(state.mode === "inactive" ? "inactive" : "ready", null);
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
        selection: null,
        startSelection: ownSelection(state.selection),
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      });
    case "pointer-up":
      if (state.mode !== "drawing" || state.pointerId !== event.pointerId) {
        return state;
      }
      return idleState(
        "ready",
        selectionFromResolution(event.resolution, state.startSelection),
      );
    case "pointer-cancel":
    case "lost-pointer-capture":
      return cancelOwnedStroke(state, event.pointerId);
    case "layout-invalidated":
      // Layout invalidates measured ink, not a semantic address that can be
      // revalidated and measured again by the rendering boundary.
      return state.mode === "drawing"
        ? idleState("ready", state.startSelection)
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
  return idleState("ready", state.startSelection);
}

function selectionFromResolution(
  resolution: LassoResolution,
  startSelection: SegmentSelection | null,
): SegmentSelection | null {
  switch (resolution.kind) {
    case "selection":
      // A malformed handoff is ambiguous, so it cannot erase a prior address.
      return isSelectionShape(resolution.selection)
        ? ownSelection(resolution.selection)
        : ownSelection(startSelection);
    case "empty-closed":
      // Only a trustworthy completed loop can intentionally clear selection.
      return null;
    case "uncommitted":
    case "ambiguous":
      return ownSelection(startSelection);
    default:
      return assertNever(resolution);
  }
}

function idleState(
  mode: "inactive" | "ready",
  selection: SegmentSelection | null,
): LassoInteractionState {
  return Object.freeze({ mode, selection: ownSelection(selection) });
}

function ownSelection(
  selection: SegmentSelection | null,
): SegmentSelection | null {
  return selection === null ? null : Object.freeze({ ...selection });
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
