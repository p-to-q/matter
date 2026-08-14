import { isDocumentRoot } from "../tree/document-root";
import type { ThoughtTree } from "../tree/model";

/**
 * A working context is a transient projection over material, never another
 * document state. Held-aside roots form an antichain: one root withholds its
 * whole branch, so descendants never need their own duplicate exclusion.
 */
export type HeldAsideNodeIds = ReadonlySet<string>;

export type WorkingContextNode = Readonly<{
  nodeId: string;
  depth: number;
}>;

export type WorkingContextProjection = Readonly<{
  heldAsideNodeIds: ReadonlySet<string>;
  activeNodeIds: ReadonlySet<string>;
}>;

const EMPTY_HELD_ASIDE: HeldAsideNodeIds = new Set<string>();

export function createHeldAsideNodeIds(): HeldAsideNodeIds {
  return EMPTY_HELD_ASIDE;
}

/**
 * Reconciles transient branch roots after material changes. It drops removed,
 * unreachable, synthetic-root, and redundant descendant ids without changing
 * the material tree or command history.
 */
export function reconcileHeldAsideNodeIds(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds,
): HeldAsideNodeIds {
  if (heldAsideNodeIds.size === 0) return heldAsideNodeIds;

  const roots = new Set<string>();
  const stack = tree.rootId === null ? [] : [tree.rootId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (nodeId === undefined || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = tree.nodes[nodeId];
    if (node === undefined) continue;
    if (heldAsideNodeIds.has(nodeId) && !isDocumentRoot(tree, nodeId)) {
      roots.add(nodeId);
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const childId = node.children[index];
      if (childId !== undefined) stack.push(childId);
    }
  }
  return sameSet(roots, heldAsideNodeIds) ? heldAsideNodeIds : roots;
}

/**
 * Adds or restores one branch root. A descendant of an already held-aside
 * branch is unchanged: it has no independent working-context meaning until
 * its ancestor is restored.
 */
export function toggleHeldAsideBranch(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds,
  nodeId: string,
): HeldAsideNodeIds {
  const current = reconcileHeldAsideNodeIds(tree, heldAsideNodeIds);
  if (!isSetAsideCandidate(tree, nodeId)) return current;

  if (current.has(nodeId)) {
    const restored = new Set(current);
    restored.delete(nodeId);
    return restored;
  }
  if (isNodeHeldAside(tree, current, nodeId)) return current;

  const next = new Set(current);
  next.add(nodeId);
  return reconcileHeldAsideNodeIds(tree, next);
}

/**
 * Focus is an explicit return to a material path. Restoring only roots on that
 * path keeps unrelated branches held aside while preventing a focused lineage
 * from being visibly present but semantically absent.
 */
export function restoreHeldAsideLineage(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds,
  nodeId: string,
): HeldAsideNodeIds {
  const current = reconcileHeldAsideNodeIds(tree, heldAsideNodeIds);
  if (!hasReachableNode(tree, nodeId) || current.size === 0) return current;

  const restored = new Set(current);
  const seen = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    restored.delete(currentId);
    currentId = tree.nodes[currentId]?.parentId ?? null;
  }
  return sameSet(restored, current) ? current : restored;
}

/** True when the node or any reachable ancestor has been held aside. */
export function isNodeHeldAside(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds,
  nodeId: string,
): boolean {
  if (!hasNode(tree, nodeId)) return false;
  const seen = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId !== null && !seen.has(currentId)) {
    if (heldAsideNodeIds.has(currentId)) return true;
    seen.add(currentId);
    currentId = tree.nodes[currentId]?.parentId ?? null;
  }
  return false;
}

/**
 * Projects the complete active material tree in authored preorder. A held
 * root and every descendant are absent; their depth is never recomputed, so
 * the retained structure stays truthful when a sibling branch is omitted.
 */
export function projectActiveWorkingContext(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds = EMPTY_HELD_ASIDE,
): readonly WorkingContextNode[] {
  const held = reconcileHeldAsideNodeIds(tree, heldAsideNodeIds);
  const active: WorkingContextNode[] = [];
  const root = tree.rootId === null ? undefined : tree.nodes[tree.rootId];
  const stack = root === undefined
    ? []
    : [{ nodeId: root.id, depth: isDocumentRoot(tree, root.id) ? -1 : 0 }];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = tree.nodes[current.nodeId];
    if (node === undefined) continue;
    if (held.has(node.id)) continue;
    if (!isDocumentRoot(tree, node.id)) {
      active.push(Object.freeze({ nodeId: node.id, depth: current.depth }));
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const childId = node.children[index];
      if (childId !== undefined) stack.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }

  return Object.freeze(active);
}

/**
 * Derives membership once for render consumers. Layout keeps every visible
 * node; this projection is the shared semantic gate for interaction and model
 * context, so opacity can never be the only exclusion mechanism.
 */
export function projectWorkingContext(
  tree: ThoughtTree,
  heldAsideNodeIds: HeldAsideNodeIds = EMPTY_HELD_ASIDE,
): WorkingContextProjection {
  const heldRoots = reconcileHeldAsideNodeIds(tree, heldAsideNodeIds);
  const held = new Set<string>();
  const active = new Set<string>();
  const rootId = tree.rootId;
  if (rootId === null || tree.nodes[rootId] === undefined) {
    return Object.freeze({ heldAsideNodeIds: held, activeNodeIds: active });
  }
  const stack = [{ nodeId: rootId, inheritedHeld: false }];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = tree.nodes[current.nodeId];
    if (node === undefined) continue;
    const isHeld = current.inheritedHeld || heldRoots.has(node.id);
    if (!isDocumentRoot(tree, node.id)) {
      if (isHeld) held.add(node.id);
      else active.add(node.id);
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const childId = node.children[index];
      if (childId !== undefined) stack.push({ nodeId: childId, inheritedHeld: isHeld });
    }
  }
  return Object.freeze({
    heldAsideNodeIds: Object.freeze(held),
    activeNodeIds: Object.freeze(active),
  });
}

function projectTreePreorder(tree: ThoughtTree): readonly WorkingContextNode[] {
  const nodes: WorkingContextNode[] = [];
  const stack = tree.rootId === null ? [] : [{ nodeId: tree.rootId, depth: 0 }];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = tree.nodes[current.nodeId];
    if (node === undefined) continue;
    nodes.push(current);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const childId = node.children[index];
      if (childId !== undefined) stack.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }
  return nodes;
}

function isSetAsideCandidate(tree: ThoughtTree, nodeId: string): boolean {
  return hasReachableNode(tree, nodeId) && !isDocumentRoot(tree, nodeId);
}

function hasNode(tree: ThoughtTree, nodeId: string): boolean {
  return typeof nodeId === "string" && nodeId.length > 0 && Object.hasOwn(tree.nodes, nodeId);
}

function hasReachableNode(tree: ThoughtTree, nodeId: string): boolean {
  return typeof nodeId === "string" && nodeId.length > 0 &&
    projectTreePreorder(tree).some((entry) => entry.nodeId === nodeId);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && Array.from(left).every((value) => right.has(value));
}
