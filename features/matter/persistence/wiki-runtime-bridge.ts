import type { WikiAdmissionTurn } from "../wiki/wiki-admission";
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
  request: WikiAdmissionTurn,
): void {
  if (!isMatterWikiAutomaticCollectionEnabled() &&
      !isMatterWikiPhoneticFittingEnabled()) return;
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiCommittedMaterial: observe }) => observe(request))
    .catch(() => undefined);
}
