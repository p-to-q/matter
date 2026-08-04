import type { ClientPoint } from "./lasso-geometry";

export type LassoRenderPaths = Readonly<{
  /** A render-only smooth trace; semantic hit testing keeps the source polyline. */
  ink: string;
  /** The exact straight seam used to close the semantic polygon on pointer-up. */
  closure: string;
}>;

export function lassoRenderPaths(points: readonly ClientPoint[]): LassoRenderPaths {
  if (!validPoints(points) || points.length === 0) return Object.freeze({ ink: "", closure: "" });
  const open = samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : [...points];
  if (open.length === 0) return Object.freeze({ ink: "", closure: "" });
  if (open.length === 1) return Object.freeze({ ink: move(open[0]!), closure: "" });

  let ink = move(open[0]!);
  for (let index = 1; index < open.length; index += 1) {
    const previous = open[index - 1]!;
    const current = open[index]!;
    const midpoint = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
    ink += ` Q ${coordinate(previous)} ${coordinate(midpoint)}`;
  }
  ink += ` L ${coordinate(open.at(-1)!)}`;
  const closure = open.length < 3 ? "" : `${move(open.at(-1)!)} L ${coordinate(open[0]!)}`;
  return Object.freeze({ ink, closure });
}

function move(point: ClientPoint): string {
  return `M ${coordinate(point)}`;
}

function coordinate(point: ClientPoint): string {
  return `${point.x} ${point.y}`;
}

function validPoints(points: readonly ClientPoint[]): boolean {
  return Array.isArray(points) && points.every((point) =>
    point !== null && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function samePoint(left: ClientPoint, right: ClientPoint): boolean {
  return left.x === right.x && left.y === right.y;
}
