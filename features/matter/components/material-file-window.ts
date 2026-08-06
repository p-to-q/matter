export const MATERIAL_FILE_WINDOW_THRESHOLD = 200;
export const MATERIAL_FILE_WINDOW_OVERSCAN_ROWS = 12;

export type MaterialFileWindow = Readonly<{
  start: number;
  end: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
  windowed: boolean;
}>;

export type MaterialFileRenderRange = Readonly<{
  start: number;
  end: number;
}>;

/**
 * The material-file projection stays complete; this chooses only which fixed
 * height rows enter the DOM. It deliberately knows nothing about tree state,
 * search, selection, or persistence.
 */
export function projectMaterialFileWindow(input: Readonly<{
  rowCount: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscanRows?: number;
  threshold?: number;
}>): MaterialFileWindow {
  const rowCount = nonNegativeInteger(input.rowCount);
  const rowHeight = positiveNumber(input.rowHeight, 1);
  const viewportHeight = nonNegativeNumber(input.viewportHeight);
  const threshold = nonNegativeInteger(input.threshold ?? MATERIAL_FILE_WINDOW_THRESHOLD);
  const overscanRows = nonNegativeInteger(input.overscanRows ?? MATERIAL_FILE_WINDOW_OVERSCAN_ROWS);
  const totalHeight = rowCount * rowHeight;
  if (rowCount <= threshold) {
    return Object.freeze({
      start: 0,
      end: rowCount,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight,
      windowed: false,
    });
  }

  const maximumScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = clamp(nonNegativeNumber(input.scrollTop), 0, maximumScrollTop);
  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleEnd = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / rowHeight));
  const start = clampInteger(visibleStart - overscanRows, 0, rowCount);
  const end = clampInteger(Math.max(start, visibleEnd + overscanRows), start, rowCount);
  return Object.freeze({
    start,
    end,
    topSpacerHeight: start * rowHeight,
    bottomSpacerHeight: (rowCount - end) * rowHeight,
    totalHeight,
    windowed: true,
  });
}

/**
 * Keeps an actually focused row mounted without expanding a viewport window.
 * The ranges remain ordered, so spacers preserve the projection's scroll
 * geometry even when the focused row sits outside the viewport.
 */
export function projectMaterialFileRenderRanges(
  window: MaterialFileWindow,
  focusedIndex: number | null,
): readonly MaterialFileRenderRange[] {
  if (!window.windowed || focusedIndex === null || focusedIndex < 0) {
    return Object.freeze([{ start: window.start, end: window.end }]);
  }
  if (focusedIndex >= window.start && focusedIndex < window.end) {
    return Object.freeze([{ start: window.start, end: window.end }]);
  }
  const focusRange = { start: focusedIndex, end: focusedIndex + 1 };
  const viewportRange = { start: window.start, end: window.end };
  return Object.freeze(
    focusedIndex < window.start
      ? [Object.freeze(focusRange), Object.freeze(viewportRange)]
      : [Object.freeze(viewportRange), Object.freeze(focusRange)],
  );
}

export function scrollTopForMaterialFileIndex(input: Readonly<{
  index: number;
  rowCount: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}>): number {
  const rowCount = nonNegativeInteger(input.rowCount);
  const rowHeight = positiveNumber(input.rowHeight, 1);
  const viewportHeight = nonNegativeNumber(input.viewportHeight);
  const index = clampInteger(Math.trunc(input.index), 0, Math.max(0, rowCount - 1));
  const totalHeight = rowCount * rowHeight;
  const maximumScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = clamp(nonNegativeNumber(input.scrollTop), 0, maximumScrollTop);
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  if (rowTop < scrollTop) return clamp(rowTop, 0, maximumScrollTop);
  if (rowBottom > scrollTop + viewportHeight) {
    return clamp(rowBottom - viewportHeight, 0, maximumScrollTop);
  }
  return scrollTop;
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
