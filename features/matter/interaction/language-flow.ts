import type { StretchHandle } from "../runtime/stretch-interaction";

export type LanguageFlowProjection = Readonly<{
  beforeTop: number;
  selectedTop: number;
  slotTop: number;
  afterTop: number;
  topExtent: number;
  bottomExtent: number;
  presentationHeight: number;
}>;

/**
 * Opens one downward-growing slot on the boundary named by the grip. The upper
 * boundary keeps the prefix fixed and pushes the selected language plus suffix
 * down; the lower boundary keeps selected language fixed and pushes the suffix.
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
    (input.handle !== "top" && input.handle !== "bottom")
  ) return null;

  if (input.handle === "top") {
    return own({
      beforeTop: 0,
      selectedTop: input.selectedTop + input.slotDepth,
      slotTop: input.selectedTop,
      afterTop: input.afterNaturalTop + input.slotDepth,
      topExtent: 0,
      bottomExtent: input.slotDepth,
      presentationHeight: input.sourceHeight + input.slotDepth,
    });
  }

  const afterTop = input.afterNaturalTop + input.slotDepth;
  const projectedBottom = afterTop + input.afterHeight;
  const bottomExtent = Math.max(0, projectedBottom - input.sourceHeight);
  return own({
    beforeTop: 0,
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
