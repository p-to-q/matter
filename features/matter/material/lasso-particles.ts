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
  cornerRadius = 0,
): readonly LassoParticle[] {
  const particles: LassoParticle[] = [];
  const last = points.length - 1;
  // The denominator is never zero, so a stroke of one point is full weight
  // rather than a division by nothing.
  const head = Math.max(last, 1);
  // Walk back from the pointer. A long stroke is bounded by dropping its tail,
  // never its head: the marks under the hand are the ones a person is watching,
  // and capping from the start would leave only the faint end of the trail.
  for (let index = last; index >= 0 && particles.length < MAX_PARTICLES; index -= 2) {
    const point = points[index]!;
    if (contains(paper, point, cornerRadius)) continue;
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
  return Object.freeze(particles.reverse());
}

/**
 * Containment follows the paper's rounded outline, not its bounding box. The
 * ink is clipped to that same outline, so a corner cutout would otherwise show
 * neither the line nor its echo.
 */
function contains(bounds: ClientBounds, point: ClientPoint, cornerRadius: number): boolean {
  if (
    point.x < bounds.left || point.x > bounds.right ||
    point.y < bounds.top || point.y > bounds.bottom
  ) return false;
  const radius = Math.min(
    Math.max(cornerRadius, 0),
    (bounds.right - bounds.left) / 2,
    (bounds.bottom - bounds.top) / 2,
  );
  if (radius === 0) return true;
  const centreX = Math.min(Math.max(point.x, bounds.left + radius), bounds.right - radius);
  const centreY = Math.min(Math.max(point.y, bounds.top + radius), bounds.bottom - radius);
  return Math.hypot(point.x - centreX, point.y - centreY) <= radius;
}

function distanceFromBounds(bounds: ClientBounds, point: ClientPoint): number {
  const x = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const y = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  return Math.hypot(x, y);
}
