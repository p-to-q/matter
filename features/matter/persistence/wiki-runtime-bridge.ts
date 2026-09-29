import type { WikiAdmissionTurn } from "../wiki/wiki-admission";
import type { WikiOccurrenceOutcome } from "../wiki/wiki-learning-policy";
import {
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
} from "./wiki-capability-preferences-reader";
import {
  claimMatterWikiOccurrences,
  mintMatterWikiOccurrence,
  takeMatterWikiOccurrence,
} from "./wiki-occurrence-owner";
import {
  matterWikiBasisPublication,
  matterWikiFittingMode,
} from "./wiki-runtime-publication";

export { matterWikiBasisPublication, matterWikiFittingMode };

export const readMatterWikiBasis = matterWikiBasisPublication.read;

export {
  claimMatterWikiOccurrences,
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
  mintMatterWikiOccurrence,
};

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  request: WikiAdmissionTurn,
): void {
  if (!isMatterWikiAutomaticCollectionEnabled() &&
      !isMatterWikiPhoneticFittingEnabled()) return;
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiCommittedMaterial: observe }) => observe(request))
    .catch(() => undefined);
}

/**
 * Content-free outcome of one settlement request. `unattributed` means the id
 * was unknown, expired, or already settled; `neutral` means nothing was
 * written because the outcome carries no evidence.
 */
export type MatterWikiOccurrenceSettleStatus =
  | "unattributed"
  | "neutral"
  | "recorded"
  | "unchanged"
  | "failed";

/**
 * Settles one applied occurrence exactly once. The attribution is consumed
 * before any write, so a repeated or late signal for the same id is inert. A
 * censored occurrence releases its memory without waking durable storage.
 */
export async function settleMatterWikiOccurrence(
  occurrenceId: string,
  outcome: Exclude<WikiOccurrenceOutcome, "explicit-replace">,
): Promise<MatterWikiOccurrenceSettleStatus> {
  const attribution = takeMatterWikiOccurrence(occurrenceId);
  if (attribution === null) return "unattributed";
  if (outcome === "censored") return "neutral";
  try {
    const { settleHydratedMatterWikiOccurrence } = await import("./wiki-runtime-core");
    const result = await settleHydratedMatterWikiOccurrence(Object.freeze({
      occurrenceId,
      outcome,
      rule: attribution.rule,
      origin: attribution.origin,
    }));
    return result.ok ? result.changed ? "recorded" : "unchanged" : "failed";
  } catch {
    return "failed";
  }
}
