import {
  sameInquiryContext,
  type InquiryContextPayload,
} from "../protocol/inquiry-contract";

/** A new projection callback is not itself a new material scope. */
export function inquiryContextScopeChanged(
  previous: InquiryContextPayload | undefined,
  next: InquiryContextPayload | undefined,
): boolean {
  return previous !== undefined && next !== undefined
    ? !sameInquiryContext(previous, next)
    : previous !== next;
}
