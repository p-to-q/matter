import type { AdmissionInteractionState } from "../runtime/admission-interaction";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import type { FixedExpandTurnState } from "./use-fixed-expand-turn";

/**
 * What the paper holds that the product root must know before replacing the
 * document instance: the phases of its two material turns, and two holds that
 * are not turns at all.
 */
export type PaperActivity = Readonly<{
  /** The Elastic material turn. */
  elastic: FixedExpandTurnState["phase"];
  /** The Point-and-Talk material turn. */
  textSwap: TextSwapInteractionState["phase"];
  /** Ask Matter holds a typed or dictated question, or one awaiting its answer. */
  inquiryHeld: boolean;
  /** A thought name or the canvas title is being typed in the material index. */
  editingHeld: boolean;
}>;

export const IDLE_PAPER_ACTIVITY: PaperActivity = Object.freeze({
  elastic: "idle",
  textSwap: "idle",
  inquiryHeld: false,
  editingHeld: false,
});

// Derived from the idle value, which the type forces to name every field, so
// a new field is compared without another list to keep in step.
const PAPER_ACTIVITY_FIELDS = Object.freeze(
  Object.keys(IDLE_PAPER_ACTIVITY) as (keyof PaperActivity)[],
);

/**
 * Seed relocalization rewrites untouched preview passages and their history
 * mementos in place. A turn that has read such a passage (a Voice admission in
 * progress, a Point-and-Talk draft or submitted request, or an Elastic request
 * or parked result) holds an exact basis that the rewrite would revoke, so
 * relocalization waits until every turn has settled and runs when they do.
 *
 * A pending admission repair is deliberately not a holder: it only addresses
 * the admitted human node, which is never seed copy, and its exact memento
 * survives a relocalization of other passages.
 */
export function materialTurnsHoldBasis(input: Readonly<{
  admission: AdmissionInteractionState["phase"];
  paper: PaperActivity;
}>): boolean {
  return input.admission !== "idle" ||
    input.paper.elastic !== "idle" ||
    textSwapHoldsBasis(input.paper.textSwap);
}

/**
 * Whether replacing the loaded document instance now (hydrating material
 * another tab saved, or reloading for a newer schema) would lose nothing the
 * person started in this tab. Every holder of seed relocalization counts, and
 * so do Ask Matter and an open name editor: each is bound to the document
 * instance and would be revoked by the replacement.
 */
export function materialIsIdle(input: Readonly<{
  admission: AdmissionInteractionState["phase"];
  paper: PaperActivity;
}>): boolean {
  return !materialTurnsHoldBasis(input) && !input.paper.inquiryHeld && !input.paper.editingHeld;
}

export function samePaperActivity(left: PaperActivity, right: PaperActivity): boolean {
  return PAPER_ACTIVITY_FIELDS.every((field) => left[field] === right[field]);
}

function textSwapHoldsBasis(phase: TextSwapInteractionState["phase"]): boolean {
  // Success and stale are terminal presentations whose basis is already spent.
  return phase !== "idle" && phase !== "success" && phase !== "stale";
}
