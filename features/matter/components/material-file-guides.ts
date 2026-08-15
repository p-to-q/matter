import type { MaterialFileRow } from "../material/material-files";

export type MaterialFileGuideEdge = Readonly<{
  /** The visible parent that owns this sibling relationship. */
  parentId: string | null;
  /** The parent indentation lane; -1 denotes the synthetic document root. */
  laneDepth: number;
  fromIndex: number;
  toIndex: number;
}>;

export type MaterialFileGuideSegment = Readonly<{
  parentId: string | null;
  laneDepth: number;
  fromIndex: number;
  toIndex: number;
  top: number;
  height: number;
}>;

type RenderRange = Readonly<{ start: number; end: number }>;
type PreviousSibling = {
  depth: number;
  index: number;
};
/** Blank leaf joints need only enough air to keep adjacent edges distinct. */
const LEAF_ENDPOINT_CLEARANCE = 4;
/** The 11px disclosure/recovery glyph keeps a quiet optical gap from the rail. */
const CONTROL_ENDPOINT_CLEARANCE = 6;

/**
 * A guide is an edge between adjacent visible siblings, owned by their parent.
 * A guide appears when the sibling group still opens into a deeper level. A
 * terminal group is already the smallest readable unit, so its leaves keep
 * their compact rhythm without a redundant rail. The outline remains the
 * authority for which relationships are currently open.
 */
export function projectMaterialFileGuideEdges(
  rows: readonly MaterialFileRow[],
): readonly MaterialFileGuideEdge[] {
  const visibleParentIds = new Set<string>();
  for (const row of rows) {
    if (row.parentId !== null) visibleParentIds.add(row.parentId);
  }

  // A rail is useful only if one of a sibling group's entries opens into the
  // next depth. Record that fact first so a wide terminal group never stores
  // provisional edges merely to discard them once its final leaf is known.
  const guideParentIds = new Set<string | null>();
  for (const row of rows) {
    if (visibleParentIds.has(row.nodeId)) guideParentIds.add(row.parentId);
  }

  const previousSiblingByParent = new Map<string | null, PreviousSibling>();
  const edges: MaterialFileGuideEdge[] = [];
  for (const [index, row] of rows.entries()) {
    const previous = previousSiblingByParent.get(row.parentId);
    if (previous === undefined || previous.depth !== row.depth) {
      previousSiblingByParent.set(row.parentId, {
        depth: row.depth,
        index,
      });
      continue;
    }

    if (guideParentIds.has(row.parentId)) {
      edges.push(Object.freeze({
        parentId: row.parentId,
        laneDepth: row.depth - 1,
        fromIndex: previous.index,
        toIndex: index,
      }));
    }
    previous.index = index;
  }
  return Object.freeze(edges);
}

/**
 * Clips each parent-owned edge to mounted virtual-index ranges. The small gap
 * around a shared sibling keeps neighbouring relations from becoming one
 * accidental uninterrupted rail. Row height is a stable render input,
 * so geometry never needs to be read from the DOM.
 */
export function projectMaterialFileGuideSegments(input: Readonly<{
  edges: readonly MaterialFileGuideEdge[];
  ranges: readonly RenderRange[];
  rowHeight: number;
  /** Visible rows carrying a disclosure, recovery, or selection glyph. */
  controlRowIndexes?: ReadonlySet<number>;
}>): readonly MaterialFileGuideSegment[] {
  if (!Number.isFinite(input.rowHeight) || input.rowHeight <= 0) return Object.freeze([]);
  const leafEndpointInset = Math.min(LEAF_ENDPOINT_CLEARANCE, input.rowHeight / 2);
  const controlEndpointInset = Math.min(CONTROL_ENDPOINT_CLEARANCE, input.rowHeight / 2);
  const segments: MaterialFileGuideSegment[] = [];
  for (const edge of input.edges) {
    const fromInset = input.controlRowIndexes?.has(edge.fromIndex) === true
      ? controlEndpointInset
      : leafEndpointInset;
    const toInset = input.controlRowIndexes?.has(edge.toIndex) === true
      ? controlEndpointInset
      : leafEndpointInset;
    const edgeTop = (edge.fromIndex + 0.5) * input.rowHeight + fromInset;
    const edgeBottom = (edge.toIndex + 0.5) * input.rowHeight - toInset;
    for (const range of input.ranges) {
      const top = Math.max(edgeTop, range.start * input.rowHeight);
      const bottom = Math.min(edgeBottom, range.end * input.rowHeight);
      if (bottom <= top) continue;
      segments.push(Object.freeze({
        parentId: edge.parentId,
        laneDepth: edge.laneDepth,
        fromIndex: edge.fromIndex,
        toIndex: edge.toIndex,
        top,
        height: bottom - top,
      }));
    }
  }
  return Object.freeze(segments);
}
