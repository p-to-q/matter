/**
 * UI-only ownership for one Inquiry surface. It is deliberately absent from
 * the public protocol: documentEpoch distinguishes two locally loaded document
 * instances even when their serialized tree identity and text are identical.
 */
export type InquiryContextOwner = Readonly<{
  treeId: string;
  documentEpoch: number;
}>;

export function sameInquiryContextOwner(
  left: InquiryContextOwner,
  right: InquiryContextOwner,
): boolean {
  return left.treeId === right.treeId && left.documentEpoch === right.documentEpoch;
}
