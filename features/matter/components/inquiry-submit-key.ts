import { isCommitEnter, type KeyLike } from "./composition-safe-keys";

/**
 * Enter is a secondary shortcut for the visible Ask button. Composition and
 * Shift+Enter remain owned by the browser so keyboard support never breaks CJK
 * input or replaces the pointer-first inquiry path.
 */
export function shouldSubmitInquiryOnEnter(event: KeyLike, canSubmit: boolean): boolean {
  return isCommitEnter(event) && canSubmit;
}
