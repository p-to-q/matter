import type { WikiObserveEvidenceEvent } from "../wiki/wiki-model";
import {
  matterWikiBasisPublication,
  matterWikiFittingMode,
} from "./wiki-runtime-publication";

export { matterWikiBasisPublication, matterWikiFittingMode };

export const readMatterWikiBasis = matterWikiBasisPublication.read;

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  events: readonly WikiObserveEvidenceEvent[],
): void {
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiEvidence: observe }) => observe(events))
    .catch(() => undefined);
}
