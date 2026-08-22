import type { ColumnarLayout, LayoutBox, LayoutEdge } from "./model";

export type VerticalPresentationBand = Readonly<{
  nodeId: string;
  bottomExtent: number;
}>;

/**
 * Opens a viewport-wide material band below one fixed source layout row.
 * Material whose layout box begins below that row moves down; material above
 * or sharing the row stays fixed. Wrapped language inside the source node is
 * projected separately at the DOM rendering edge, where line geometry exists.
 * Language growth therefore cannot translate structural material upward.
 */
export function projectVerticalPresentationBand(
  layout: ColumnarLayout,
  band: VerticalPresentationBand,
): ColumnarLayout | null {
  if (
    band.nodeId.length === 0 ||
    !isNonNegativeFinite(band.bottomExtent)
  ) return null;
  const source = layout.boxes.find((box) => box.nodeId === band.nodeId);
  if (source === undefined) return null;
  if (band.bottomExtent === 0) return layout;

  const boxes = layout.boxes.map((box) => {
    const y = box.y > source.y ? box.y + band.bottomExtent : box.y;
    return {
      ...box,
      y,
      subtreeHeight: box.subtreeHeight,
    };
  });
  const boxById = new Map(boxes.map((box) => [box.nodeId, box]));
  const childrenById = new Map<string, LayoutBox[]>();
  for (const box of boxes) {
    if (box.parentId === null) continue;
    const children = childrenById.get(box.parentId) ?? [];
    children.push(box);
    childrenById.set(box.parentId, children);
  }
  const verticalBoundsById = new Map<string, { min: number; max: number }>();
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    if (box === undefined) return null;
    let min = box.y;
    let max = box.y + box.height;
    if (box.nodeId === band.nodeId) {
      max = Math.max(max, box.y + box.height + band.bottomExtent);
    }
    for (const child of childrenById.get(box.nodeId) ?? []) {
      const childBounds = verticalBoundsById.get(child.nodeId);
      if (childBounds === undefined) return null;
      min = Math.min(min, childBounds.min);
      max = Math.max(max, childBounds.max);
    }
    box.subtreeHeight = max - min;
    verticalBoundsById.set(box.nodeId, { min, max });
  }

  const edges: LayoutEdge[] = [];
  for (const box of boxes) {
    if (box.parentId === null) continue;
    const parent = boxById.get(box.parentId);
    if (parent === undefined) return null;
    const start = { x: parent.x + parent.width, y: parent.y + parent.height / 2 };
    const end = { x: box.x, y: box.y + box.height / 2 };
    const elbowX = start.x + (end.x - start.x) / 2;
    edges.push({
      parentId: parent.nodeId,
      childId: box.nodeId,
      points: [start, { x: elbowX, y: start.y }, { x: elbowX, y: end.y }, end],
    });
  }

  const minY = Math.min(
    ...boxes.map((box) => box.y),
  );
  const maxY = Math.max(
    source.y + source.height + band.bottomExtent,
    ...boxes.map((box) => box.y + box.height),
  );
  for (const box of boxes) Object.freeze(box);
  for (const edge of edges) {
    for (const point of edge.points) Object.freeze(point);
    Object.freeze(edge.points);
    Object.freeze(edge);
  }
  return Object.freeze({
    layoutEpoch: layout.layoutEpoch,
    boxes: Object.freeze(boxes),
    edges: Object.freeze(edges),
    bounds: Object.freeze({
      x: layout.bounds.x,
      y: minY,
      width: layout.bounds.width,
      height: maxY - minY,
    }),
  });
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
