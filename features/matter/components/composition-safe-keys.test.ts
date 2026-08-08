import { describe, expect, it } from "vitest";
import { isCancelEscape, isCommitEnter } from "./composition-safe-keys";

describe("composition-safe keys", () => {
  it("commits on a deliberate Enter only", () => {
    expect(isCommitEnter({ key: "Enter", isComposing: false })).toBe(true);
    expect(isCommitEnter({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
    expect(isCommitEnter({ key: "Tab", isComposing: false })).toBe(false);
  });

  it("never commits while an IME composition is open", () => {
    // Picking a pinyin candidate must not commit the pre-conversion buffer.
    expect(isCommitEnter({ key: "Enter", isComposing: true })).toBe(false);
    expect(isCommitEnter({ key: "Enter", shiftKey: true, isComposing: true })).toBe(false);
  });

  it("cancels on a deliberate Escape only", () => {
    expect(isCancelEscape({ key: "Escape", isComposing: false })).toBe(true);
    // Dismissing a candidate window must not discard the surrounding work.
    expect(isCancelEscape({ key: "Escape", isComposing: true })).toBe(false);
    expect(isCancelEscape({ key: "Enter", isComposing: false })).toBe(false);
  });
});
