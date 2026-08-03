import type { Point } from "../engine/protocol";

export function clampAnchor(point: Point): Point {
  const margin = window.innerWidth < 720 ? 28 : 72;
  const materialWidth = Math.min(520, window.innerWidth - margin * 2);

  return {
    x: Math.min(
      Math.max(margin, point.x),
      window.innerWidth - materialWidth - margin,
    ),
    y: Math.min(Math.max(90, point.y), window.innerHeight - 190),
  };
}
