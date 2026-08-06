import type { ClientTextRect } from "./range-measurement";

const EMPTY_SELECTION_RECTS: readonly ClientTextRect[] = Object.freeze([]);

/** Keeps an already-clear DOM selection state referentially stable. */
export function clearMeasuredSelectionRects(
  current: readonly ClientTextRect[],
): readonly ClientTextRect[] {
  return current.length === 0 ? current : EMPTY_SELECTION_RECTS;
}
