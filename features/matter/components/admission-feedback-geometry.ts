import type { AdmissionAnchor } from "../runtime/admission-interaction";
import type { LayoutBox } from "../layout/model";

export type AdmissionFeedbackPresentation = Readonly<{
  nodeId: string;
  topExtent: number;
  bottomExtent: number;
}>;

/** Admission feedback needs one parent box, not an index of every visible box. */
export function findAdmissionFeedbackParentBox(
  anchor: AdmissionAnchor | null,
  boxes: readonly LayoutBox[] | null,
  fallbackNodeId: string | null = null,
): LayoutBox | null {
  if (anchor?.kind !== "child" || boxes === null) return null;
  return boxes.find((box) => box.nodeId === anchor.parentNodeId) ??
    boxes.find((box) => box.nodeId === fallbackNodeId) ??
    null;
}

/** Reserves the measured feedback below its parent without persisting UI state. */
export function projectAdmissionFeedbackPresentation(
  visualNodeId: string | null,
  feedbackHeight: number,
  gap = 18,
): AdmissionFeedbackPresentation | null {
  if (
    visualNodeId === null ||
    !Number.isFinite(feedbackHeight) ||
    feedbackHeight <= 0 ||
    !Number.isFinite(gap) ||
    gap < 0
  ) return null;
  return Object.freeze({
    nodeId: visualNodeId,
    topExtent: 0,
    bottomExtent: Math.ceil(feedbackHeight) + gap,
  });
}
