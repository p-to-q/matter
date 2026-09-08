import type { AdmissionSettlement } from "./admission-driver";
import type { ThoughtTree } from "../tree/model";

export type AdmissionFocusRestorationBasis = AdmissionSettlement;

/**
 * Delayed focus belongs to the admission that released it. It may observe its
 * starting revision or the one command an explicit committed settlement owns.
 */
export function admissionFocusRestorationIsCurrent(
  basis: AdmissionFocusRestorationBasis,
  tree: ThoughtTree,
  documentEpoch: number,
  pageVisible: boolean,
): boolean {
  if (
    !pageVisible ||
    basis.anchor.treeId !== tree.id ||
    basis.documentEpoch !== documentEpoch
  ) return false;
  const expectedRevision = basis.outcome === "committed"
    ? basis.anchor.baseRevision + 1
    : basis.anchor.baseRevision;
  if (!Number.isSafeInteger(expectedRevision) || tree.revision !== expectedRevision) return false;
  return basis.anchor.kind === "root" || tree.nodes[basis.anchor.parentNodeId] !== undefined;
}
