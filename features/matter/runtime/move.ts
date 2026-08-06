import type { ThoughtTree, TreeCommand } from "../tree/model";

export type MoveNodeValues = {
  readonly commandId: string;
  readonly nodeId: string;
  readonly targetParentId: string;
  readonly createdAt: string;
};

export function canMoveNodeToParent(
  tree: ThoughtTree,
  nodeId: string,
  targetParentId: string,
): boolean {
  const node = tree.nodes[nodeId];
  const target = tree.nodes[targetParentId];
  if (
    !node ||
    !target ||
    node.parentId === null ||
    node.id === tree.rootId ||
    node.id === target.id ||
    node.parentId === target.id
  ) return false;
  let cursor: string | null = target.id;
  while (cursor !== null) {
    if (cursor === node.id) return false;
    cursor = tree.nodes[cursor]?.parentId ?? null;
  }
  const source = tree.nodes[node.parentId];
  return source !== undefined && source.children.indexOf(node.id) >= 0;
}

export function moveNodeToParentCommand(tree: ThoughtTree, values: MoveNodeValues): TreeCommand | null {
  const node = tree.nodes[values.nodeId];
  const target = tree.nodes[values.targetParentId];
  if (!canMoveNodeToParent(tree, values.nodeId, values.targetParentId) || !node || !target || node.parentId === null) return null;
  const source = tree.nodes[node.parentId];
  if (!source) return null;
  const fromIndex = source.children.indexOf(node.id);
  if (fromIndex < 0) return null;
  return {
    id: values.commandId,
    source: "human",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    createdAt: values.createdAt,
    mutation: {
      type: "move-node",
      nodeId: node.id,
      expectedNode: { ...node, children: [...node.children] },
      fromParentId: source.id,
      fromIndex,
      fromParentChildrenBefore: [...source.children],
      toParentId: target.id,
      toIndex: target.children.length,
      toParentChildrenBefore: [...target.children],
    },
  };
}
