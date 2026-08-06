import type { ThoughtTree, TreeCommand } from "../tree/model";

export type MoveNodeValues = {
  readonly commandId: string;
  readonly nodeId: string;
  readonly targetParentId: string;
  readonly createdAt: string;
};

export function moveNodeToParentCommand(tree: ThoughtTree, values: MoveNodeValues): TreeCommand | null {
  const node = tree.nodes[values.nodeId];
  const target = tree.nodes[values.targetParentId];
  if (!node || !target || node.parentId === null || node.id === tree.rootId || node.id === target.id) return null;
  let cursor: string | null = target.id;
  while (cursor !== null) {
    if (cursor === node.id) return null;
    cursor = tree.nodes[cursor]?.parentId ?? null;
  }
  const source = tree.nodes[node.parentId];
  if (!source || !Number.isInteger(source.children.indexOf(node.id))) return null;
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
      fromIndex: source.children.indexOf(node.id),
      fromParentChildrenBefore: [...source.children],
      toParentId: target.id,
      toIndex: target.children.length,
      toParentChildrenBefore: [...target.children],
    },
  };
}
