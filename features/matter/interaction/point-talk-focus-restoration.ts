import type { ThoughtTree } from "../tree/model";

export type PointTalkFocusRestorationBasis = Readonly<{
  documentEpoch: number;
  nodeId: string;
  treeId: string;
}>;

/**
 * A delayed focus effect belongs to one document instance and one surviving
 * material target. Reusing a node id in a replacement document grants no
 * authority to the older effect.
 */
export function pointTalkFocusRestorationIsCurrent(
  basis: PointTalkFocusRestorationBasis,
  tree: ThoughtTree,
  documentEpoch: number,
): boolean {
  return basis.treeId === tree.id &&
    basis.documentEpoch === documentEpoch &&
    tree.nodes[basis.nodeId] !== undefined;
}
