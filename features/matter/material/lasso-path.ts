import { sampleLassoPath, type ClientPoint } from "./lasso-geometry";

export type LassoRenderPaths = Readonly<{
  /** The exact bounded polyline also consumed by semantic hit testing. */
  ink: string;
  /** The exact straight seam used to close the semantic polygon on pointer-up. */
  closure: string;
}>;

export function lassoRenderPaths(points: readonly ClientPoint[]): LassoRenderPaths {
  const sampled = sampleLassoPath(points);
  if (sampled === null || sampled.length === 0) {
    return Object.freeze({ ink: "", closure: "" });
  }
  const open = samePoint(sampled[0]!, sampled.at(-1)!)
    ? sampled.slice(0, -1)
    : [...sampled];
  if (open.length === 0) return Object.freeze({ ink: "", closure: "" });
  if (open.length === 1) return Object.freeze({ ink: move(open[0]!), closure: "" });

  let ink = move(open[0]!);
  for (let index = 1; index < open.length; index += 1) {
    const current = open[index]!;
    ink += ` L ${coordinate(current)}`;
  }
  const closure = open.length < 3 ? "" : `${move(open.at(-1)!)} L ${coordinate(open[0]!)}`;
  return Object.freeze({ ink, closure });
}

function move(point: ClientPoint): string {
  return `M ${coordinate(point)}`;
}

function coordinate(point: ClientPoint): string {
  return `${point.x} ${point.y}`;
}

function samePoint(left: ClientPoint, right: ClientPoint): boolean {
  return left.x === right.x && left.y === right.y;
}
