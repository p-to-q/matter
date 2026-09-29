"use client";

import {
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
