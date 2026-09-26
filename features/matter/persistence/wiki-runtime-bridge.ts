import type { WikiObserveEvidenceEvent } from "../wiki/wiki-model";
import {
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
} from "./wiki-capability-preferences-reader";
import {
  matterWikiBasisPublication,
  matterWikiFittingMode,
} from "./wiki-runtime-publication";

export { matterWikiBasisPublication, matterWikiFittingMode };

export const readMatterWikiBasis = matterWikiBasisPublication.read;

export {
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
};

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  events: readonly WikiObserveEvidenceEvent[],
): void {
  if (!isMatterWikiAutomaticCollectionEnabled() &&
      !isMatterWikiPhoneticFittingEnabled()) return;
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiEvidence: observe }) => {
      const automaticCollection = isMatterWikiAutomaticCollectionEnabled();
      const phoneticFitting = isMatterWikiPhoneticFittingEnabled();
      if (!automaticCollection && !phoneticFitting) return;
      observe(events.filter((event) => event.source === "recent-material"
        ? automaticCollection
        : phoneticFitting));
    })
    .catch(() => undefined);
}
