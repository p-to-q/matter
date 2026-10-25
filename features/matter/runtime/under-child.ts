import {
  MAX_CHILDREN_PER_NODE,
  MAX_NODES_PER_TREE,
  MAX_TREE_DEPTH,
} from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import { createAdmissionAnchor, type AdmissionAnchorResult } from "./admission";
import type { NavigationState } from "./navigation";

/**
 * Under starts an ordinary admission whose parent is the passage the mark sits
 * on. Nothing here writes: the spoken words become the child through the same
 * admission pipeline, and the AI never authors that text.
 */

/** Why a passage cannot take another child now; the mark says it, never hides. */
export type UnderBlockReason =
  | "held-aside"
  | "deepest-level"
  | "child-limit"
  | "tree-full"
  | "voice-unavailable"
  | "busy";

export type UnderAvailabilityInput = Readonly<{
  tree: ThoughtTree;
  nodeId: string;
  /** The same predicate Voice admission uses; Under adds no second one. */
  voiceAdmissionAvailable: boolean;
  /** The passage is held aside, or sits inside a branch that is. */
  heldAside: boolean;
  /** Any other interaction (persistence, a submitted admission) is in flight. */
  interactionBusy: boolean;
}>;

/**
 * Structural facts come first (they do not pass), then the environment, then
 * the transient one, so the reason shown is the most durable true one.
 */
export function underBlockReason(input: UnderAvailabilityInput): UnderBlockReason | null {
  const node = input.tree.nodes[input.nodeId];
  // A vanished passage is a stale lens, which settles on the next render.
  if (node === undefined || input.tree.rootId === null) return "busy";
  if (input.heldAside) return "held-aside";
  const room = underChildRoom(input.tree, input.nodeId);
  if (room !== null) return room;
  if (!input.voiceAdmissionAvailable) return "voice-unavailable";
  if (input.interactionBusy) return "busy";
  return null;
}

/**
 * The tree bounds an inserted child must respect: depth is counted exactly as
 * tree validation counts it (a document root is depth 0, any other root 1).
 */
export function underChildRoom(
  tree: ThoughtTree,
  parentNodeId: string,
): "deepest-level" | "child-limit" | "tree-full" | null {
  const parent = tree.nodes[parentNodeId];
  if (parent === undefined) return null;
  if (parent.children.length >= MAX_CHILDREN_PER_NODE) return "child-limit";
  if (Object.keys(tree.nodes).length >= MAX_NODES_PER_TREE) return "tree-full";
  const parentDepth = nodeDepth(tree, parentNodeId);
  if (parentDepth === null || parentDepth + 1 > MAX_TREE_DEPTH) return "deepest-level";
  return null;
}

/** The admission handle for a child appended last under `nodeId`. */
export function createUnderAnchor(
  tree: ThoughtTree,
  navigation: NavigationState,
  nodeId: string,
): AdmissionAnchorResult {
  return createAdmissionAnchor(tree, { ...navigation, selectedNodeId: nodeId });
}

function nodeDepth(tree: ThoughtTree, nodeId: string): number | null {
  let depth = 0;
  let current = tree.nodes[nodeId];
  // Bounded walk: a corrupt parent cycle cannot hang a render.
  for (let step = 0; step <= MAX_TREE_DEPTH + 1; step += 1) {
    if (current === undefined) return null;
    if (current.parentId === null) {
      return current.role === "document-root" ? depth : depth + 1;
    }
    depth += 1;
    current = tree.nodes[current.parentId];
  }
  return null;
}
