import type { InquiryContextPayload } from "../protocol/inquiry-contract";

export type InquiryContextOwner = Readonly<{
  treeId: string;
  documentEpoch: number;
}>;

/**
 * Only a document-owner change revokes an already submitted inquiry. The
 * response is signed against and recorded with the exact request snapshot, so
 * a later revision, selection, or projection cannot make that older answer
 * claim to describe the new material.
 */
export function inquiryContextOwnerChanged(
  previous: InquiryContextOwner | undefined,
  next: InquiryContextOwner | undefined,
): boolean {
  if (previous === undefined || next === undefined) return previous !== next;
  return previous.treeId !== next.treeId || previous.documentEpoch !== next.documentEpoch;
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
