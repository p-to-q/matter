import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import type { PictureHold } from "./picture-surface";

export type OperationTargetInput = Readonly<{
  elastic: Readonly<{ phase: "idle" | "requesting"; nodeId: string | null }>;
  pointTalk: Readonly<{
    hostNodeId: string | null;
    presented: boolean;
    phase: TextSwapInteractionState["phase"];
    pictureHold: PictureHold;
  }>;
}>;

/**
 * The one passage an AI operation is currently addressed at, or `null`. It is
 * computed from the operations' own states and is never stored.
 *
 * Point and Talk owns its target while its field is open (arming, drawing and
 * previewing a picture included) and while a submitted rewrite or paid picture
 * is pending after the field has closed. It stops at the settled phases. An
 * Elastic turn owns its target while it is requesting.
 */
export function operationTarget(input: OperationTargetInput): Readonly<{
  nodeId: string;
  /** The operation has taken work: a submitted rewrite, a paid picture, a requesting turn. */
  working: boolean;
}> | null {
  const { elastic, pointTalk } = input;
  if (pointTalk.hostNodeId !== null) {
    const settled = pointTalk.phase === "success" || pointTalk.phase === "stale";
    const holdsWork = pointTalk.phase === "pending" || pointTalk.pictureHold === "paid";
    if ((pointTalk.presented && !settled) || holdsWork) {
      return { nodeId: pointTalk.hostNodeId, working: holdsWork };
    }
  }
  return elastic.phase === "requesting" && elastic.nodeId !== null
    ? { nodeId: elastic.nodeId, working: true }
    : null;
}

/**
 * How strongly the canvas trail speaks. An open operation draws it in full
 * ("operating"), a selected passage or the passages an open Ask Matter is
 * addressed to draw it lightly ("selected"), and otherwise nothing is drawn.
 * `working` strengthens only the target's ring.
 */
export type TrailStrength = "off" | "selected" | "operating";

export type TrailPresentation = Readonly<{
  /** The passages the trail is joined to, in order; empty when it is off. */
  targetIds: readonly string[];
  strength: TrailStrength;
  working: boolean;
  /** Whether the one target's children are drawn below it. */
  descendants: boolean;
}>;

const OFF: TrailPresentation = Object.freeze({
  targetIds: Object.freeze([]),
  strength: "off",
  working: false,
  descendants: false,
});

/**
 * What the canvas trail shows, derived every render and never stored. The trail
 * joins the root to the passage an operation is addressed at, else to the
 * passages an open Ask Matter is addressed to (its lassoed passages), else to
 * the selected passage. Hover and focus alone never name one.
 *
 * - the focus view already is the lineage, so it draws nothing;
 * - geometry from another epoch than the published one is never drawn;
 * - a lasso that nothing has asked about draws nothing, and Ask Matter over the
 *   whole working tree names no passage, so it draws nothing either;
 * - a passage that is gone draws nothing.
 */
export function trailPresentation(input: Readonly<{
  selectedNodeId: string | null;
  operationTargetNodeId: string | null;
  operationWorking: boolean;
  /** The passages the open Ask Matter is addressed to; empty when it is closed or tree-scoped. */
  inquiryNodeIds: readonly string[];
  viewMode: "full" | "focus";
  lassoActive: boolean;
  layoutEpoch: number | null;
  publishedEpoch: number | null;
  nodeExists: (nodeId: string) => boolean;
}>): TrailPresentation {
  if (input.viewMode === "focus") return OFF;
  if (input.layoutEpoch === null || input.layoutEpoch !== input.publishedEpoch) return OFF;
  if (input.operationTargetNodeId !== null) {
    return input.nodeExists(input.operationTargetNodeId)
      ? {
          targetIds: [input.operationTargetNodeId],
          strength: "operating",
          working: input.operationWorking,
          descendants: true,
        }
      : OFF;
  }
  const asked = Array.from(new Set(input.inquiryNodeIds)).filter(input.nodeExists);
  if (asked.length > 0) {
    return { targetIds: asked, strength: "selected", working: false, descendants: false };
  }
  if (input.lassoActive) return OFF;
  if (input.selectedNodeId === null || !input.nodeExists(input.selectedNodeId)) return OFF;
  return { targetIds: [input.selectedNodeId], strength: "selected", working: false, descendants: true };
}
