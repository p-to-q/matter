/**
 * Enter and Escape belong to the IME while a composition is open: Enter picks a
 * candidate and Escape dismisses the candidate window. A handler that acts on
 * either without checking `isComposing` commits the pre-conversion buffer as a
 * person's material, or throws away what they were writing. Simplified Chinese
 * is Matter's default locale, so this is the common path, not an edge.
 *
 * `KeyboardEvent.isComposing` lives on the native event; React's synthetic
 * event does not forward it.
 */
export type CompositionKeyInput = Readonly<{
  key: string;
  shiftKey?: boolean;
  isComposing: boolean;
}>;

/** Enter as a deliberate commit. Shift+Enter stays a line break. */
export function isCommitEnter(input: CompositionKeyInput): boolean {
  return input.key === "Enter" && input.shiftKey !== true && !input.isComposing;
}

/** Escape as a deliberate cancel, never as an IME candidate dismissal. */
export function isCancelEscape(input: CompositionKeyInput): boolean {
  return input.key === "Escape" && !input.isComposing;
}
