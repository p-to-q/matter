export type ClientRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export type NodeHandlePosition = Readonly<{ left: number; top: number }>;

/**
 * One source for the field's box. The placement rule below and the CSS that
 * paints the field both read these numbers, so a tuning change moves both
 * together instead of drifting into two disagreeing truths.
 */
export type NodeHandleMetrics = Readonly<{
  button: number;
  gap: number;
  paddingX: number;
  paddingY: number;
}>;

type MetricsInput = Readonly<{
  /** Measured ink height of the material's first line. */
  inkHeight: number;
  coarse: boolean;
}>;

/**
 * How far the glyphs may rest onto the first line at the corner placement.
 * The fog is translucent and the text stays exact, selectable and copyable
 * underneath, so a bounded descent reads as contact rather than occlusion.
 * It is a number, not an absence of one: every other placement stays clear.
 */
export const CORNER_GLYPH_DESCENT = 6;

/** Ink height of root material, the size the base metrics were drawn for. */
const BASE_INK_HEIGHT = 26;
/**
 * A fine pointer may address a smaller target than a finger. Both floors are
 * accessibility limits, not visual taste: never scale a control under them.
 * The coarse floor is 48 rather than the 44 minimum because the shipped browser
 * receipt already proves 48 for touch, and scaling must not walk that back.
 */
const FINE_POINTER_FLOOR = 32;
const COARSE_POINTER_FLOOR = 48;

export function projectNodeHandleMetrics(input: MetricsInput): NodeHandleMetrics {
  const ratio = Number.isFinite(input.inkHeight) && input.inkHeight > 0
    ? input.inkHeight / BASE_INK_HEIGHT
    : 1;
  const scale = Math.min(1, Math.max(0.7, ratio));
  const floor = input.coarse ? COARSE_POINTER_FLOOR : FINE_POINTER_FLOOR;
  const button = Math.max(floor, Math.round((input.coarse ? 48 : 44) * scale));
  return Object.freeze({
    button,
    gap: Math.max(4, Math.round(6 * scale)),
    paddingX: Math.max(9, Math.round(12 * scale)),
    paddingY: Math.max(8, Math.round(11 * scale)),
  });
}

type Input = Readonly<{
  documentRect: ClientRect;
  guidanceRect: ClientRect | null;
  railRect: ClientRect | null;
  textRect: ClientRect;
  toolCount: number;
  metrics: NodeHandleMetrics;
}>;

/**
 * A local action may disappear when its material has no clear adjacent space.
 * Clamping an overlapping control onto text would turn a layout edge case into
 * an accidental material action.
 *
 * The preferred position sets the field at the passage's upper-left corner,
 * where the fog and a bounded part of the glyphs rest on the first line. Every
 * fallback placement stays clear of material entirely.
 */
export function projectNodeHandlePosition(input: Input): NodeHandlePosition | null {
  if (!Number.isInteger(input.toolCount) || input.toolCount < 1) return null;
  const { button, gap, paddingX, paddingY } = input.metrics;
  const width = input.toolCount * button + Math.max(0, input.toolCount - 1) * gap + paddingX * 2;
  const height = button + paddingY * 2;
  const inset = 12;
  const minimumLeft = input.documentRect.left + inset;
  const maximumLeft = input.documentRect.right - inset - width;
  const minimumTop = input.documentRect.top + inset;
  const guidanceTop = input.guidanceRect === null
    ? input.documentRect.bottom - inset
    : Math.min(input.documentRect.bottom - inset, input.guidanceRect.top - 14);
  const maximumTop = guidanceTop - height;
  if (maximumLeft < minimumLeft || maximumTop < minimumTop) return null;

  // The corner position sets the fog well onto the first line and lets the
  // glyphs descend a bounded distance with it.
  const cornerOverlap = paddingY + CORNER_GLYPH_DESCENT;
  const sideTop = clamp(input.textRect.top - 10, minimumTop, maximumTop);
  const cornerLeft = clamp(
    input.textRect.left - paddingX - Math.round(button * 0.62),
    minimumLeft,
    maximumLeft,
  );
  const rightAlignedLeft = clamp(input.textRect.right - width + 18, minimumLeft, maximumLeft);
  const cornerTop = input.textRect.top - height + cornerOverlap;
  const aboveTop = input.textRect.top - height - 14;
  const belowTop = input.textRect.bottom + 14;
  const candidates = [
    { left: cornerLeft, top: cornerTop, clearance: cornerOverlap },
    { left: cornerLeft, top: aboveTop, clearance: 0 },
    { left: rightAlignedLeft, top: aboveTop, clearance: 0 },
    { left: cornerLeft, top: belowTop, clearance: 0 },
    { left: rightAlignedLeft, top: belowTop, clearance: 0 },
    { left: input.textRect.left - width - 14, top: sideTop, clearance: 0 },
    { left: input.textRect.right + 14, top: sideTop, clearance: 0 },
  ];

  for (const candidate of candidates) {
    const rect = rectangle(candidate.left, candidate.top, width, height);
    // Material is tested against the field minus its authorised descent;
    // chrome is tested against the whole field, because a control must never
    // sit under the rail or the guidance line.
    const glyphRect = rectangle(candidate.left, candidate.top, width, height - candidate.clearance);
    if (
      candidate.left >= minimumLeft &&
      candidate.left <= maximumLeft &&
      candidate.top >= minimumTop &&
      candidate.top <= maximumTop &&
      !intersects(input.textRect, glyphRect) &&
      !intersectsNullable(input.railRect, rect) &&
      !intersectsNullable(input.guidanceRect, rect)
    ) {
      return Object.freeze({ left: Math.round(candidate.left), top: Math.round(candidate.top) });
    }
  }
  return null;
}

function rectangle(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function intersectsNullable(rect: ClientRect | null, candidate: ClientRect): boolean {
  return rect !== null && intersects(rect, candidate);
}

function intersects(left: ClientRect, right: ClientRect): boolean {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
