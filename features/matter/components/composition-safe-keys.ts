/**
 * A keydown belongs to the IME iff `isComposing || keyCode === 229`.
 *
 * While a composition is open, Enter picks a candidate and Escape dismisses the
 * candidate window. Engines disagree about the confirming keydown: Chromium
 * reports it with `isComposing: true`; WebKit before its April 2026 event-order
 * fix fired `compositionend` first and then that keydown with
 * `isComposing: false` but `keyCode: 229`; Android virtual keyboards report 229
 * for nearly every key. `keyCode` is deprecated, yet it is the only signal that
 * covers all three, so every caller must pass it. Simplified Chinese is
 * Matter's default locale, so this is the common path, not an edge.
 *
 * React's synthetic event does not forward `isComposing`: React call sites pass
 * `event.nativeEvent`. Enter and Escape act only on keydown.
 */
export type KeyLike = Pick<KeyboardEvent, "key" | "keyCode" | "isComposing"> & Readonly<{
  shiftKey?: boolean;
  /** When present, anything other than keydown carries no commit or cancel. */
  type?: string;
}>;

/** The legacy "Process" key code every engine reports for IME-owned keys. */
export const IME_PROCESS_KEY_CODE = 229;

export function isImeKeydown(event: Pick<KeyboardEvent, "keyCode" | "isComposing">): boolean {
  return event.isComposing || event.keyCode === IME_PROCESS_KEY_CODE;
}

/** Enter as a deliberate commit. Shift+Enter stays a line break. */
export function isCommitEnter(event: KeyLike): boolean {
  return isDeliberateKeydown(event, "Enter") && event.shiftKey !== true;
}

/** Escape as a deliberate cancel, never as an IME candidate dismissal. */
export function isCancelEscape(event: KeyLike): boolean {
  return isDeliberateKeydown(event, "Escape");
}

function isDeliberateKeydown(event: KeyLike, key: "Enter" | "Escape"): boolean {
  return event.key === key &&
    (event.type === undefined || event.type === "keydown") &&
    !isImeKeydown(event);
}
