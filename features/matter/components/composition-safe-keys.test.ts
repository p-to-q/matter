import { describe, expect, it } from "vitest";
import {
  IME_PROCESS_KEY_CODE,
  isCancelEscape,
  isCommitEnter,
  isImeKeydown,
  type KeyLike,
} from "./composition-safe-keys";

// Every row names the engine sequence it stands for and passes keyCode
// explicitly; a missing keyCode is exactly the bug this module exists to stop.
const ENTER = 13;
const ESCAPE = 27;

function key(input: KeyLike): KeyLike {
  return input;
}

describe("composition-safe keys", () => {
  it.each([
    ["Chrome IME candidate Enter", key({ key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: true })],
    ["pre-2026 Safari Enter after compositionend", key({ key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: false })],
    ["fixed Safari/Firefox candidate Enter", key({ key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: true })],
    ["Android Gboard Enter", key({ key: "Enter", keyCode: IME_PROCESS_KEY_CODE, isComposing: false })],
    ["Escape dismissing candidates, flag set", key({ key: "Escape", keyCode: IME_PROCESS_KEY_CODE, isComposing: true })],
    ["Escape dismissing candidates, flag cleared", key({ key: "Escape", keyCode: IME_PROCESS_KEY_CODE, isComposing: false })],
    ["composition flag with a real key code", key({ key: "Enter", keyCode: ENTER, isComposing: true })],
  ])("gives %s to the IME", (_name, event) => {
    expect(isImeKeydown(event)).toBe(true);
    expect(isCommitEnter(event)).toBe(false);
    expect(isCancelEscape(event)).toBe(false);
  });

  it("commits on the second, deliberate Enter only", () => {
    expect(isCommitEnter({ key: "Enter", keyCode: ENTER, isComposing: false })).toBe(true);
    expect(isImeKeydown({ keyCode: ENTER, isComposing: false })).toBe(false);
  });

  it("keeps Shift+Enter a line break", () => {
    expect(isCommitEnter({ key: "Enter", keyCode: ENTER, isComposing: false, shiftKey: true })).toBe(false);
  });

  it("cancels on a plain Escape only", () => {
    expect(isCancelEscape({ key: "Escape", keyCode: ESCAPE, isComposing: false })).toBe(true);
    expect(isCancelEscape({ key: "Enter", keyCode: ENTER, isComposing: false })).toBe(false);
    expect(isCommitEnter({ key: "Tab", keyCode: 9, isComposing: false })).toBe(false);
  });

  it("ignores keyup, which never carries commit or cancel", () => {
    expect(isCommitEnter({ key: "Enter", keyCode: ENTER, isComposing: false, type: "keyup" })).toBe(false);
    expect(isCancelEscape({ key: "Escape", keyCode: ESCAPE, isComposing: false, type: "keyup" })).toBe(false);
    expect(isCancelEscape({ key: "Escape", keyCode: ESCAPE, isComposing: false, type: "keydown" })).toBe(true);
  });
});
