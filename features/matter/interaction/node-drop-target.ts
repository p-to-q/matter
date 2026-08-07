import type { ColumnarLayout } from "../layout/model";
import type { NodeMovePolicy } from "../runtime/move";
import type { ThoughtTree } from "../tree/model";

export type NodeDropMode = "nest" | "before" | "after" | "top-level";

export type NodeDropLaneEntry = Readonly<{
  nodeId: string;
  parentId: string | null;
  authoredIndex: number;
  top: number;
  bottom: number;
}>;

export type NodeDropLane = Readonly<{
  depth: number;
  left: number;
  right: number;
  maxHeight: number;
  entries: readonly NodeDropLaneEntry[];
}>;

export type NodeDropBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export function projectNodeDropLanes(
  tree: ThoughtTree,
  layout: ColumnarLayout,
  canvasBounds: Readonly<{ left: number; top: number }>,
  zoom: number,
): readonly NodeDropLane[] {
  const lanes = new Map<number, { left: number; right: number; maxHeight: number; entries: NodeDropLaneEntry[] }>();
  for (const box of layout.boxes) {
    const node = tree.nodes[box.nodeId];
    if (node === undefined) continue;
    const left = canvasBounds.left + box.x * zoom;
    const right = left + box.width * zoom;
    const lane = lanes.get(box.depth) ?? { left, right, maxHeight: 0, entries: [] };
    lane.left = Math.min(lane.left, left);
    lane.right = Math.max(lane.right, right);
    lane.maxHeight = Math.max(lane.maxHeight, box.height * zoom);
    lane.entries.push(Object.freeze({
      nodeId: node.id,
      parentId: node.parentId,
      authoredIndex: node.parentId === null
        ? 0
        : Math.max(0, tree.nodes[node.parentId]?.children.indexOf(node.id) ?? 0),
      top: canvasBounds.top + box.y * zoom,
      bottom: canvasBounds.top + (box.y + box.height) * zoom,
    }));
    lanes.set(box.depth, lane);
  }
  return Object.freeze(Array.from(lanes, ([depth, lane]) => Object.freeze({
    depth,
    left: lane.left,
    right: lane.right,
    maxHeight: lane.maxHeight,
    entries: Object.freeze(lane.entries.sort((left, right) => left.top - right.top)),
  })).sort((left, right) => left.depth - right.depth));
}

/**
 * Resolves blank-space intent without making coordinates durable: a nearby
 * populated column inherits that row's parent, while unrelated paper returns
 * the node to the visible root's first structural level.
 */
export function resolveBlankNodeDropTarget({
  clientX,
  clientY,
  documentBounds,
  lanes,
  policy,
  rootId,
  startX,
  startY,
}: Readonly<{
  clientX: number;
  clientY: number;
  documentBounds: NodeDropBounds | null;
  lanes: readonly NodeDropLane[];
  policy: NodeMovePolicy;
  rootId: string | null;
  startX: number;
  startY: number;
}>): Readonly<{
  targetId: string;
  targetIndex: number;
  indicatorId: string | null;
  mode: Exclude<NodeDropMode, "nest">;
}> | null {
  if (
    documentBounds === null ||
    clientX < documentBounds.left ||
    clientX > documentBounds.right ||
    clientY < documentBounds.top ||
    clientY > documentBounds.bottom ||
    Math.hypot(clientX - startX, clientY - startY) < 56
  ) return null;

  const columnTolerance = 38;
  const rowTolerance = 88;
  let nearest: Readonly<{
    targetId: string;
    targetIndex: number;
    indicatorId: string;
    mode: "before" | "after";
    score: number;
  }> | null = null;
  for (const lane of lanes) {
    const xDistance = distanceToInterval(clientX, lane.left, lane.right);
    if (xDistance > columnTolerance) continue;
    const first = lowerBoundNodeDropEntry(lane.entries, clientY - rowTolerance - lane.maxHeight);
    for (let index = first; index < lane.entries.length; index += 1) {
      const entry = lane.entries[index];
      if (entry === undefined || entry.top > clientY + rowTolerance) break;
      if (entry.parentId === null || !policy.validTargetIds.has(entry.parentId)) continue;
      const yDistance = distanceToInterval(clientY, entry.top, entry.bottom);
      if (yDistance > rowTolerance) continue;
      const score = xDistance + yDistance;
      if (nearest === null || score < nearest.score) {
        const before = clientY < (entry.top + entry.bottom) / 2;
        nearest = {
          targetId: entry.parentId,
          targetIndex: entry.authoredIndex + (before ? 0 : 1),
          indicatorId: entry.nodeId,
          mode: before ? "before" : "after",
          score,
        };
      }
    }
  }
  if (nearest !== null) return Object.freeze({
    targetId: nearest.targetId,
    targetIndex: nearest.targetIndex,
    indicatorId: nearest.indicatorId,
    mode: nearest.mode,
  });
  return rootId !== null && policy.validTargetIds.has(rootId)
    ? Object.freeze({
        targetId: rootId,
        targetIndex: Number.MAX_SAFE_INTEGER,
        indicatorId: null,
        mode: "top-level" as const,
      })
    : null;
}

function lowerBoundNodeDropEntry(entries: readonly NodeDropLaneEntry[], top: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((entries[middle]?.top ?? Number.POSITIVE_INFINITY) < top) low = middle + 1;
    else high = middle;
  }
  return low;
}

function distanceToInterval(value: number, start: number, end: number): number {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
}
