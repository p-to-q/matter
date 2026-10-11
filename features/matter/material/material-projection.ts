import { isDocumentRoot } from "../tree/document-root";
import { MAX_NODES_PER_TREE, MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import type { SegmentSelection } from "./text-segments";
import { projectActiveViewContext } from "./working-context";

/**
 * One deterministic, versioned projection of the tree: structure, order,
 * relation, address and clipping. It is derived, never stored, and nothing
 * reads it back into the tree; renderers and adapters consume it.
 */
export const MATERIAL_PROJECTION_VERSION = "material-projection/1" as const;

export const MATERIAL_ADDRESS_KINDS = Object.freeze(["selection", "lineage", "working-tree"] as const);
export type MaterialAddressKind = (typeof MATERIAL_ADDRESS_KINDS)[number];

export type MaterialAddress =
  | Readonly<{ kind: "selection"; selections: readonly SegmentSelection[] }>
  | Readonly<{ kind: "lineage"; focusNodeId: string }>
  | Readonly<{
      kind: "working-tree";
      view: readonly Readonly<{ node: Readonly<{ id: string }>; depth: number }>[];
      activeNodeIds: ReadonlySet<string>;
    }>;

export type MaterialProjectionNode = Readonly<{
  nodeId: string;
  parentId: string | null;
  siblingIndex: number;
  depth: number;
  text: string;
  truncated: boolean;
}>;

export type MaterialProjection = Readonly<{
  version: typeof MATERIAL_PROJECTION_VERSION;
  treeId: string;
  revision: number;
  address: MaterialAddressKind;
  nodes: readonly MaterialProjectionNode[];
  thoughtCount: number;
  clipped: boolean;
}>;

export type MaterialProjectionLimits = Readonly<{
  maxNodes?: number;
  maxNodeCodePoints?: number;
  maxTotalCodePoints?: number;
}>;

/** The tree's own bounds: with no limits given, nothing a valid tree holds is clipped. */
const DEFAULT_LIMITS = Object.freeze({
  maxNodes: MAX_NODES_PER_TREE,
  maxNodeCodePoints: MAX_NODE_TEXT_CODE_UNITS,
  maxTotalCodePoints: MAX_NODES_PER_TREE * MAX_NODE_TEXT_CODE_UNITS,
});

type Source = Readonly<{ nodeId: string; depth: number; text: () => string }>;

/**
 * `depth` keeps the one-meaning-per-address rule of the inquiry projection:
 * the view's depth for `working-tree`, the position on the root-to-focus path
 * for `lineage`, and the presentation index for `selection`. The document root
 * is structure and is never a node. Held-aside material never reaches this
 * function: a working-tree caller passes only active ids, and nothing here
 * reads, counts or names what it was not given.
 */
export function projectMaterial(
  tree: ThoughtTree,
  address: MaterialAddress,
  limits: MaterialProjectionLimits = {},
): MaterialProjection {
  const sources = sourcesOf(tree, address);
  const maxNodes = bound(limits.maxNodes, DEFAULT_LIMITS.maxNodes);
  const maxNode = bound(limits.maxNodeCodePoints, DEFAULT_LIMITS.maxNodeCodePoints);
  const maxTotal = bound(limits.maxTotalCodePoints, DEFAULT_LIMITS.maxTotalCodePoints);

  // Sibling rank is taken over the addressed set, not the whole child list: a
  // real index would count held-aside siblings and so leak how many exist.
  const rank = siblingRanks(tree, sources);
  const kept: MaterialProjectionNode[] = [];
  const carried = new Set<string>();
  const nodeLimit = Math.min(sources.length, maxNodes);
  let remaining = maxTotal;
  let clipped = sources.length > nodeLimit;

  for (let index = 0; index < nodeLimit; index += 1) {
    const source = sources[index];
    if (source === undefined) continue;
    const nodeBudget = Math.min(maxNode, remaining);
    const bounded = takeCodePoints(source.text(), nodeBudget);
    if (bounded.truncated) clipped = true;
    if (remaining === 0 && bounded.truncated) break;
    // A receipt must not name a node it does not carry: a real parent counts
    // only when it was carried earlier, so the synthetic document root, a
    // withheld parent and a clipped-away parent all read as null.
    const realParentId = tree.nodes[source.nodeId]?.parentId ?? null;
    kept.push(Object.freeze({
      nodeId: source.nodeId,
      parentId: realParentId !== null && carried.has(realParentId) ? realParentId : null,
      siblingIndex: rank.get(source.nodeId) ?? 0,
      depth: source.depth,
      text: bounded.text,
      truncated: bounded.truncated,
    }));
    carried.add(source.nodeId);
    remaining -= bounded.count;
  }

  return Object.freeze({
    version: MATERIAL_PROJECTION_VERSION,
    treeId: tree.id,
    revision: tree.revision,
    address: address.kind,
    nodes: Object.freeze(kept),
    thoughtCount: sources.length,
    clipped,
  });
}

function sourcesOf(tree: ThoughtTree, address: MaterialAddress): readonly Source[] {
  switch (address.kind) {
    case "selection": {
      // Selected text is the passage; one node may carry several ranges, so ids
      // may repeat here and only here.
      const present = address.selections.filter(({ nodeId }) => isMaterial(tree, nodeId));
      return present.map(({ nodeId, selectedText }, index) => ({ nodeId, depth: index, text: () => selectedText }));
    }
    case "lineage": {
      const path = selectLineage(tree, address.focusNodeId);
      if (path === null) return [];
      return path
        .filter(({ id }) => isMaterial(tree, id))
        .map(({ id, text }, index) => ({ nodeId: id, depth: index, text: () => text }));
    }
    case "working-tree": {
      const seen = new Set<string>();
      const sources: Source[] = [];
      for (const { nodeId, depth } of projectActiveViewContext(address.view, address.activeNodeIds)) {
        if (seen.has(nodeId) || !isMaterial(tree, nodeId)) continue;
        seen.add(nodeId);
        sources.push({ nodeId, depth, text: () => tree.nodes[nodeId]?.text ?? "" });
      }
      return sources;
    }
  }
}

function isMaterial(tree: ThoughtTree, nodeId: string): boolean {
  return typeof nodeId === "string" && Object.hasOwn(tree.nodes, nodeId) && !isDocumentRoot(tree, nodeId);
}

function siblingRanks(tree: ThoughtTree, sources: readonly Source[]): ReadonlyMap<string, number> {
  const addressed = new Set(sources.map(({ nodeId }) => nodeId));
  const ranks = new Map<string, number>();
  const parents = new Set<string>();
  for (const { nodeId } of sources) {
    const parentId = tree.nodes[nodeId]?.parentId ?? null;
    if (parentId === null) ranks.set(nodeId, 0);
    else parents.add(parentId);
  }
  for (const parentId of parents) {
    let next = 0;
    for (const childId of tree.nodes[parentId]?.children ?? []) {
      if (!addressed.has(childId)) continue;
      ranks.set(childId, next);
      next += 1;
    }
  }
  return ranks;
}

function bound(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/** Counts code points so a truncation never splits a surrogate pair. */
function takeCodePoints(
  text: string,
  limit: number,
): Readonly<{ text: string; count: number; truncated: boolean }> {
  let count = 0;
  let end = 0;
  for (const point of text) {
    if (count >= limit) return { text: text.slice(0, end), count, truncated: true };
    count += 1;
    end += point.length;
  }
  return { text, count, truncated: false };
}
