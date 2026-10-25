export type ClientRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export type NodeHandlePosition = Readonly<{
  left: number;
  top: number;
  relation: "corner" | "detached";
  /**
   * The addressed first-line corner in carrier-local CSS pixels. Paper-edge
   * clamping may place it just outside the interactive carrier but still within
   * the fog's non-interactive visual outset.
   */
  materialCorner: Readonly<{ x: number; y: number }> | null;
}>;

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
  coarse: boolean;
}>;

/**
 * The corner action button boxes intentionally contact the first line by this
 * many screen pixels. Decorative fog paints behind material; detached controls
 * and every chrome collision remain clear of their complete carrier.
 */
export const CORNER_ACTION_OVERLAP = 6;

export function projectNodeHandleMetrics(input: MetricsInput): NodeHandleMetrics {
  // These are screen-space instruments, not material ink. Depth, camera zoom
  // and paint-only selection must never change their addressable footprint.
  return Object.freeze({
    button: input.coarse ? 48 : 44,
    gap: 6,
    paddingX: 12,
    paddingY: 11,
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
 * A local action may disappear when its material has no safe adjacent space.
 * Clamping beyond the deliberate corner contact would turn a layout edge case
 * into an accidental material action.
 *
 * The preferred position keeps the passage's first-line horizontal anchor with
 * bounded button-box contact. Every fallback stays clear of material entirely;
 * the separate decorative fog always paints behind it.
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

  const cornerOverlap = paddingY + CORNER_ACTION_OVERLAP;
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
    { left: cornerLeft, top: cornerTop, clearance: cornerOverlap, relation: "corner" as const },
    { left: cornerLeft, top: aboveTop, clearance: 0, relation: "detached" as const },
    { left: rightAlignedLeft, top: aboveTop, clearance: 0, relation: "detached" as const },
    { left: cornerLeft, top: belowTop, clearance: 0, relation: "detached" as const },
    { left: rightAlignedLeft, top: belowTop, clearance: 0, relation: "detached" as const },
    { left: input.textRect.left - width - 14, top: sideTop, clearance: 0, relation: "detached" as const },
    { left: input.textRect.right + 14, top: sideTop, clearance: 0, relation: "detached" as const },
  ];

  for (const candidate of candidates) {
    const rect = rectangle(candidate.left, candidate.top, width, height);
    // Only the corner may contact material. Chrome always tests the complete
    // carrier, and every detached candidate has zero overlap allowance.
    const materialClearRect = rectangle(candidate.left, candidate.top, width, height - candidate.clearance);
    if (
      candidate.left >= minimumLeft &&
      candidate.left <= maximumLeft &&
      candidate.top >= minimumTop &&
      candidate.top <= maximumTop &&
      !intersects(input.textRect, materialClearRect) &&
      !intersectsNullable(input.railRect, rect) &&
      !intersectsNullable(input.guidanceRect, rect)
    ) {
      const left = Math.round(candidate.left);
      const top = Math.round(candidate.top);
      return Object.freeze({
        left,
        top,
        relation: candidate.relation,
        materialCorner: candidate.relation === "corner"
          ? Object.freeze({
              x: Math.round(input.textRect.left - left),
              y: Math.round(input.textRect.top - top),
            })
          : null,
      });
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
