import type { StretchHandle } from "../runtime/stretch-interaction";
import {
  createProjectedLayoutReceipt,
  projectMaterialAddress,
  type MaterialAddressProjection,
  type ProjectedLayoutBasis,
  type ProjectedLayoutReceipt,
} from "./projected-layout-receipt";

export type ElasticPreviewRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ElasticPreviewBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type ElasticPreviewLine = Readonly<{ x1: number; x2: number; y: number }>;
export type ElasticPreviewViewport = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type ElasticPreviewMode = "neutral" | "expand";

export type ProjectedElasticLayoutReceipt = Readonly<{
  receipt: ProjectedLayoutReceipt;
  sourceReceipt: ProjectedLayoutReceipt;
}>;

/**
 * Stable, measured selection geometry. Pointer movement changes only degree;
 * it must not repeatedly clone and line-group DOM Range fragments.
 */
export type ElasticPreviewSource = Readonly<{
  fragments: readonly ElasticPreviewRect[];
  sourceBounds: ElasticPreviewBounds;
  textColumn: ElasticPreviewBounds | null;
  layoutReceipt: ProjectedLayoutReceipt;
}>;

export type ElasticPreview = Readonly<{
  mode: "neutral" | "expand";
  amount: number;
  activeHandle: StretchHandle | null;
  lastHandle: StretchHandle | null;
  fragments: readonly ElasticPreviewRect[];
  sourceBounds: ElasticPreviewBounds;
  addressProjection: MaterialAddressProjection;
  pocket: ElasticPreviewBounds;
  topHandle: ElasticPreviewLine;
  bottomHandle: ElasticPreviewLine;
  handleViewportInset: number;
  pocketDepth: number;
  maximumDepth: number;
}>;

export const ELASTIC_PREVIEW_METRICS = Object.freeze({
  minimumPocketWidth: 48,
  maximumExpansionDepth: 144,
  viewportEdgeInset: 8,
  handleHalfWidth: 26,
  // These conservative values cover the complete fine/coarse CSS targets and
  // their focus clearance, not only the visible two-pixel cue.
  handleOutwardExtent: 49,
  coarseHandleOutwardExtent: 53,
  minimumHandleSeparation: 12,
  minimumCueWidth: 32,
  maximumCueWidth: 96,
});

/**
 * Projects one non-negative degree through two mirrored physical grips. Range
 * fragments are copied exactly. The upper grip remains the fixed seam while
 * the selected language moves down; the lower grip follows the suffix it
 * pushes. Pointer direction is owned by the stretch reducer.
 */
export function elasticPreviewGeometry(
  rects: readonly ElasticPreviewRect[],
  amount: number,
  viewport?: ElasticPreviewViewport,
  textColumn?: ElasticPreviewBounds,
  activeHandle: StretchHandle | null = null,
  lastHandle: StretchHandle | null = null,
  coarsePointer = false,
): ElasticPreview | null {
  if (
    !Array.isArray(rects) || rects.length === 0 || !Number.isFinite(amount) ||
    rects.some((rect) => !isFiniteNonEmptyRect(rect)) ||
    (viewport !== undefined && !isFiniteBounds(viewport)) ||
    (textColumn !== undefined && !isFiniteBounds(textColumn)) ||
    !isOptionalHandle(activeHandle) || !isOptionalHandle(lastHandle)
  ) return null;

  const source = prepareElasticPreviewSource(rects, textColumn);
  return source === null
    ? null
    : projectElasticPreview(source, amount, viewport, activeHandle, lastHandle, coarsePointer);
}

/** Prepares selection-dependent geometry once per DOM measurement epoch. */
export function prepareElasticPreviewSource(
  rects: readonly ElasticPreviewRect[],
  textColumn?: ElasticPreviewBounds,
  basis: ProjectedLayoutBasis = PREVIEW_BASIS,
  textDirection: string = "ltr",
  writingMode: string = "horizontal-tb",
): ElasticPreviewSource | null {
  if (
    !Array.isArray(rects) || rects.length === 0 ||
    rects.some((rect) => !isFiniteNonEmptyRect(rect)) ||
    (textColumn !== undefined && !isFiniteBounds(textColumn))
  ) return null;

  const fragments = Object.freeze(rects.map(ownRect));
  const sourceBounds = unionBounds(fragments);
  const column = textColumn ?? sourceBounds;
  const layoutReceipt = createProjectedLayoutReceipt({
    basis,
    column,
    rects: fragments,
    textDirection,
    writingMode,
  });
  if (layoutReceipt === null) return null;
  return Object.freeze({
    fragments,
    sourceBounds,
    textColumn: textColumn === undefined ? null : Object.freeze({ ...textColumn }),
    layoutReceipt,
  });
}

/**
 * Chooses the only receipt that describes the DOM currently on screen.
 * Neutral material may use the natural Range receipt. Once a partition has
 * reflowed, missing or wrong-partition geometry fails closed instead of
 * painting the old range over a different text layout.
 */
export function resolveElasticLayoutReceipt(input: Readonly<{
  handle: StretchHandle | null;
  mode: ElasticPreviewMode;
  projected: ProjectedElasticLayoutReceipt | null;
  source: ElasticPreviewSource | null;
}>): ProjectedLayoutReceipt | null {
  if (input.source === null) return null;
  if (input.mode === "neutral") return input.source.layoutReceipt;
  if (
    input.projected === null || input.handle === null ||
    input.projected.sourceReceipt !== input.source.layoutReceipt
  ) return null;
  const expectedPartition = `projected-${input.handle}`;
  return receiptMatchesProjection(
    input.source.layoutReceipt.basis,
    input.projected.receipt.basis,
    expectedPartition,
  ) ? input.projected.receipt : null;
}

/** Projects cheap degree-dependent geometry from a prepared measured source. */
export function projectElasticPreview(
  source: ElasticPreviewSource,
  amount: number,
  viewport?: ElasticPreviewViewport,
  activeHandle: StretchHandle | null = null,
  lastHandle: StretchHandle | null = null,
  coarsePointer = false,
  layoutReceipt: ProjectedLayoutReceipt = source.layoutReceipt,
): ElasticPreview | null {
  if (
    !Number.isFinite(amount) ||
    (viewport !== undefined && !isFiniteBounds(viewport)) ||
    !isOptionalHandle(activeHandle) || !isOptionalHandle(lastHandle)
  ) return null;

  const { fragments, sourceBounds } = source;
  const firstAddressedRow = Math.max(
    0,
    Math.min(layoutReceipt.run.startRow, layoutReceipt.rows.length - 1),
  );
  const lastAddressedRow = Math.max(
    firstAddressedRow,
    Math.min(layoutReceipt.run.endRow, layoutReceipt.rows.length - 1),
  );
  const topReceiptRow = layoutReceipt.rows[firstAddressedRow];
  const bottomReceiptRow = layoutReceipt.rows[lastAddressedRow];
  if (topReceiptRow === undefined || bottomReceiptRow === undefined) return null;
  const normalizedAmount = roundClientValue(clamp(amount, 0, 1));
  const topLine = receiptRowBounds(topReceiptRow);
  const bottomLine = receiptRowBounds(bottomReceiptRow);
  const topBase = topLine.top - layoutReceipt.metrics.blockOutset;
  const bottomBase = bottomLine.bottom + layoutReceipt.metrics.blockOutset;
  const handleViewportInset = coarsePointer
    ? ELASTIC_PREVIEW_METRICS.coarseHandleOutwardExtent
    : ELASTIC_PREVIEW_METRICS.handleOutwardExtent;
  // The person's degree is material intent, not available screen space. A
  // viewport edge may clamp the fixed control, but it must never shorten the
  // language slot that is later sent to the agent.
  const maximumDepth = ELASTIC_PREVIEW_METRICS.maximumExpansionDepth;
  const pocketDepth = roundClientValue(normalizedAmount * maximumDepth);
  const movingHandle = activeHandle ?? lastHandle ?? "bottom";

  const topCenter = clampHandleX((topLine.left + topLine.right) / 2, viewport);
  const bottomCenter = clampHandleX((bottomLine.left + bottomLine.right) / 2, viewport);
  const unclampedTopY = clampHandleY(
    topBase,
    viewport,
    handleViewportInset,
  );
  const unclampedBottomY = clampHandleY(
    bottomBase + pocketDepth,
    viewport,
    handleViewportInset,
  );
  const { top: topY, bottom: bottomY } = separateHandleYs(
    unclampedTopY,
    unclampedBottomY,
    viewport,
    handleViewportInset,
  );
  const topHandle = cueAt(topCenter, topY);
  const bottomHandle = cueAt(bottomCenter, bottomY);
  const horizontal = pocketHorizontalBounds(
    source.textColumn ?? sourceBounds,
    layoutReceipt.metrics.inlineOutset,
    viewport,
  );
  if (horizontal === null) return null;
  const pocketTop = movingHandle === "top" ? topBase : bottomBase;
  const pocket = Object.freeze({
    left: horizontal.left,
    top: pocketTop,
    right: horizontal.right,
    bottom: pocketTop + pocketDepth,
  });
  const addressProjection = projectMaterialAddress({
    amount: normalizedAmount,
    handle: normalizedAmount === 0 ? null : movingHandle,
    maximumDepth,
    receipt: layoutReceipt,
  });
  if (addressProjection === null) return null;
  return Object.freeze({
    mode: normalizedAmount === 0 ? "neutral" : "expand",
    amount: normalizedAmount,
    activeHandle,
    lastHandle,
    fragments,
    sourceBounds,
    addressProjection,
    pocket,
    topHandle,
    bottomHandle,
    handleViewportInset,
    pocketDepth,
    maximumDepth,
  });
}

function receiptMatchesProjection(
  expected: ProjectedLayoutBasis,
  actual: ProjectedLayoutBasis,
  expectedPartition: string,
): boolean {
  return expected.addressKey === actual.addressKey &&
    expected.documentEpoch === actual.documentEpoch &&
    expected.layoutEpoch === actual.layoutEpoch &&
    expected.nodeId === actual.nodeId &&
    expected.treeId === actual.treeId &&
    expected.viewportKey === actual.viewportKey &&
    actual.partitionKey === expectedPartition;
}

function receiptRowBounds(
  row: ProjectedLayoutReceipt["rows"][number],
): ElasticPreviewBounds {
  return Object.freeze({
    bottom: row.blockEnd,
    left: row.inlineStart,
    right: row.inlineEnd,
    top: row.blockStart,
  });
}

const PREVIEW_BASIS: ProjectedLayoutBasis = Object.freeze({
  addressKey: "elastic-preview",
  documentEpoch: 0,
  layoutEpoch: 0,
  nodeId: "elastic-preview",
  partitionKey: "selection",
  treeId: "elastic-preview",
  viewportKey: "preview",
});

function cueAt(center: number, y: number): ElasticPreviewLine {
  return Object.freeze({ x1: center - 11, x2: center + 11, y });
}

function clampHandleX(x: number, viewport: ElasticPreviewViewport | undefined): number {
  if (viewport === undefined) return roundClientValue(x);
  return roundClientValue(clamp(
    x,
    viewport.left + ELASTIC_PREVIEW_METRICS.handleHalfWidth,
    viewport.right - ELASTIC_PREVIEW_METRICS.handleHalfWidth,
  ));
}

function clampHandleY(
  y: number,
  viewport: ElasticPreviewViewport | undefined,
  handleViewportInset: number,
): number {
  if (viewport === undefined) return roundClientValue(y);
  const minimum = viewport.top + handleViewportInset;
  const maximum = viewport.bottom - handleViewportInset;
  if (minimum > maximum) return roundClientValue((viewport.top + viewport.bottom) / 2);
  return roundClientValue(clamp(
    y,
    minimum,
    maximum,
  ));
}

/** Keeps the two literal controls separately discoverable after edge clamping. */
function separateHandleYs(
  top: number,
  bottom: number,
  viewport: ElasticPreviewViewport | undefined,
  handleViewportInset: number,
): Readonly<{ top: number; bottom: number }> {
  if (bottom - top >= ELASTIC_PREVIEW_METRICS.minimumHandleSeparation) {
    return Object.freeze({ top, bottom });
  }
  if (viewport === undefined) {
    return Object.freeze({
      top,
      bottom: roundClientValue(top + ELASTIC_PREVIEW_METRICS.minimumHandleSeparation),
    });
  }

  const minimum = viewport.top + handleViewportInset;
  const maximum = viewport.bottom - handleViewportInset;
  if (minimum > maximum) {
    const midpoint = roundClientValue((viewport.top + viewport.bottom) / 2);
    return Object.freeze({ top: midpoint, bottom: midpoint });
  }
  const available = Math.max(0, maximum - minimum);
  const separation = Math.min(ELASTIC_PREVIEW_METRICS.minimumHandleSeparation, available);
  const midpoint = clamp((top + bottom) / 2, minimum + separation / 2, maximum - separation / 2);
  return Object.freeze({
    top: roundClientValue(midpoint - separation / 2),
    bottom: roundClientValue(midpoint + separation / 2),
  });
}

function pocketHorizontalBounds(
  bounds: ElasticPreviewBounds,
  inlineOutset: number,
  viewport: ElasticPreviewViewport | undefined,
): Readonly<{ left: number; right: number }> | null {
  const center = (bounds.left + bounds.right) / 2;
  const width = Math.max(
    ELASTIC_PREVIEW_METRICS.minimumPocketWidth,
    bounds.right - bounds.left + inlineOutset * 2,
  );
  const minimum = viewport?.left === undefined ? Number.NEGATIVE_INFINITY : viewport.left + ELASTIC_PREVIEW_METRICS.viewportEdgeInset;
  const maximum = viewport?.right === undefined ? Number.POSITIVE_INFINITY : viewport.right - ELASTIC_PREVIEW_METRICS.viewportEdgeInset;
  const left = Math.max(minimum, center - width / 2);
  const right = Math.min(maximum, center + width / 2);
  return right > left ? Object.freeze({ left: roundClientValue(left), right: roundClientValue(right) }) : null;
}

function rectBounds(rect: ElasticPreviewRect): ElasticPreviewBounds {
  return { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
}

function unionBounds(rects: readonly ElasticPreviewRect[]): ElasticPreviewBounds {
  const first = rectBounds(rects[0]!);
  const result = { ...first };
  for (const rect of rects.slice(1)) {
    const bounds = rectBounds(rect);
    result.left = Math.min(result.left, bounds.left);
    result.top = Math.min(result.top, bounds.top);
    result.right = Math.max(result.right, bounds.right);
    result.bottom = Math.max(result.bottom, bounds.bottom);
  }
  return Object.freeze(result);
}

function ownRect(rect: ElasticPreviewRect): ElasticPreviewRect {
  return Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}

function isFiniteNonEmptyRect(rect: ElasticPreviewRect): boolean {
  return rect !== null && typeof rect === "object" &&
    Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0;
}

function isFiniteBounds(bounds: ElasticPreviewBounds): boolean {
  return bounds !== null && typeof bounds === "object" &&
    Number.isFinite(bounds.left) && Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom) &&
    bounds.right > bounds.left && bounds.bottom > bounds.top;
}

function isOptionalHandle(value: StretchHandle | null): boolean {
  return value === null || value === "top" || value === "bottom";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundClientValue(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
