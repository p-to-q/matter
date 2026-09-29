"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  outsidePressDismissal,
  PEN_TAKEOVER_WINDOW_MS,
  touchCommitment,
  type TouchCommitmentOrigin,
  type TouchCommitmentSignal,
} from "../runtime/canvas-pointer-arbitration";

/**
 * Runs `commit` once the touch that began at `origin` commits to a real
 * gesture, and never if a pen lands first or the browser cancels it. The
 * returned function discards the wait and is idempotent.
 *
 * Listens in the window capture phase so a control that stops propagation
 * cannot hide the touch's end, and so a commit settles before the canvas's own
 * handler for the same event runs.
 */
export function deferUntilTouchCommits(
  origin: TouchCommitmentOrigin,
  commit: () => void,
): () => void {
  let settled = false;
  const settle = (signal: TouchCommitmentSignal) => {
    if (settled) return;
    const decision = touchCommitment(origin, signal);
    if (decision === "wait") return;
    settled = true;
    dispose();
    if (decision === "commit") commit();
  };
  const onMove = (event: PointerEvent) => settle({
    type: "move",
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  });
  const onUp = (event: PointerEvent) => settle({ type: "end", pointerId: event.pointerId, cancelled: false });
  const onCancel = (event: PointerEvent) => settle({ type: "end", pointerId: event.pointerId, cancelled: true });
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === "pen") settle({ type: "pen-down" });
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("pointerdown", onDown, true);
  const timer = window.setTimeout(() => settle({ type: "window-elapsed" }), PEN_TAKEOVER_WINDOW_MS);
  function dispose() {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("pointerdown", onDown, true);
    window.clearTimeout(timer);
  }
  return () => {
    if (settled) return;
    settled = true;
    dispose();
  };
}

export type OutsidePressBinding = Readonly<{
  /**
   * Decides a press at pointerdown: the dismissal it would cause (capturing
   * whatever that press addressed), or null when the press does not dismiss.
   */
  resolve: (event: PointerEvent) => (() => void) | null;
  penActive: (timeStamp: number) => boolean;
}>;

/**
 * Dismisses one surface on a press outside it. A mouse or pen press dismisses
 * at once; a touch only once it commits, and a palm beside a writing pen never
 * does. The binding is read at each press, so a caller may hand in fresh
 * closures without re-subscribing; disposing discards a touch still deciding.
 */
export function subscribeOutsidePressDismissal(
  target: Pick<Document, "addEventListener" | "removeEventListener">,
  binding: () => OutsidePressBinding,
): () => void {
  let pendingTouch: (() => void) | null = null;
  let disposed = false;
  const onPointerDown = (event: PointerEvent) => {
    const { resolve, penActive } = binding();
    const dismiss = resolve(event);
    if (dismiss === null) return;
    switch (outsidePressDismissal(event.pointerType, penActive(event.timeStamp))) {
      case "now":
        dismiss();
        return;
      case "when-touch-commits":
        pendingTouch?.();
        pendingTouch = deferUntilTouchCommits(
          { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY },
          () => {
            pendingTouch = null;
            dismiss();
          },
        );
        return;
      case "never":
        return;
    }
  };
  const capture = { capture: true } as const;
  target.addEventListener("pointerdown", onPointerDown, capture);
  return () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener("pointerdown", onPointerDown, capture);
    pendingTouch?.();
    pendingTouch = null;
  };
}

/**
 * Binds outside-press dismissal to one surface identity. Only a change of
 * `identity` (or null, for no surface) re-subscribes: a re-render that hands
 * in new callbacks keeps both the subscription and a touch still deciding.
 */
export function useOutsidePressDismissal(
  identity: string | null,
  binding: OutsidePressBinding,
): void {
  const bindingRef = useRef(binding);
  useLayoutEffect(() => {
    bindingRef.current = binding;
  });
  useEffect(() => {
    if (identity === null) return;
    return subscribeOutsidePressDismissal(document, () => bindingRef.current);
  }, [identity]);
}
