import type { StretchHandle } from "../runtime/stretch-interaction";

export type LanguageFlowProjection = Readonly<{
  selectedTop: number;
  slotTop: number;
  afterTop: number;
  topExtent: 0;
  bottomExtent: number;
  presentationHeight: number;
}>;

export type SelectionLocalLaneProjection = Readonly<{
  controlTop: number;
  travelingControlTop: number;
  laneBottom: number;
  afterTop: number;
  slotDepth: number;
}>;

/**
 * Reserves one transient lane between an addressed passage and its suffix.
 * Fixed controls (the amount rail or one rewrite surface) and controls that
 * travel with a degree share this projection instead of covering material.
 * All values use the same client-space coordinate system.
 */
export function projectSelectionLocalLane(input: Readonly<{
  selectedBottom: number;
  afterNaturalTop: number;
  beforeGap: number;
  afterGap: number;
  contentDepth: number;
  fixedControlDepth: number;
  travelingControlDepth: number;
}>): SelectionLocalLaneProjection | null {
  if (
    !isNonNegative(input.selectedBottom) ||
    !isNonNegative(input.afterNaturalTop) ||
    !isNonNegative(input.beforeGap) ||
    !isNonNegative(input.afterGap) ||
    !isNonNegative(input.contentDepth) ||
    !isNonNegative(input.fixedControlDepth) ||
    !isNonNegative(input.travelingControlDepth)
  ) return null;

  const controlTop = input.selectedBottom + input.beforeGap;
  const travelingControlTop = controlTop + input.contentDepth;
  const laneBottom = Math.max(
    controlTop + input.fixedControlDepth,
    travelingControlTop + input.travelingControlDepth,
  );
  const afterTop = Math.max(input.afterNaturalTop, laneBottom + input.afterGap);
  return ownLane({
    controlTop,
    travelingControlTop,
    laneBottom,
    afterTop,
    slotDepth: afterTop - input.afterNaturalTop,
  });
}

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

function ownLane(value: SelectionLocalLaneProjection): SelectionLocalLaneProjection {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, number]) => [key, round(number)]),
  ) as unknown as SelectionLocalLaneProjection);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
