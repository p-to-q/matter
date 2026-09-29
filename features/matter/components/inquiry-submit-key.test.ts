import { describe, expect, it } from "vitest";
import { IME_PROCESS_KEY_CODE } from "./composition-safe-keys";
import { shouldSubmitInquiryOnEnter } from "./inquiry-submit-key";

describe("inquiry submit key", () => {
  it("makes plain Enter a shortcut only for an enabled visible Ask action", () => {
    const enter = { key: "Enter", keyCode: 13, isComposing: false, shiftKey: false };
    expect(shouldSubmitInquiryOnEnter(enter, true)).toBe(true);
    expect(shouldSubmitInquiryOnEnter(enter, false)).toBe(false);
  });

  it("leaves every IME-owned Enter and Shift+Enter to the textarea", () => {
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: true, shiftKey: false,
    }, true)).toBe(false);
    // WebKit before its 2026 fix: compositionend, then a 229 keydown whose
    // composition flag is already false. Submitting here sent the pinyin buffer.
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: false, shiftKey: false,
    }, true)).toBe(false);
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter", keyCode: 13, isComposing: false, shiftKey: true,
    }, true)).toBe(false);
  });
});
