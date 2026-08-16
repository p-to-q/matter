export type CanvasRulingViewport = Readonly<{
  x: number;
  y: number;
  zoom: number;
}>;

type Input = Readonly<{
  anchorX: number;
  cellHeight: number;
  columnGap: number;
  columnWidth: number;
  surfaceHeight: number;
  surfaceWidth: number;
  viewport: CanvasRulingViewport;
}>;

export type CanvasRulingGeometry = Readonly<{
  cellHeight: number;
  cellWidth: number;
  originX: number;
  originY: number;
}>;

/**
 * Projects a repeating camera-space ruling without storing authored positions.
 * Layout metrics come from the same CSS tokens as material; the first material
 * lane starts eight world pixels below the cell's top edge.
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
    ![input.viewport.x, input.viewport.y, input.viewport.zoom].every(Number.isFinite) ||
    input.viewport.zoom <= 0
  ) return null;

  const cellWidth = input.columnWidth + input.columnGap;
  const rootWorldLeft = input.surfaceWidth / 2 + input.anchorX - cellWidth / 2;
  const rootWorldTop = input.surfaceHeight * 0.43 - 88;
  return Object.freeze({
    cellHeight: round(input.cellHeight * input.viewport.zoom),
    cellWidth: round(cellWidth * input.viewport.zoom),
    originX: round(input.viewport.x + rootWorldLeft * input.viewport.zoom),
    originY: round(input.viewport.y + rootWorldTop * input.viewport.zoom),
  });
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
