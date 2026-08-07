import { describe, expect, it } from "vitest";
import { shouldSubmitInquiryOnEnter } from "./inquiry-submit-key";

describe("inquiry submit key", () => {
  it("makes plain Enter a shortcut only for an enabled visible Ask action", () => {
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      canSubmit: true,
    })).toBe(true);
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      canSubmit: false,
    })).toBe(false);
  });

  it("leaves IME composition and Shift+Enter to the textarea", () => {
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
      canSubmit: true,
    })).toBe(false);
    expect(shouldSubmitInquiryOnEnter({
      key: "Enter",
      shiftKey: true,
      isComposing: false,
      canSubmit: true,
    })).toBe(false);
  });
});
