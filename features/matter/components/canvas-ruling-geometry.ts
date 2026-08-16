export type CanvasRulingViewport = Readonly<{
  x: number;
  y: number;
  zoom: number;
}>;

export type CanvasRulingOffset = Readonly<{
  x: number;
  y: number;
}>;

type Input = Readonly<{
  anchorX: number;
  cellHeight: number;
  columnGap: number;
  columnWidth: number;
  surfaceHeight: number;
  surfaceWidth: number;
  offset: CanvasRulingOffset;
}>;

export type CanvasRulingGeometry = Readonly<{
  cellHeight: number;
  cellWidth: number;
  originX: number;
  originY: number;
}>;

/**
 * Projects a repeating paper-space ruling without storing authored positions.
 * Layout metrics come from the same CSS tokens as material at rest. Pan may
 * translate this auxiliary paper; material zoom never rescales it.
 */
export function projectCanvasRulingGeometry(input: Input): CanvasRulingGeometry | null {
  if (
    ![
      input.anchorX,
      input.cellHeight,
      input.columnGap,
      input.columnWidth,
      input.surfaceHeight,
      input.surfaceWidth,
    ].every(Number.isFinite) ||
    input.cellHeight <= 0 ||
    input.columnGap < 0 ||
    input.columnWidth <= 0 ||
    input.surfaceHeight <= 0 ||
    input.surfaceWidth <= 0 ||
    ![input.offset.x, input.offset.y].every(Number.isFinite)
  ) return null;

  const cellWidth = input.columnWidth + input.columnGap;
  const rootWorldLeft = input.surfaceWidth / 2 + input.anchorX - cellWidth / 2;
  const rootWorldTop = input.surfaceHeight * 0.43 - 88;
  return Object.freeze({
    cellHeight: round(input.cellHeight),
    cellWidth: round(cellWidth),
    originX: round(input.offset.x + rootWorldLeft),
    originY: round(input.offset.y + rootWorldTop),
  });
}

/**
 * Advances the paper only for a translation-only camera update. Zoom reducers
 * also rewrite x/y around their focal point; those deltas must not make the
 * local ruling crawl under a stationary observer.
 */
export function advanceCanvasRulingOffset(
  current: CanvasRulingOffset,
  previous: CanvasRulingViewport,
  next: CanvasRulingViewport,
): CanvasRulingOffset {
  if (
    ![current.x, current.y, previous.x, previous.y, previous.zoom, next.x, next.y, next.zoom]
      .every(Number.isFinite) ||
    previous.zoom <= 0 ||
    next.zoom <= 0 ||
    previous.zoom !== next.zoom
  ) return current;
  const x = round(current.x + next.x - previous.x);
  const y = round(current.y + next.y - previous.y);
  return x === current.x && y === current.y
    ? current
    : Object.freeze({ x, y });
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
