import type { AdmissionAnchor } from "../runtime/admission-interaction";
import type { LayoutBox } from "../layout/model";

export type AdmissionFeedbackPresentation = Readonly<{
  nodeId: string;
  topExtent: number;
  bottomExtent: number;
}>;

export const ADMISSION_FEEDBACK_MIN_HEIGHT = 48;

/**
 * Selects one visible material lane for transient voice feedback. A structural
 * admission parent can be invisible after a view change, so fall back through
 * the selected passage and then the first first-level passage. Feedback must
 * never fall back to the canvas origin while there is visible material there.
 */
export function findAdmissionFeedbackParentBox(
  anchor: AdmissionAnchor | null,
  boxes: readonly LayoutBox[] | null,
  fallbackNodeId: string | null = null,
): LayoutBox | null {
  if (anchor?.kind !== "child" || boxes === null) return null;
  return boxes.find((box) => box.nodeId === anchor.parentNodeId) ??
    boxes.find((box) => box.nodeId === fallbackNodeId) ??
    boxes.find((box) => box.depth === 0) ??
    boxes[0] ??
    null;
}

/**
 * Reserves a conservative lane before ResizeObserver reports the exact height.
 * This prevents one initial paint from letting a recording control overlap a
 * sibling while the rendering edge is still measuring its transient content.
 */
export function projectAdmissionFeedbackPresentation(
  visualNodeId: string | null,
  feedbackHeight: number,
  gap = 18,
): AdmissionFeedbackPresentation | null {
  if (
    visualNodeId === null ||
    !Number.isFinite(feedbackHeight) ||
    feedbackHeight < 0 ||
    !Number.isFinite(gap) ||
    gap < 0
  ) return null;
  return Object.freeze({
    nodeId: visualNodeId,
    topExtent: 0,
    bottomExtent: Math.ceil(Math.max(feedbackHeight, ADMISSION_FEEDBACK_MIN_HEIGHT)) + gap,
  });
}
