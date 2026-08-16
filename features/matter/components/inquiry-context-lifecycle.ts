import {
  sameInquiryContext,
  type InquiryContextPayload,
} from "../protocol/inquiry-contract";

/**
 * Any difference at all, including a revision bump. This is the question a
 * reply must answer before it may be shown: an answer describes the material
 * it was asked about, not whatever the material became while it was in flight.
 */
export function inquiryContextChanged(
  previous: InquiryContextPayload | undefined,
  next: InquiryContextPayload | undefined,
): boolean {
  return previous !== undefined && next !== undefined
    ? !sameInquiryContext(previous, next)
    : previous !== next;
}

/**
 * A move to different material — another document, another scope, or a
 * different lineage. Deliberately not a revision change: admission, repair, a
 * derived label, undo and redo all raise the revision while the person is still
 * reading the passage they asked about, and the record exists so they can look
 * back over what they already asked. Each exchange keeps its own basis
 * revision, so an older answer stays honest about the material it described.
 *
 * A new projection callback is not itself a new material scope.
 */
export function inquiryContextScopeChanged(
  previous: InquiryContextPayload | undefined,
  next: InquiryContextPayload | undefined,
): boolean {
  if (previous === undefined || next === undefined) return previous !== next;
  return previous.treeId !== next.treeId ||
    previous.scope !== next.scope ||
    previous.lineage.length !== next.lineage.length ||
    previous.lineage.some((node, index) => node.nodeId !== next.lineage[index]?.nodeId);
}
