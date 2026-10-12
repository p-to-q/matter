import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import type { PictureHold } from "./picture-surface";

/**
 * The one passage an AI operation is currently addressed at, or `null`. The
 * canvas draws its root-to-target line from this single derived value; it is
 * computed from the operations' own states and is never stored.
 *
 * Point and Talk owns its target while its field is open (arming, drawing and
 * previewing a picture included) and while a submitted rewrite or paid picture
 * is pending after the field has closed. It stops at the settled phases. An
 * Elastic turn owns its target while it is requesting.
 */
export function operationTargetNodeId(input: Readonly<{
  elastic: Readonly<{ phase: "idle" | "requesting"; nodeId: string | null }>;
  pointTalk: Readonly<{
    hostNodeId: string | null;
    presented: boolean;
    phase: TextSwapInteractionState["phase"];
    pictureHold: PictureHold;
  }>;
}>): string | null {
  const { elastic, pointTalk } = input;
  if (pointTalk.hostNodeId !== null) {
    const settled = pointTalk.phase === "success" || pointTalk.phase === "stale";
    const holdsWork = pointTalk.phase === "pending" || pointTalk.pictureHold === "paid";
    if ((pointTalk.presented && !settled) || holdsWork) return pointTalk.hostNodeId;
  }
  return elastic.phase === "requesting" ? elastic.nodeId : null;
}
