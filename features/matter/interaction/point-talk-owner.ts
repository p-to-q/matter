export type PointTalkOwner = Readonly<{
  documentEpoch: number;
  nodeId: string;
  treeId: string;
}>;

export function createPointTalkOwner(
  documentEpoch: number,
  treeId: string,
  nodeId: string,
): PointTalkOwner {
  return Object.freeze({ documentEpoch, nodeId, treeId });
}

/** A local turn belongs to one loaded document instance, never merely an id. */
export function currentPointTalkNodeId(
  owner: PointTalkOwner | null,
  documentEpoch: number,
  treeId: string,
  eligibleNodeIds: ReadonlySet<string>,
): string | null {
  return owner !== null &&
      owner.documentEpoch === documentEpoch &&
      owner.treeId === treeId &&
      eligibleNodeIds.has(owner.nodeId)
    ? owner.nodeId
    : null;
}
