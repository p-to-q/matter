export const SLOT_BUDGET_LIMITS = Object.freeze({
  minimumTargetLines: 1,
  maximumTargetLines: 64,
  hysteresisLines: 0.15,
  maximumLineHeightPixels: 512,
});

export type SlotBudgetMode = "neutral" | "expand";

export type SlotBudget = Readonly<{
  mode: SlotBudgetMode;
  sourceLines: number;
  targetLines: number;
  lineDelta: number;
  /** Extra flow below the unchanged source. Expansion never creates negative space. */
  flowSlotPixels: number;
  /** The viewport-clipped preview; it never changes targetLines. */
  visibleSlotPixels: number;
  viewportClipped: boolean;
}>;

export type SlotBudgetInput = Readonly<{
  deltaPixels: number;
  lineHeightPixels: number;
  sourceLines: number;
  previousTargetLines: number;
  availableViewportPixels?: number;
}>;

/**
 * Turns client-pixel travel into a stable integer language budget. Both travel
 * and line height must use the same client coordinate space, so their ratio is
 * invariant under canvas zoom. Viewport clipping affects only presentation.
 */
export function slotBudgetFromPixels(input: SlotBudgetInput): SlotBudget | null {
  if (!isSlotBudgetInput(input)) return null;

  const rawTarget = input.sourceLines + input.deltaPixels / input.lineHeightPixels;
  const targetLines = quantizeWithHysteresis(
    rawTarget,
    input.previousTargetLines,
    input.sourceLines,
  );
  return slotBudgetFromTargetLines({
    sourceLines: input.sourceLines,
    targetLines,
    lineHeightPixels: input.lineHeightPixels,
    availableViewportPixels: input.availableViewportPixels,
  });
}

export function slotBudgetFromTargetLines(input: Readonly<{
  sourceLines: number;
  targetLines: number;
  lineHeightPixels: number;
  availableViewportPixels?: number;
}>): SlotBudget | null {
  if (
    !isTargetLines(input.sourceLines) ||
    !isTargetLines(input.targetLines) ||
    !isLineHeight(input.lineHeightPixels) ||
    !isAvailablePixels(input.availableViewportPixels) ||
    input.targetLines < input.sourceLines
  ) {
    return null;
  }

  const lineDelta = input.targetLines - input.sourceLines;
  const flowSlotPixels = roundClientPixels(
    Math.max(0, lineDelta) * input.lineHeightPixels,
  );
  const visibleSlotPixels = input.availableViewportPixels === undefined
    ? flowSlotPixels
    : roundClientPixels(Math.min(flowSlotPixels, input.availableViewportPixels));

  return Object.freeze({
    mode: lineDelta > 0 ? "expand" : "neutral",
    sourceLines: input.sourceLines,
    targetLines: input.targetLines,
    lineDelta,
    flowSlotPixels,
    visibleSlotPixels,
    viewportClipped: visibleSlotPixels < flowSlotPixels,
  });
}

/** Strict boundary parser for a future versioned envelope or settled receipt. */
export function parseTargetLines(value: unknown): number | null {
  return isTargetLines(value) ? value : null;
}

function quantizeWithHysteresis(
  rawTarget: number,
  previousTarget: number,
  sourceLines: number,
): number {
  const boundedRaw = clamp(
    rawTarget,
    sourceLines,
    SLOT_BUDGET_LIMITS.maximumTargetLines,
  );
  const retentionRadius = 0.5 + SLOT_BUDGET_LIMITS.hysteresisLines;
  if (Math.abs(boundedRaw - previousTarget) < retentionRadius) {
    return previousTarget;
  }
  return clampInteger(Math.round(boundedRaw));
}

function isSlotBudgetInput(input: SlotBudgetInput): boolean {
  return (
    input !== null &&
    typeof input === "object" &&
    Number.isFinite(input.deltaPixels) &&
    isLineHeight(input.lineHeightPixels) &&
    isTargetLines(input.sourceLines) &&
    isTargetLines(input.previousTargetLines) &&
    isAvailablePixels(input.availableViewportPixels)
  );
}

function isTargetLines(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= SLOT_BUDGET_LIMITS.minimumTargetLines &&
    (value as number) <= SLOT_BUDGET_LIMITS.maximumTargetLines
  );
}

function isLineHeight(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    value <= SLOT_BUDGET_LIMITS.maximumLineHeightPixels
  );
}

function isAvailablePixels(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function clampInteger(value: number): number {
  return clamp(
    value,
    SLOT_BUDGET_LIMITS.minimumTargetLines,
    SLOT_BUDGET_LIMITS.maximumTargetLines,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundClientPixels(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
