export type LanguageFlowProjection = Readonly<{
  bottomExtent: number;
  presentationHeight: number;
  topExtent: number;
}>;

/**
 * Reports how much taller than the canonical paragraph the projected partitions
 * stand once the slot is open.
 *
 * The projection lays witness, slot, and moving partition out in real flow, so
 * it decides its own positions and no longer needs a natural suffix top to
 * reconstruct them. What layout damage still needs is only how tall the
 * partitions are with the slot closed, plus the current depth. The upper
 * boundary stays fixed by construction, so growth is always downward.
 */
export function projectLanguageFlow(input: Readonly<{
  naturalProjectedHeight: number;
  slotDepth: number;
  sourceHeight: number;
}>): LanguageFlowProjection | null {
  if (
    !isNonNegative(input.naturalProjectedHeight) ||
    !isNonNegative(input.slotDepth) ||
    !isNonNegative(input.sourceHeight)
  ) return null;
  const presentationHeight = input.naturalProjectedHeight + input.slotDepth;
  return Object.freeze({
    bottomExtent: Math.max(0, presentationHeight - input.sourceHeight),
    presentationHeight,
    topExtent: 0,
  });
}

function isNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Converts a client-pixel depth into the canvas's own units. Presentation reads
 * client pixels; the tree layout stores world units.
 */
export function clientDepthToWorld(clientPixels: number, viewportZoom: number): number | null {
  return Number.isFinite(clientPixels) && clientPixels >= 0 &&
    Number.isFinite(viewportZoom) && viewportZoom > 0
    ? round(clientPixels / viewportZoom)
    : null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
