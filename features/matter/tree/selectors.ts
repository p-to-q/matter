import type { ThoughtNode, ThoughtTree } from "./model";

/**
 * Projects the full tree into authored depth-first order. A folded node remains
 * visible; only its descendants are omitted. Fold state is runtime navigation
 * state and is deliberately supplied separately from the material document.
 */
export function selectVisiblePreorder(
  tree: ThoughtTree,
  foldedNodeIds: ReadonlySet<string>,
): ThoughtNode[] {
  if (tree.rootId === null) {
    return [];
  }

  const visible: ThoughtNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);

    const node: ThoughtNode | undefined = tree.nodes[nodeId];
    if (node === undefined) {
      return;
    }

    visible.push(node);
    if (foldedNodeIds.has(nodeId)) {
      return;
    }

    for (const childId of node.children) {
      visit(childId);
    }
  };

  visit(tree.rootId);
  return visible;
}

/**
 * Returns the exact root-to-focus material path. Folds are intentionally not
 * accepted: focus projection and model context must be the same lineage.
 *
 * A missing, detached, or cyclic focus returns `null` rather than a partial
 * path. Valid trees cannot contain the latter cases, but the stable failure is
 * useful at hydration and other untrusted boundaries.
 */
export function selectLineage(
  tree: ThoughtTree,
  focusNodeId: string,
): ThoughtNode[] | null {
  if (tree.rootId === null || tree.nodes[focusNodeId] === undefined) {
    return null;
  }

  const reversePath: ThoughtNode[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = focusNodeId;

  while (nodeId !== null) {
    if (visited.has(nodeId)) {
      return null;
    }
    visited.add(nodeId);

    const node: ThoughtNode | undefined = tree.nodes[nodeId];
    if (node === undefined) {
      return null;
    }
    reversePath.push(node);
    nodeId = node.parentId;
  }

  reversePath.reverse();
  return reversePath[0]?.id === tree.rootId ? reversePath : null;
}
