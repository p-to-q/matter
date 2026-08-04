import type { ThoughtTree } from "../tree/model";

export type NavigationState =
  | {
      mode: "full";
      focusNodeId: null;
      selectedNodeId: string | null;
      foldedNodeIds: ReadonlySet<string>;
    }
  | {
      mode: "focus";
      focusNodeId: string;
      selectedNodeId: string | null;
      foldedNodeIds: ReadonlySet<string>;
    };

export type NavigationErrorCode =
  | "NAVIGATION_NODE_NOT_FOUND"
  | "NAVIGATION_FOLD_UNAVAILABLE";

export type NavigationResult =
  | { ok: true; navigation: NavigationState }
  | {
      ok: false;
      navigation: NavigationState;
      error: { code: NavigationErrorCode; message: string };
    };

export function createNavigationState(): NavigationState {
  return {
    mode: "full",
    focusNodeId: null,
    selectedNodeId: null,
    foldedNodeIds: new Set<string>(),
  };
}

export function selectNode(
  tree: ThoughtTree,
  navigation: NavigationState,
  nodeId: string,
): NavigationResult {
  if (!hasNode(tree, nodeId)) {
    return missingNode(navigation, "The selected node does not exist.");
  }

  if (navigation.selectedNodeId === nodeId) {
    return { ok: true, navigation };
  }

  const foldedNodeIds =
    navigation.mode === "full"
      ? removeAncestors(tree, navigation.foldedNodeIds, nodeId)
      : navigation.foldedNodeIds;
  return {
    ok: true,
    navigation: { ...navigation, selectedNodeId: nodeId, foldedNodeIds },
  };
}

export function focusNode(
  tree: ThoughtTree,
  navigation: NavigationState,
  nodeId: string,
): NavigationResult {
  if (!hasNode(tree, nodeId)) {
    return missingNode(navigation, "The focus node does not exist.");
  }
  if (
    navigation.mode === "focus" &&
    navigation.focusNodeId === nodeId &&
    navigation.selectedNodeId === nodeId
  ) {
    return { ok: true, navigation };
  }
  return {
    ok: true,
    navigation: {
      mode: "focus",
      focusNodeId: nodeId,
      selectedNodeId: nodeId,
      foldedNodeIds: navigation.foldedNodeIds,
    },
  };
}

export function showFull(
  tree: ThoughtTree,
  navigation: NavigationState,
): NavigationState {
  if (navigation.mode === "full") {
    return navigation;
  }

  // Exiting focus must reveal the thought that was just being handled.
  const foldedNodeIds = removeAncestors(
    tree,
    navigation.foldedNodeIds,
    navigation.focusNodeId,
  );
  return {
    mode: "full",
    focusNodeId: null,
    selectedNodeId: navigation.focusNodeId,
    foldedNodeIds,
  };
}

export function toggleFold(
  tree: ThoughtTree,
  navigation: NavigationState,
  nodeId: string,
): NavigationResult {
  const node = getOwnNode(tree, nodeId);
  if (node === undefined) {
    return missingNode(navigation, "The fold node does not exist.");
  }
  if (node.children.length === 0) {
    return {
      ok: false,
      navigation,
      error: {
        code: "NAVIGATION_FOLD_UNAVAILABLE",
        message: "A leaf node has no descendants to fold.",
      },
    };
  }

  const foldedNodeIds = new Set(navigation.foldedNodeIds);
  if (foldedNodeIds.delete(nodeId)) {
    return { ok: true, navigation: { ...navigation, foldedNodeIds } };
  }
  foldedNodeIds.add(nodeId);

  // A fold cannot leave the selected handle mounted inside hidden material.
  const selectedNodeId =
    navigation.mode === "full" &&
    navigation.selectedNodeId !== null &&
    isStrictDescendant(tree, navigation.selectedNodeId, nodeId)
      ? nodeId
      : navigation.selectedNodeId;
  return {
    ok: true,
    navigation: { ...navigation, selectedNodeId, foldedNodeIds },
  };
}

/**
 * Reconciles transient handles after one atomic material publication. The old
 * tree is retained only long enough to recover the nearest surviving ancestor.
 */
export function reconcileNavigation(
  previousTree: ThoughtTree,
  nextTree: ThoughtTree,
  navigation: NavigationState,
): NavigationState {
  const nextFolded = new Set<string>();
  for (const nodeId of navigation.foldedNodeIds) {
    const node = getOwnNode(nextTree, nodeId);
    if (node !== undefined && node.children.length > 0) {
      nextFolded.add(nodeId);
    }
  }

  let selectedNodeId = recoverNodeId(
    previousTree,
    nextTree,
    navigation.selectedNodeId,
  );
  const focusNodeId =
    navigation.mode === "focus"
      ? recoverNodeId(previousTree, nextTree, navigation.focusNodeId)
      : null;

  if (focusNodeId === null && navigation.mode === "focus") {
    selectedNodeId = null;
  }

  if (navigation.mode === "focus" && focusNodeId !== null) {
    selectedNodeId = focusNodeId;
    const foldedNodeIds = reuseSetIfEqual(navigation.foldedNodeIds, nextFolded);
    if (
      focusNodeId === navigation.focusNodeId &&
      selectedNodeId === navigation.selectedNodeId &&
      foldedNodeIds === navigation.foldedNodeIds
    ) {
      return navigation;
    }
    return {
      mode: "focus",
      focusNodeId,
      selectedNodeId,
      foldedNodeIds,
    };
  }

  if (selectedNodeId !== null) {
    removeAncestorsInPlace(nextTree, nextFolded, selectedNodeId);
  }
  const foldedNodeIds = reuseSetIfEqual(navigation.foldedNodeIds, nextFolded);
  if (
    navigation.mode === "full" &&
    selectedNodeId === navigation.selectedNodeId &&
    foldedNodeIds === navigation.foldedNodeIds
  ) {
    return navigation;
  }
  return {
    mode: "full",
    focusNodeId: null,
    selectedNodeId,
    foldedNodeIds,
  };
}

function missingNode(
  navigation: NavigationState,
  message: string,
): NavigationResult {
  return {
    ok: false,
    navigation,
    error: { code: "NAVIGATION_NODE_NOT_FOUND", message },
  };
}

function hasNode(tree: ThoughtTree, nodeId: string): boolean {
  return getOwnNode(tree, nodeId) !== undefined;
}

function getOwnNode(tree: ThoughtTree, nodeId: string) {
  return typeof nodeId === "string" &&
    nodeId.length > 0 &&
    Object.hasOwn(tree.nodes, nodeId)
    ? tree.nodes[nodeId]
    : undefined;
}

function isStrictDescendant(
  tree: ThoughtTree,
  nodeId: string,
  possibleAncestorId: string,
): boolean {
  const visited = new Set<string>();
  let currentId = getOwnNode(tree, nodeId)?.parentId ?? null;
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === possibleAncestorId) return true;
    visited.add(currentId);
    currentId = getOwnNode(tree, currentId)?.parentId ?? null;
  }
  return false;
}

function recoverNodeId(
  previousTree: ThoughtTree,
  nextTree: ThoughtTree,
  nodeId: string | null,
): string | null {
  if (nodeId === null) return null;
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId !== null && !visited.has(currentId)) {
    if (getOwnNode(nextTree, currentId) !== undefined) return currentId;
    visited.add(currentId);
    currentId = getOwnNode(previousTree, currentId)?.parentId ?? null;
  }
  return null;
}

function removeAncestors(
  tree: ThoughtTree,
  foldedNodeIds: ReadonlySet<string>,
  nodeId: string,
): ReadonlySet<string> {
  const next = new Set(foldedNodeIds);
  removeAncestorsInPlace(tree, next, nodeId);
  return reuseSetIfEqual(foldedNodeIds, next);
}

function removeAncestorsInPlace(
  tree: ThoughtTree,
  foldedNodeIds: Set<string>,
  nodeId: string,
): void {
  const visited = new Set<string>();
  let parentId = getOwnNode(tree, nodeId)?.parentId ?? null;
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    foldedNodeIds.delete(parentId);
    parentId = getOwnNode(tree, parentId)?.parentId ?? null;
  }
}

function reuseSetIfEqual(
  previous: ReadonlySet<string>,
  next: Set<string>,
): ReadonlySet<string> {
  return previous.size === next.size && [...previous].every((id) => next.has(id))
    ? previous
    : next;
}
