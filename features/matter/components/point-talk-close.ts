import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import type { PresenceClose } from "./presence";

/**
 * The only ways the Point and Talk field may leave. Each is a reason the
 * person can see, and each leaves visibly except a modal or a hidden page,
 * which cut at 0 ms. Relayout, re-render, re-measurement, a keyboard
 * animation, visibility jitter, and temporarily lost placement are not here:
 * they re-place or hold the field and never close it. `point-talk-close.test.ts`
 * holds every close call site to this list.
 */
export const POINT_TALK_CLOSE_REASONS = Object.freeze([
  /** Escape, a press outside the field, or its own close control. */
  "person",
  /** A submitted result was delivered: the rewritten passage is the ending. */
  "result",
  /** Another AI surface took the paper's one presentation slot. */
  "slot",
  /** The addressed passage vanished, or changed under the field. */
  "target-changed",
  /** A modal dialog or a hidden page took the paper: the one 0 ms cut. */
  "cut",
] as const);

export type PointTalkCloseReason = (typeof POINT_TALK_CLOSE_REASONS)[number];

/** How a leaving field is painted for each reason. */
export function pointTalkPresenceClose(reason: PointTalkCloseReason): PresenceClose {
  switch (reason) {
    case "person": return "person";
    case "result": return "finished";
    case "slot": return "yielded";
    case "target-changed": return "invalidated";
    case "cut": return "preempted";
  }
}

/**
 * A field that stops being live without a declared close tells why by the
 * phase it ended in: its passage changed underneath it, or its result was
 * delivered. Anything else reaching here was unmounted by a modal or hidden
 * page, the one cut.
 */
export function pointTalkReleaseReason(
  phase: TextSwapInteractionState["phase"],
): PointTalkCloseReason {
  if (phase === "stale") return "target-changed";
  return phase === "success" ? "result" : "cut";
}
