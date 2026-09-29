"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  acknowledgeOutcome,
  currentOutcome,
  EMPTY_OUTCOME_LINE,
  reportOutcome,
  type MaterialOutcome,
  type OutcomeEntry,
  type OutcomeLine,
} from "./outcome-line";

/** A key that only modifies another, such as a screen reader's, is not an action. */
const MODIFIER_ONLY_KEYS: ReadonlySet<string> = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "FnLock",
  "Hyper",
  "Meta",
  "NumLock",
  "OS",
  "ScrollLock",
  "Shift",
  "Super",
  "Symbol",
  "SymbolLock",
]);

export type OutcomeLineBinding = Readonly<{
  /** The head of the queue: the one outcome the guidance line may show. */
  current: OutcomeEntry | null;
  report: (outcome: MaterialOutcome) => void;
  acknowledge: (id: number) => void;
}>;

/**
 * Binds the paper's outcome queue to one document. An outcome describes that
 * document's passages, so a document switch starts an empty line.
 */
export function useOutcomeLine(documentEpoch: number): OutcomeLineBinding {
  const [state, setState] = useState<Readonly<{ documentEpoch: number; line: OutcomeLine }>>(
    () => ({ documentEpoch, line: EMPTY_OUTCOME_LINE }),
  );
  const line = state.documentEpoch === documentEpoch ? state.line : EMPTY_OUTCOME_LINE;
  const update = useCallback((transition: (current: OutcomeLine) => OutcomeLine) => {
    setState((current) => {
      const base = current.documentEpoch === documentEpoch ? current.line : EMPTY_OUTCOME_LINE;
      const next = transition(base);
      return next === current.line && current.documentEpoch === documentEpoch
        ? current
        : { documentEpoch, line: next };
    });
  }, [documentEpoch]);
  const report = useCallback((outcome: MaterialOutcome) => {
    update((current) => reportOutcome(current, outcome));
  }, [update]);
  const acknowledge = useCallback((id: number) => {
    update((current) => acknowledgeOutcome(current, id));
  }, [update]);
  return { current: currentOutcome(line), report, acknowledge };
}

/**
 * Keeps the shown outcome until the person's next action: a pointer press
 * anywhere, or a key that is neither auto-repeat nor a lone modifier. Only
 * the outcome actually shown is acknowledged, and an event that began before
 * it was shown, such as the very press that produced it, is not its next
 * action. Keydown only observes, so it listens in the bubble phase like every
 * other window key owner.
 */
export function useOutcomeAcknowledgement(
  shown: OutcomeEntry | null,
  acknowledge: (id: number) => void,
): void {
  const acknowledgeRef = useRef(acknowledge);
  useLayoutEffect(() => {
    acknowledgeRef.current = acknowledge;
  });
  const shownId = shown?.id ?? null;
  // A layout effect starts listening before the outcome's first paint.
  useLayoutEffect(() => {
    if (shownId === null) return;
    const shownAt = performance.now();
    const act = (event: Event) => {
      if (event.timeStamp <= shownAt) return;
      acknowledgeRef.current(shownId);
    };
    const actOnKey = (event: KeyboardEvent) => {
      if (event.repeat || MODIFIER_ONLY_KEYS.has(event.key)) return;
      act(event);
    };
    // A press counts before any control can stop it.
    const capture = { capture: true } as const;
    window.addEventListener("pointerdown", act, capture);
    window.addEventListener("keydown", actOnKey);
    return () => {
      window.removeEventListener("pointerdown", act, capture);
      window.removeEventListener("keydown", actOnKey);
    };
  }, [shownId]);
}
