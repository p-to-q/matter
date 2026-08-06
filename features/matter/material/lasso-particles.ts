import type { ClientPoint } from "./lasso-geometry";

export type LassoParticle = Readonly<{
  x: number;
  y: number;
  size: number;
  tone: "light" | "muted";
}>;

export type ClientBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

const MAX_PARTICLES = 72;

/** A sparse render-only echo for the part of a lasso stroke outside the paper. */
export function projectOutsideLassoParticles(
  points: readonly ClientPoint[],
  paper: ClientBounds,
): readonly LassoParticle[] {
  const particles: LassoParticle[] = [];
  for (let index = 0; index < points.length && particles.length < MAX_PARTICLES; index += 2) {
    const point = points[index]!;
    if (contains(paper, point)) continue;
    const distance = distanceFromBounds(paper, point);
    const size = distance > 56 ? 4 : distance > 18 ? 3 : 2;
    const direction = index % 4 < 2 ? -1 : 1;
    particles.push(Object.freeze({
      x: point.x + direction * (3 + index % 7),
      y: point.y + ((index * 5) % 9) - 4,
      size,
      tone: index % 3 === 0 ? "light" : "muted",
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
