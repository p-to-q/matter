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
  maxWidth: number;
  top: number;
}>;

const MINIMUM_POINT_TALK_SCALE = .74;
const MAXIMUM_POINT_TALK_SCALE = 1.1;
const POINT_TALK_SHRINK_RESPONSE = .65;
const POINT_TALK_GROW_RESPONSE = .14;
const MINIMUM_USABLE_POINT_TALK_WIDTH = 160;

/**
 * Point-and-Talk belongs to the material being addressed, so it follows the
 * canvas zoom without inheriting its literal presentation scale.
 */
export function projectPointTalkScale(canvasZoom: number): number {
  if (!Number.isFinite(canvasZoom) || canvasZoom <= 0) return 1;
  const delta = canvasZoom - 1;
  const response = delta < 0
    ? POINT_TALK_SHRINK_RESPONSE
    : POINT_TALK_GROW_RESPONSE;
  return Math.round(clamp(
    1 + delta * response,
    MINIMUM_POINT_TALK_SCALE,
    MAXIMUM_POINT_TALK_SCALE,
  ) * 1_000) / 1_000;
}

/** Intersects visual, clipped-paper, and translated-material boundaries. */
export function intersectPointTalkBounds(
  ...bounds: readonly PointTalkBounds[]
): PointTalkBounds | null {
  if (bounds.length === 0 || bounds.some((bound) =>
    [bound.left, bound.top, bound.right, bound.bottom].some((value) => !Number.isFinite(value)) ||
    bound.right <= bound.left ||
    bound.bottom <= bound.top
  )) return null;
  const intersection = Object.freeze({
    left: Math.max(...bounds.map((bound) => bound.left)),
    top: Math.max(...bounds.map((bound) => bound.top)),
    right: Math.min(...bounds.map((bound) => bound.right)),
    bottom: Math.min(...bounds.map((bound) => bound.bottom)),
  });
  return intersection.right > intersection.left && intersection.bottom > intersection.top
    ? intersection
    : null;
}

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

  const gap = finiteNonNegative(input.gap, 14);
  const inset = finiteNonNegative(input.inset, 12);
  const minimumLeft = viewport.left + inset;
  const maxWidth = Math.max(1, viewport.right - viewport.left - inset * 2);
  if (maxWidth < MINIMUM_USABLE_POINT_TALK_WIDTH) return null;
  const effectiveWidth = Math.min(bubble.width, maxWidth);
  const maximumLeft = Math.max(minimumLeft, viewport.right - effectiveWidth - inset);
  const minimumTop = viewport.top + inset;
  const maximumTop = Math.max(minimumTop, viewport.bottom - bubble.height - inset);
  const above = target.top - bubble.height - gap;
  const below = target.bottom + gap;

  return Object.freeze({
    left: clamp(target.left, minimumLeft, maximumLeft),
    maxWidth,
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
