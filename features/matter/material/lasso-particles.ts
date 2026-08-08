import type { ClientPoint } from "./lasso-geometry";

export type LassoParticle = Readonly<{
  x: number;
  y: number;
  size: number;
  /** Two weights of the same field ink, so the echo has grain rather than one flat grey. */
  tone: "ink" | "soft";
  /** Trail weight in `(0, 1]`: full at the pointer, faint at the stroke's tail. */
  opacity: number;
}>;

export type ClientBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

const MAX_PARTICLES = 72;
const MIN_TRAIL_OPACITY = 0.16;

/**
 * A sparse render-only echo for the part of a lasso stroke outside the paper.
 *
 * Off the paper there is no ink, so this is the whole of what a person sees
 * there: square marks, brightest under the pointer and fading back along the
 * stroke. Coordinates are whole client pixels because a square drawn on a half
 * pixel is a grey smudge rather than a mark.
 */
export function projectOutsideLassoParticles(
  points: readonly ClientPoint[],
  paper: ClientBounds,
): readonly LassoParticle[] {
  const particles: LassoParticle[] = [];
  const head = Math.max(points.length - 1, 1);
  for (let index = 0; index < points.length && particles.length < MAX_PARTICLES; index += 2) {
    const point = points[index]!;
    if (contains(paper, point)) continue;
    const distance = distanceFromBounds(paper, point);
    const size = distance > 56 ? 4 : distance > 18 ? 3 : 2;
    const direction = index % 4 < 2 ? -1 : 1;
    // Age is measured along the stroke, not in time, so the trail is the same
    // shape whether a hand moved quickly or slowly through the same path.
    const recency = index / head;
    particles.push(Object.freeze({
      x: Math.round(point.x + direction * (3 + index % 7)),
      y: Math.round(point.y + ((index * 5) % 9) - 4),
      size,
      tone: index % 3 === 0 ? "ink" : "soft",
      opacity: Number((MIN_TRAIL_OPACITY + (1 - MIN_TRAIL_OPACITY) * recency ** 1.6).toFixed(3)),
    }));
  }
  return Object.freeze(particles);
}

function contains(bounds: ClientBounds, point: ClientPoint): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function distanceFromBounds(bounds: ClientBounds, point: ClientPoint): number {
  const x = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const y = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  return Math.hypot(x, y);
}
