export type CanvasGeometryPublication = Readonly<{
  width: number;
  height: number;
  nodes: readonly Readonly<{
    nodeId: string;
    transform: string;
  }>[];
}>;

/**
 * Turns an already validated layout into inert rendering-edge values. This is
 * deliberately not a second layout model: it owns neither measurement nor
 * geometry authority, only the DOM properties that display a layout receipt.
 */
export function projectCanvasGeometryPublication(
  layout: Readonly<{
    bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
    boxes: readonly Readonly<{
      nodeId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>[];
  }>,
): CanvasGeometryPublication {
  return Object.freeze({
    width: layout.bounds.width,
    height: layout.bounds.height,
    nodes: Object.freeze(layout.boxes.map((box) => Object.freeze({
      nodeId: box.nodeId,
      transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
    }))),
  });
}
