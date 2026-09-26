import type { WikiObserveEvidenceEvent } from "../wiki/wiki-model";
import { matterWikiCapabilityPreferences } from "./wiki-capability-preferences";
import {
  matterWikiBasisPublication,
  matterWikiFittingMode,
} from "./wiki-runtime-publication";

export { matterWikiBasisPublication, matterWikiFittingMode };

export const readMatterWikiBasis = matterWikiBasisPublication.read;

export const isMatterWikiAutomaticCollectionEnabled = (): boolean =>
  matterWikiCapabilityPreferences.getSnapshot().automaticCollection;

export const isMatterWikiPhoneticFittingEnabled = (): boolean =>
  matterWikiCapabilityPreferences.getSnapshot().phoneticFitting;

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  events: readonly WikiObserveEvidenceEvent[],
): void {
  const preferences = matterWikiCapabilityPreferences.getSnapshot();
  if (!preferences.automaticCollection && !preferences.phoneticFitting) return;
  const admitted = events.filter((event) => event.source === "recent-material"
    ? preferences.automaticCollection
    : preferences.phoneticFitting);
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiEvidence: observe }) => observe(admitted))
    .catch(() => undefined);
}
