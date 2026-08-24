export type PointTalkBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type PointTalkSize = Readonly<{
  width: number;
  height: number;
}>;

export type PointTalkPlacement = Readonly<{
  left: number;
  top: number;
}>;

/**
 * Projects viewport-fixed UI from measured client geometry. DOM ownership
 * stays at the rendering edge; this policy remains deterministic and testable.
 */
export function projectPointTalkPlacement(input: Readonly<{
  target: PointTalkBounds;
  bubble: PointTalkSize;
  viewport: PointTalkBounds;
  gap?: number;
  inset?: number;
}>): PointTalkPlacement | null {
  const { bubble, target, viewport } = input;
  const values = [
    bubble.width,
    bubble.height,
    target.left,
    target.top,
    target.right,
    target.bottom,
    viewport.left,
    viewport.top,
    viewport.right,
    viewport.bottom,
  ];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    bubble.width <= 0 ||
    bubble.height <= 0 ||
    target.right < target.left ||
    target.bottom < target.top ||
    viewport.right <= viewport.left ||
    viewport.bottom <= viewport.top
  ) return null;

  const gap = finiteNonNegative(input.gap, 8);
  const inset = finiteNonNegative(input.inset, 12);
  const minimumLeft = viewport.left + inset;
  const maximumLeft = Math.max(minimumLeft, viewport.right - bubble.width - inset);
  const minimumTop = viewport.top + inset;
  const maximumTop = Math.max(minimumTop, viewport.bottom - bubble.height - inset);
  const above = target.top - bubble.height - gap;
  const below = target.bottom + gap;

  return Object.freeze({
    left: clamp(target.left, minimumLeft, maximumLeft),
    top: above >= minimumTop
      ? above
      : clamp(below, minimumTop, maximumTop),
  });
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
