import type { StretchHandle } from "../runtime/stretch-interaction";

export type LanguageFlowProjection = Readonly<{
  selectedTop: number;
  slotTop: number;
  afterTop: number;
  topExtent: 0;
  bottomExtent: number;
  presentationHeight: number;
}>;

/**
 * Moves only the suffix from its measured source-line origin. The sole lower
 * grip owns the downward slot. All values are node-local world pixels.
 */
export function projectLanguageFlow(input: Readonly<{
  sourceHeight: number;
  selectedTop: number;
  afterNaturalTop: number;
  afterHeight: number;
  slotDepth: number;
  handle: StretchHandle;
}>): LanguageFlowProjection | null {
  if (
    !isNonNegative(input.sourceHeight) ||
    !isNonNegative(input.selectedTop) ||
    !isNonNegative(input.afterNaturalTop) ||
    !isNonNegative(input.afterHeight) ||
    !isNonNegative(input.slotDepth) ||
    input.selectedTop > input.sourceHeight ||
    input.afterNaturalTop > input.sourceHeight ||
    input.afterNaturalTop < input.selectedTop ||
    input.handle !== "bottom"
  ) return null;

  const afterTop = input.afterNaturalTop + input.slotDepth;
  const projectedBottom = afterTop + input.afterHeight;
  const bottomExtent = Math.max(0, projectedBottom - input.sourceHeight);
  return own({
    selectedTop: input.selectedTop,
    slotTop: input.afterNaturalTop,
    afterTop,
    topExtent: 0,
    bottomExtent,
    presentationHeight: input.sourceHeight + bottomExtent,
  });
}

export function clientDepthToWorld(clientPixels: number, viewportZoom: number): number | null {
  return Number.isFinite(clientPixels) && clientPixels >= 0 &&
    Number.isFinite(viewportZoom) && viewportZoom > 0
    ? round(clientPixels / viewportZoom)
    : null;
}

function isNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function own(value: LanguageFlowProjection): LanguageFlowProjection {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, number]) => [key, round(number)]),
  ) as unknown as LanguageFlowProjection);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
