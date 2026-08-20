import type { StretchHandle } from "../runtime/stretch-interaction";

export type ElasticPreviewRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ElasticPreviewBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type ElasticPreviewLine = Readonly<{ x1: number; x2: number; y: number }>;
export type ElasticPreviewViewport = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/**
 * Stable, measured selection geometry. Pointer movement changes only degree;
 * it must not repeatedly clone and line-group DOM Range fragments.
 */
export type ElasticPreviewSource = Readonly<{
  fragments: readonly ElasticPreviewRect[];
  visualLines: readonly ElasticPreviewBounds[];
  sourceBounds: ElasticPreviewBounds;
  textColumn: ElasticPreviewBounds | null;
}>;

export type ElasticPreview = Readonly<{
  mode: "neutral" | "expand";
  amount: number;
  activeHandle: StretchHandle | null;
  lastHandle: StretchHandle | null;
  fragments: readonly ElasticPreviewRect[];
  visualLines: readonly ElasticPreviewBounds[];
  sourceBounds: ElasticPreviewBounds;
  pocket: ElasticPreviewBounds;
  topHandle: ElasticPreviewLine;
  /** The upper cue is geometry only; the sole interactive grip is below. */
  topCue: ElasticPreviewLine;
  bottomHandle: ElasticPreviewLine;
  handleViewportInset: number;
  pocketDepth: number;
  maximumDepth: number;
  opacity: number;
}>;

export const ELASTIC_PREVIEW_METRICS = Object.freeze({
  boundaryOutset: 3,
  pocketGap: 4,
  pocketInlineOutset: 10,
  minimumPocketWidth: 48,
  maximumExpansionDepth: 144,
  viewportEdgeInset: 8,
  handleHalfWidth: 26,
  handleOutwardExtent: 44,
  coarseHandleOutwardExtent: 48,
  lineTopTolerance: 1,
  minimumCueWidth: 32,
  maximumCueWidth: 96,
  minimumOpacity: 0.08,
  maximumOpacity: 0.18,
});

/**
 * Projects one downward non-negative degree. Range fragments are copied
 * exactly; grouping only derives the stable lower grip and upper seam cue.
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
): ElasticPreviewSource | null {
  if (
    !Array.isArray(rects) || rects.length === 0 ||
    rects.some((rect) => !isFiniteNonEmptyRect(rect)) ||
    (textColumn !== undefined && !isFiniteBounds(textColumn))
  ) return null;

  const fragments = Object.freeze(rects.map(ownRect));
  const visualLines = groupVisualLines(fragments);
  if (visualLines.length === 0) return null;
  const sourceBounds = unionBounds(fragments);
  return Object.freeze({
    fragments,
    visualLines,
    sourceBounds,
    textColumn: textColumn === undefined ? null : Object.freeze({ ...textColumn }),
  });
}

/** Projects cheap degree-dependent geometry from a prepared measured source. */
export function projectElasticPreview(
  source: ElasticPreviewSource,
  amount: number,
  viewport?: ElasticPreviewViewport,
  activeHandle: StretchHandle | null = null,
  lastHandle: StretchHandle | null = null,
  coarsePointer = false,
): ElasticPreview | null {
  if (
    !Number.isFinite(amount) ||
    (viewport !== undefined && !isFiniteBounds(viewport)) ||
    !isOptionalHandle(activeHandle) || !isOptionalHandle(lastHandle)
  ) return null;

  const { fragments, sourceBounds, visualLines } = source;
  const normalizedAmount = roundClientValue(clamp(amount, 0, 1));
  const topLine = visualLines[0]!;
  const bottomLine = visualLines.at(-1)!;
  const topBase = topLine.top - ELASTIC_PREVIEW_METRICS.boundaryOutset;
  const bottomBase = bottomLine.bottom + ELASTIC_PREVIEW_METRICS.boundaryOutset;
  const handleViewportInset = coarsePointer
    ? ELASTIC_PREVIEW_METRICS.coarseHandleOutwardExtent
    : ELASTIC_PREVIEW_METRICS.handleOutwardExtent;
  // The person's degree is material intent, not available screen space. A
  // viewport edge may clamp the fixed control, but it must never shorten the
  // language slot that is later sent to the agent.
  const maximumDepth = ELASTIC_PREVIEW_METRICS.maximumExpansionDepth;
  const pocketDepth = roundClientValue(normalizedAmount * maximumDepth);

  const topCenter = clampHandleX((topLine.left + topLine.right) / 2, viewport);
  const bottomCenter = clampHandleX((bottomLine.left + bottomLine.right) / 2, viewport);
  const topY = clampHandleY(topBase, viewport, handleViewportInset);
  const bottomY = clampHandleY(
    bottomBase + pocketDepth,
    viewport,
    handleViewportInset,
  );
  const topHandle = cueAt(topCenter, topY);
  const bottomHandle = cueAt(bottomCenter, bottomY);
  const horizontal = pocketHorizontalBounds(source.textColumn ?? sourceBounds, viewport);
  if (horizontal === null) return null;
  const pocket = Object.freeze({
    left: horizontal.left,
    top: bottomLine.top - ELASTIC_PREVIEW_METRICS.boundaryOutset,
    right: horizontal.right,
    bottom: bottomY,
  });
  const opacity = roundClientValue(
    ELASTIC_PREVIEW_METRICS.minimumOpacity + normalizedAmount *
      (ELASTIC_PREVIEW_METRICS.maximumOpacity - ELASTIC_PREVIEW_METRICS.minimumOpacity),
  );

  return Object.freeze({
    mode: normalizedAmount === 0 ? "neutral" : "expand",
    amount: normalizedAmount,
    activeHandle,
    lastHandle,
    fragments,
    visualLines,
    sourceBounds,
    pocket,
    topHandle,
    topCue: topHandle,
    bottomHandle,
    handleViewportInset,
    pocketDepth,
    maximumDepth,
    opacity,
  });
}

function groupVisualLines(rects: readonly ElasticPreviewRect[]): readonly ElasticPreviewBounds[] {
  const ordered = rects.map((rect, index) => ({ rect, index })).sort((left, right) =>
    left.rect.y - right.rect.y || left.index - right.index,
  );
  const lines: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  for (const { rect } of ordered) {
    const bounds = rectBounds(rect);
    const line = lines.find((candidate) => sameVisualLine(candidate, bounds));
    if (line === undefined) {
      lines.push({ ...bounds });
    } else {
      line.left = Math.min(line.left, bounds.left);
      line.top = Math.min(line.top, bounds.top);
      line.right = Math.max(line.right, bounds.right);
      line.bottom = Math.max(line.bottom, bounds.bottom);
    }
  }
  return Object.freeze(lines.map((line) => Object.freeze({ ...line })));
}

function sameVisualLine(line: ElasticPreviewBounds, rect: ElasticPreviewBounds): boolean {
  const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
  const tolerance = Math.max(
    ELASTIC_PREVIEW_METRICS.lineTopTolerance,
    Math.min(line.bottom - line.top, rect.bottom - rect.top) * 0.35,
  );
  return overlap > 0 || Math.abs(line.top - rect.top) <= tolerance;
}

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
  return roundClientValue(clamp(
    y,
    viewport.top + handleViewportInset,
    viewport.bottom - handleViewportInset,
  ));
}

function pocketHorizontalBounds(
  bounds: ElasticPreviewBounds,
  viewport: ElasticPreviewViewport | undefined,
): Readonly<{ left: number; right: number }> | null {
  const outset = ELASTIC_PREVIEW_METRICS.pocketInlineOutset;
  const center = (bounds.left + bounds.right) / 2;
  const width = Math.max(ELASTIC_PREVIEW_METRICS.minimumPocketWidth, bounds.right - bounds.left + outset * 2);
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
  return value === null || value === "bottom";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundClientValue(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
