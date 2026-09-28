import type { AdmissionInteractionState } from "../runtime/admission-interaction";
import type { TextSwapInteractionState } from "../runtime/text-swap-interaction";
import type { FixedExpandTurnState } from "./use-fixed-expand-turn";

/** Phases of the material turns owned by the paper, reported to the product root. */
export type PaperMaterialTurnPhases = Readonly<{
  elastic: FixedExpandTurnState["phase"];
  textSwap: TextSwapInteractionState["phase"];
}>;

export const SETTLED_PAPER_MATERIAL_TURNS: PaperMaterialTurnPhases = Object.freeze({
  elastic: "idle",
  textSwap: "idle",
});

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
  paper: PaperMaterialTurnPhases;
}>): boolean {
  return input.admission !== "idle" ||
    input.paper.elastic !== "idle" ||
    textSwapHoldsBasis(input.paper.textSwap);
}

export function samePaperMaterialTurnPhases(
  left: PaperMaterialTurnPhases,
  right: PaperMaterialTurnPhases,
): boolean {
  return left.elastic === right.elastic && left.textSwap === right.textSwap;
}

function textSwapHoldsBasis(phase: TextSwapInteractionState["phase"]): boolean {
  // Success and stale are terminal presentations whose basis is already spent.
  return phase !== "idle" && phase !== "success" && phase !== "stale";
}
