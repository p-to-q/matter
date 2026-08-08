import { isCommitEnter } from "./composition-safe-keys";

export type InquirySubmitKeyInput = Readonly<{
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  canSubmit: boolean;
}>;

/**
 * Enter is a secondary shortcut for the visible Ask button. Composition and
 * Shift+Enter remain owned by the browser so keyboard support never breaks CJK
 * input or replaces the pointer-first inquiry path.
 */
export function shouldSubmitInquiryOnEnter(input: InquirySubmitKeyInput): boolean {
  return isCommitEnter(input) && input.canSubmit;
}
