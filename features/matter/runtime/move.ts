import type { ThoughtTree, TreeCommand } from "../tree/model";
import { MAX_CHILDREN_PER_NODE, MAX_TREE_DEPTH } from "../tree/invariants";

export type MoveNodeValues = {
  readonly commandId: string;
  readonly nodeId: string;
  readonly targetParentId: string;
  /** Slot in the target's current child list, before removing the source. */
  readonly targetIndex?: number;
  readonly createdAt: string;
};

export type NodeMovePolicy = Readonly<{
  sourceId: string;
  sourceDepth: number;
  validTargetIds: ReadonlySet<string>;
}>;

/**
 * Projects every legal parent once when a pointer gesture starts. The render
 * edge can then keep pointer-move validation O(1), while command construction
 * rebuilds the policy against the current revision before committing.
 */
export function createNodeMovePolicy(
  tree: ThoughtTree,
  sourceId: string,
): NodeMovePolicy | null {
  const source = tree.nodes[sourceId];
  if (
    tree.rootId === null ||
    source === undefined ||
    source.parentId === null ||
    source.id === tree.rootId
  ) return null;
  const sourceParent = tree.nodes[source.parentId];
  if (sourceParent === undefined || !sourceParent.children.includes(source.id)) return null;

  const depthById = new Map<string, number>();
  const traversal = [{
    id: tree.rootId,
    depth: tree.nodes[tree.rootId]?.role === "document-root" ? 0 : 1,
  }];
  while (traversal.length > 0) {
    const current = traversal.pop();
    if (current === undefined || depthById.has(current.id)) return null;
    const node = tree.nodes[current.id];
    if (node === undefined || current.depth > MAX_TREE_DEPTH) return null;
    depthById.set(current.id, current.depth);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const childId = node.children[index];
      if (childId === undefined) return null;
      traversal.push({ id: childId, depth: current.depth + 1 });
    }
  }
  if (depthById.size !== Object.keys(tree.nodes).length) return null;

  const sourceDepth = depthById.get(source.id);
  if (sourceDepth === undefined) return null;
  const sourceSubtreeIds = new Set<string>();
  const subtree = [{ id: source.id, relativeDepth: 1 }];
  let sourceSubtreeDepth = 0;
  while (subtree.length > 0) {
    const current = subtree.pop();
    if (current === undefined || sourceSubtreeIds.has(current.id)) return null;
    const node = tree.nodes[current.id];
    if (node === undefined) return null;
    sourceSubtreeIds.add(current.id);
    sourceSubtreeDepth = Math.max(sourceSubtreeDepth, current.relativeDepth);
    for (const childId of node.children) {
      subtree.push({ id: childId, relativeDepth: current.relativeDepth + 1 });
    }
  }

  const validTargetIds = new Set<string>();
  for (const target of Object.values(tree.nodes)) {
    const targetDepth = depthById.get(target.id);
    if (
      targetDepth !== undefined &&
      !sourceSubtreeIds.has(target.id) &&
      (target.id === source.parentId || target.children.length < MAX_CHILDREN_PER_NODE) &&
      targetDepth + sourceSubtreeDepth <= MAX_TREE_DEPTH
    ) {
      validTargetIds.add(target.id);
    }
  }
  return Object.freeze({ sourceId: source.id, sourceDepth, validTargetIds });
}

export function canMoveNodeToParent(
  tree: ThoughtTree,
  nodeId: string,
  targetParentId: string,
): boolean {
  return createNodeMovePolicy(tree, nodeId)?.validTargetIds.has(targetParentId) === true;
}

export function moveNodeToParentCommand(tree: ThoughtTree, values: MoveNodeValues): TreeCommand | null {
  const node = tree.nodes[values.nodeId];
  const target = tree.nodes[values.targetParentId];
  if (!canMoveNodeToParent(tree, values.nodeId, values.targetParentId) || !node || !target || node.parentId === null) return null;
  const source = tree.nodes[node.parentId];
  if (!source) return null;
  if (source.id === target.id && values.targetIndex === undefined) return null;
  const fromIndex = source.children.indexOf(node.id);
  if (fromIndex < 0) return null;
  const requestedSlot = values.targetIndex ?? target.children.length;
  if (!Number.isInteger(requestedSlot) || requestedSlot < 0 || requestedSlot > target.children.length) return null;
  const toIndex = source.id === target.id && fromIndex < requestedSlot
    ? requestedSlot - 1
    : requestedSlot;
  const postRemovalLength = target.children.length - (source.id === target.id ? 1 : 0);
  if (toIndex < 0 || toIndex > postRemovalLength || (source.id === target.id && toIndex === fromIndex)) return null;
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
      toIndex,
      toParentChildrenBefore: [...target.children],
    },
  };
}
