import type { ColumnarLayout, LayoutEdge } from "./model";

/**
 * The root-to-target line drawn while an AI operation is addressed at one
 * passage. It is the basis of an operation, not navigation: nothing here is
 * stored, and the caller draws it only while the operation owns its target.
 */
export type OperationLineOptions = Readonly<{
  /**
   * Passages currently mounted in a windowed renderer. A segment with an
   * endpoint outside the window is dropped, never given an invented end.
   */
  mountedNodeIds?: ReadonlySet<string>;
}>;

/**
 * The layout edges whose child lies on the root-to-target lineage, in lineage
 * order. `lineageIds` is the selected lineage (the synthetic document root is
 * not a node). Returns `null` unless the published edges name every step of
 * that lineage exactly, so a target that is not yet laid out, or a layout that
 * disagrees with the tree, draws nothing instead of a partial or guessed path.
 */
export function operationLinePath(
  edges: readonly LayoutEdge[],
  lineageIds: readonly string[] | null,
  options: OperationLineOptions = {},
): readonly LayoutEdge[] | null {
  if (lineageIds === null || lineageIds.length < 2) return null;
  const lineage = new Set(lineageIds);

  const edgeByChild = new Map<string, LayoutEdge>();
  for (const edge of edges) {
    if (lineage.has(edge.childId)) edgeByChild.set(edge.childId, edge);
  }

  const path: LayoutEdge[] = [];
  for (let index = 1; index < lineageIds.length; index += 1) {
    const edge = edgeByChild.get(lineageIds[index]!);
    if (edge === undefined || edge.parentId !== lineageIds[index - 1]) return null;
    path.push(edge);
  }

  const mounted = options.mountedNodeIds;
  const visible = mounted === undefined
    ? path
    : path.filter((edge) => mounted.has(edge.parentId) && mounted.has(edge.childId));
  return visible.length === 0 ? null : visible;
}

/** One SVG path: a separate sub-path per edge, since each passes behind its child. */
export function operationLineData(segments: readonly LayoutEdge[]): string {
  return segments
    .map(({ points }) => points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(""))
    .join("");
}

/**
 * The line's path data for one published layout, or `null` when there is
 * nothing current to draw. A layout whose epoch is not the current publication
 * is never drawn, so the line cannot trail the passages it joins.
 */
export function operationLineGeometry(input: Readonly<{
  layout: ColumnarLayout | null;
  currentLayoutEpoch: number | null;
  lineageIds: readonly string[] | null;
  mountedNodeIds?: ReadonlySet<string>;
}>): string | null {
  const { layout } = input;
  if (layout === null || layout.layoutEpoch !== input.currentLayoutEpoch) return null;
  const segments = operationLinePath(layout.edges, input.lineageIds, {
    mountedNodeIds: input.mountedNodeIds,
  });
  return segments === null ? null : operationLineData(segments);
}
