import type { MaterialFileRow } from "../material/material-files";
import { projectMaterialFileTerminalMarkerIds } from "./material-file-terminal-markers";

export type MaterialFileGuideEdge =
  | Readonly<{
    kind: "sibling";
    /** The visible parent that owns this sibling relationship. */
    parentId: string | null;
    /** The parent indentation lane; -1 denotes the synthetic document root. */
    laneDepth: number;
    fromIndex: number;
    toIndex: number;
    toKind: "branch" | "terminal";
  }>
  | Readonly<{
    kind: "branch-tail";
    /** The visible parent whose final direct child owns this branch scope. */
    parentId: string | null;
    branchId: string;
    /** The source disclosure's indentation lane. */
    laneDepth: number;
    fromIndex: number;
    /** The final visible descendant in the complete current outline. */
    toIndex: number;
    targetDepth: number;
    /** Air retained before that row's blank, point, disclosure, or restore slot. */
    targetClearance: number;
  }>;

export type MaterialFileGuideSegment =
  | Readonly<{
    kind: "sibling";
    parentId: string | null;
    laneDepth: number;
    fromIndex: number;
    toIndex: number;
    top: number;
    height: number;
  }>
  | Readonly<{
    kind: "branch-tail";
    parentId: string | null;
    branchId: string;
    laneDepth: number;
    fromIndex: number;
    toIndex: number;
    targetDepth: number;
    targetClearance: number;
    /** Only the mounted segment that owns the structural endpoint may turn. */
    endsAtTarget: boolean;
    top: number;
    height: number;
  }>;

type RenderRange = Readonly<{ start: number; end: number }>;
type PreviousSibling = { depth: number; index: number };
type SiblingGroup = { depth: number; count: number; lastIndex: number };
/** A local terminal point needs slightly less air than an 11px arrow. */
const TERMINAL_ENDPOINT_CLEARANCE = 6;
/** The 11px disclosure/recovery glyph keeps a quiet optical gap from the rail. */
const CONTROL_ENDPOINT_CLEARANCE = 8;
/** Tail turns may use more of an empty lane than a vertical sibling guide. */
const TAIL_BLANK_ENDPOINT_CLEARANCE = 2;
/** A 2.5px terminal point retains visible air while allowing a fuller turn. */
const TAIL_TERMINAL_ENDPOINT_CLEARANCE = 4;

/**
 * A sibling guide is a directed continuation from one visible structural
 * branch to its next sibling. When the final direct sibling is itself an open
 * branch, a short tail may instead close that branch's visible scope. The tail
 * never points to a child: its endpoint is the last descendant row only so
 * windowing cannot manufacture or move the scope boundary.
 */
export function projectMaterialFileGuideEdges(
  rows: readonly MaterialFileRow[],
  input: Readonly<{
    /** Expanded disclosure arrows that may start a continuation. */
    sourceRowIndexes: ReadonlySet<number>;
    /** Expanded or collapsed disclosure arrows that may receive one. */
    structuralBranchRowIndexes: ReadonlySet<number>;
    /** Disclosure and held-restore controls a tail must not touch. */
    protectedControlRowIndexes?: ReadonlySet<number>;
  }>,
): readonly MaterialFileGuideEdge[] {
  const terminalMarkerIds = projectMaterialFileTerminalMarkerIds(
    rows,
    input.structuralBranchRowIndexes,
  );
  const previousSiblingByParent = new Map<string | null, PreviousSibling>();
  const siblingGroupByParent = new Map<string | null, SiblingGroup>();
  const edges: MaterialFileGuideEdge[] = [];
  for (const [index, row] of rows.entries()) {
    const group = siblingGroupByParent.get(row.parentId);
    if (group === undefined || group.depth !== row.depth) {
      siblingGroupByParent.set(row.parentId, { depth: row.depth, count: 1, lastIndex: index });
    } else {
      group.count += 1;
      group.lastIndex = index;
    }
    const structuralBranch = input.structuralBranchRowIndexes.has(index);
    const toKind = structuralBranch
      ? "branch"
      : terminalMarkerIds.has(row.nodeId) ? "terminal" : null;
    const previous = previousSiblingByParent.get(row.parentId);
    if (previous === undefined || previous.depth !== row.depth) {
      previousSiblingByParent.set(row.parentId, { depth: row.depth, index });
      continue;
    }
    if (
      input.sourceRowIndexes.has(previous.index) &&
      toKind !== null &&
      index - previous.index > 1
    ) {
      edges.push(Object.freeze({
        kind: "sibling",
        parentId: row.parentId,
        laneDepth: row.depth - 1,
        fromIndex: previous.index,
        toIndex: index,
        toKind,
      }));
    }
    previous.index = index;
  }

  const subtreeEndIndexes = projectSubtreeEndIndexes(rows);
  for (const [parentId, group] of siblingGroupByParent) {
    // A singleton has no local punctuation to close. Requiring a real sibling
    // keeps nested one-child lineages from turning into an IDE-style tree.
    if (group.count < 2) continue;
    const fromIndex = group.lastIndex;
    const source = rows[fromIndex];
    if (
      source === undefined ||
      !input.sourceRowIndexes.has(fromIndex) ||
      !input.structuralBranchRowIndexes.has(fromIndex)
    ) continue;
    const toIndex = subtreeEndIndexes[fromIndex] ?? fromIndex;
    const target = rows[toIndex];
    if (toIndex <= fromIndex || target === undefined || target.depth <= source.depth) continue;
    edges.push(Object.freeze({
      kind: "branch-tail",
      parentId,
      branchId: source.nodeId,
      laneDepth: source.depth - 1,
      fromIndex,
      toIndex,
      targetDepth: target.depth,
      targetClearance: input.protectedControlRowIndexes?.has(toIndex) === true ||
        input.structuralBranchRowIndexes.has(toIndex)
        ? CONTROL_ENDPOINT_CLEARANCE
        : terminalMarkerIds.has(target.nodeId)
          ? TAIL_TERMINAL_ENDPOINT_CLEARANCE
          : TAIL_BLANK_ENDPOINT_CLEARANCE,
    }));
  }

  edges.sort((left, right) => left.fromIndex - right.fromIndex || left.toIndex - right.toIndex);
  return Object.freeze(edges);
}

/** Clips sibling edges to mounted virtual rows while preserving endpoint air. */
export function projectMaterialFileGuideSegments(input: Readonly<{
  edges: readonly MaterialFileGuideEdge[];
  ranges: readonly RenderRange[];
  rowHeight: number;
}>): readonly MaterialFileGuideSegment[] {
  if (!Number.isFinite(input.rowHeight) || input.rowHeight <= 0) return Object.freeze([]);
  const controlEndpointInset = Math.min(CONTROL_ENDPOINT_CLEARANCE, input.rowHeight / 2);
  const terminalEndpointInset = Math.min(TERMINAL_ENDPOINT_CLEARANCE, input.rowHeight / 2);
  const segments: MaterialFileGuideSegment[] = [];
  for (const edge of input.edges) {
    const edgeTop = (edge.fromIndex + 0.5) * input.rowHeight + controlEndpointInset;
    const edgeBottom = (edge.toIndex + 0.5) * input.rowHeight - (
      edge.kind === "branch-tail"
        ? 0
        : edge.toKind === "terminal"
        ? terminalEndpointInset
        : controlEndpointInset
    );
    for (const range of input.ranges) {
      const top = Math.max(edgeTop, range.start * input.rowHeight);
      const bottom = Math.min(edgeBottom, range.end * input.rowHeight);
      if (bottom <= top) continue;
      segments.push(Object.freeze(edge.kind === "branch-tail"
        ? {
          kind: edge.kind,
          parentId: edge.parentId,
          branchId: edge.branchId,
          laneDepth: edge.laneDepth,
          fromIndex: edge.fromIndex,
          toIndex: edge.toIndex,
          targetDepth: edge.targetDepth,
          targetClearance: edge.targetClearance,
          endsAtTarget: bottom === edgeBottom,
          top,
          height: bottom - top,
        }
        : {
          kind: edge.kind,
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

/** Finds every preorder subtree's final visible row in one bounded pass. */
function projectSubtreeEndIndexes(rows: readonly MaterialFileRow[]): readonly number[] {
  const ends = Array.from({ length: rows.length }, (_, index) => index);
  const openIndexes: number[] = [];
  for (const [index, row] of rows.entries()) {
    while (
      openIndexes.length > 0 &&
      (rows[openIndexes.at(-1) ?? -1]?.depth ?? -1) >= row.depth
    ) {
      const closedIndex = openIndexes.pop();
      if (closedIndex !== undefined) ends[closedIndex] = index - 1;
    }
    openIndexes.push(index);
  }
  for (const index of openIndexes) ends[index] = rows.length - 1;
  return Object.freeze(ends);
}
