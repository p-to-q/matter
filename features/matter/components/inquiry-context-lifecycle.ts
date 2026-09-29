import { subscribePageExit } from "../interaction/page-suspension";

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

/**
 * Only a real unload retires the Inquiry owner. A back-forward-cache hide
 * keeps a submitted question and its bounded snapshot for the page's return;
 * if the browser drops the request meanwhile, the client settles it as an
 * ordinary transport failure, which returns the question with a quiet notice.
 */
export function subscribeInquiryUnload(onUnload: () => void): () => void {
  return subscribePageExit((exit) => {
    if (!exit.persisted) onUnload();
  });
}
