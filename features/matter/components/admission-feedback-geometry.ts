import type { AdmissionAnchor } from "../runtime/admission-interaction";
import type { LayoutBox } from "../layout/model";

/** Admission feedback needs one parent box, not an index of every visible box. */
export function findAdmissionFeedbackParentBox(
  anchor: AdmissionAnchor | null,
  boxes: readonly LayoutBox[] | null,
): LayoutBox | null {
  if (anchor?.kind !== "child" || boxes === null) return null;
  return boxes.find((box) => box.nodeId === anchor.parentNodeId) ?? null;
}
