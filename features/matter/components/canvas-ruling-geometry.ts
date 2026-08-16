export type CanvasRulingViewport = Readonly<{
  x: number;
  y: number;
  zoom: number;
}>;

export type CanvasRulingTopologyInput = Readonly<{
  anchorX: number;
  cellHeight: number;
  columnGap: number;
  columnWidth: number;
  surfaceHeight: number;
  surfaceWidth: number;
  zoom: number;
}>;

type Input = Omit<CanvasRulingTopologyInput, "zoom"> & Readonly<{
  viewport: CanvasRulingViewport;
}>;

export type CanvasRulingTopology = Readonly<{
  baseOriginX: number;
  baseOriginY: number;
  cellHeight: number;
  cellWidth: number;
  curveTension: number;
  dashLength: number;
  horizontalDashCount: number;
  horizontalGap: number;
  intersectionClearance: number;
  lineWidth: number;
  verticalDashCount: number;
  verticalGap: number;
}>;

export type CanvasRulingPlacement = Readonly<{
  originX: number;
  originY: number;
  phaseX: number;
  phaseY: number;
}>;

export type CanvasRulingGeometry = CanvasRulingTopology & CanvasRulingPlacement;

export type CanvasRulingPaths = Readonly<{
  horizontalPath: string;
  verticalPath: string;
}>;

const BASE_DASH_LENGTH = 6;
const BASE_DASH_GAP = 10;
const BASE_INTERSECTION_CLEARANCE = 3;
const CONTINUOUS_CAP_TENSION = 0.72;
const MAX_DASH_COUNT_PER_AXIS = 128;
const SCREEN_LINE_WIDTH = 1.4;

/**
 * Projects one world-anchored ruling without storing authored positions. Cell,
 * dash, gap and joint geometry share the material camera. One continuous-curve
 * line width is the deliberate screen-space readability exception.
 */
export function projectCanvasRulingGeometry(input: Input): CanvasRulingGeometry | null {
  const topology = projectCanvasRulingTopology({
    anchorX: input.anchorX,
    cellHeight: input.cellHeight,
    columnGap: input.columnGap,
    columnWidth: input.columnWidth,
    surfaceHeight: input.surfaceHeight,
    surfaceWidth: input.surfaceWidth,
    zoom: input.viewport.zoom,
  });
  if (topology === null) return null;
  const placement = projectCanvasRulingPlacement(topology, input.viewport);
  return placement === null ? null : Object.freeze({ ...topology, ...placement });
}

export function projectCanvasRulingTopology(
  input: CanvasRulingTopologyInput,
): CanvasRulingTopology | null {
  if (
    ![
      input.anchorX,
      input.cellHeight,
      input.columnGap,
      input.columnWidth,
      input.surfaceHeight,
      input.surfaceWidth,
      input.zoom,
    ].every(isFiniteProjectionNumber) ||
    input.cellHeight <= 0 ||
    input.columnGap < 0 ||
    input.columnWidth <= 0 ||
    input.surfaceHeight <= 0 ||
    input.surfaceWidth <= 0 ||
    input.zoom <= 0
  ) return null;

  const worldCellWidth = input.columnWidth + input.columnGap;
  const rootWorldLeft = input.surfaceWidth / 2 + input.anchorX - worldCellWidth / 2;
  const rootWorldTop = input.surfaceHeight * 0.43 - 88;
  const baseOriginX = rootWorldLeft * input.zoom;
  const baseOriginY = rootWorldTop * input.zoom;
  const cellHeight = input.cellHeight * input.zoom;
  const cellWidth = worldCellWidth * input.zoom;
  const dashLength = BASE_DASH_LENGTH * input.zoom;
  const intersectionClearance = BASE_INTERSECTION_CLEARANCE * input.zoom;
  const targetGap = BASE_DASH_GAP * input.zoom;
  if (
    ![
      baseOriginX,
      baseOriginY,
      cellHeight,
      cellWidth,
      dashLength,
      intersectionClearance,
      targetGap,
    ].every(isFiniteProjectionNumber) ||
    dashLength <= SCREEN_LINE_WIDTH * 1.2 ||
    cellWidth - 2 * intersectionClearance < 2 * dashLength ||
    cellHeight - 2 * intersectionClearance < 2 * dashLength
  ) return null;
  const horizontalAxis = projectBalancedAxis(
    cellWidth,
    intersectionClearance,
    dashLength,
    targetGap,
  );
  const verticalAxis = projectBalancedAxis(
    cellHeight,
    intersectionClearance,
    dashLength,
    targetGap,
  );
  if (horizontalAxis === null || verticalAxis === null) return null;
  return Object.freeze({
    baseOriginX: round(baseOriginX),
    baseOriginY: round(baseOriginY),
    cellHeight: round(cellHeight),
    cellWidth: round(cellWidth),
    curveTension: CONTINUOUS_CAP_TENSION,
    dashLength: round(dashLength),
    horizontalDashCount: horizontalAxis.dashCount,
    horizontalGap: round(horizontalAxis.gap),
    intersectionClearance: round(intersectionClearance),
    lineWidth: SCREEN_LINE_WIDTH,
    verticalDashCount: verticalAxis.dashCount,
    verticalGap: round(verticalAxis.gap),
  });
}

export function projectCanvasRulingPlacement(
  topology: CanvasRulingTopology,
  viewport: Pick<CanvasRulingViewport, "x" | "y">,
): CanvasRulingPlacement | null {
  if (
    ![
      topology.baseOriginX,
      topology.baseOriginY,
      topology.cellHeight,
      topology.cellWidth,
      viewport.x,
      viewport.y,
    ].every(isFiniteProjectionNumber) ||
    topology.cellHeight <= 0 ||
    topology.cellWidth <= 0
  ) return null;
  const originX = viewport.x + topology.baseOriginX;
  const originY = viewport.y + topology.baseOriginY;
  if (![originX, originY].every(isFiniteProjectionNumber)) return null;
  return Object.freeze({
    originX: round(originX),
    originY: round(originY),
    phaseX: roundPhase(originX, topology.cellWidth),
    phaseY: roundPhase(originY, topology.cellHeight),
  });
}

export function projectCanvasRulingPaths(
  topology: CanvasRulingTopology,
): CanvasRulingPaths | null {
  if (
    ![
      topology.curveTension,
      topology.dashLength,
      topology.horizontalGap,
      topology.intersectionClearance,
      topology.lineWidth,
      topology.verticalGap,
    ].every(isFiniteProjectionNumber) ||
    !validDashCount(topology.horizontalDashCount) ||
    !validDashCount(topology.verticalDashCount) ||
    topology.curveTension <= 0 ||
    topology.curveTension >= 1 ||
    topology.dashLength <= topology.lineWidth * 1.2 ||
    topology.horizontalGap <= 0 ||
    topology.intersectionClearance < 0 ||
    topology.lineWidth <= 0 ||
    topology.verticalGap <= 0
  ) return null;
  return Object.freeze({
    horizontalPath: projectDashPath({
      axis: "horizontal",
      clearance: topology.intersectionClearance,
      curveTension: topology.curveTension,
      dashCount: topology.horizontalDashCount,
      dashLength: topology.dashLength,
      gap: topology.horizontalGap,
      lineWidth: topology.lineWidth,
    }),
    verticalPath: projectDashPath({
      axis: "vertical",
      clearance: topology.intersectionClearance,
      curveTension: topology.curveTension,
      dashCount: topology.verticalDashCount,
      dashLength: topology.dashLength,
      gap: topology.verticalGap,
      lineWidth: topology.lineWidth,
    }),
  });
}

function positiveModulo(value: number, step: number): number {
  return ((value % step) + step) % step;
}

function roundPhase(value: number, step: number): number {
  const phase = round(positiveModulo(value, step));
  return phase >= step || Object.is(phase, -0) ? 0 : phase;
}

function projectBalancedAxis(
  edgeLength: number,
  clearance: number,
  dashLength: number,
  targetGap: number,
): Readonly<{ dashCount: number; gap: number }> | null {
  const usableLength = edgeLength - 2 * clearance;
  const dashCount = Math.max(
    2,
    Math.round((usableLength + targetGap) / (dashLength + targetGap)),
  );
  if (!validDashCount(dashCount)) return null;
  const gap = (usableLength - dashCount * dashLength) / (dashCount - 1);
  return Number.isFinite(gap) && gap > 0
    ? Object.freeze({ dashCount, gap })
    : null;
}

function validDashCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 2 && value <= MAX_DASH_COUNT_PER_AXIS;
}

function isFiniteProjectionNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

type DashPathInput = Readonly<{
  axis: "horizontal" | "vertical";
  clearance: number;
  curveTension: number;
  dashCount: number;
  dashLength: number;
  gap: number;
  lineWidth: number;
}>;

/**
 * Merges every visible dash into one path. Its cubic cap has flatter shoulders
 * than a semicircle, so the ruling reads as a soft incision rather than pills.
 * Pattern repetition keeps the DOM constant.
 */
function projectDashPath(input: DashPathInput): string {
  const halfLine = input.lineWidth / 2;
  const center = halfLine;
  const paths: string[] = [];
  for (let index = 0; index < input.dashCount; index += 1) {
    const start = center + input.clearance + index * (input.dashLength + input.gap);
    paths.push(projectContinuousDash(
      input.axis,
      start,
      center,
      input.dashLength,
      halfLine,
      input.curveTension,
    ));
  }
  return paths.join(" ");
}

function projectContinuousDash(
  axis: "horizontal" | "vertical",
  start: number,
  center: number,
  length: number,
  radius: number,
  curveTension: number,
): string {
  const point = (along: number, across: number) => axis === "horizontal"
    ? `${format(start + along)} ${format(center + across)}`
    : `${format(center + across)} ${format(start + along)}`;
  const capDepth = radius * 1.2;
  const shoulder = curveTension * capDepth;
  return [
    `M ${point(capDepth, -radius)}`,
    `L ${point(length - capDepth, -radius)}`,
    `C ${point(length - capDepth + shoulder, -radius)} ${point(length, -radius)} ${point(length, 0)}`,
    `C ${point(length, radius)} ${point(length - capDepth + shoulder, radius)} ${point(length - capDepth, radius)}`,
    `L ${point(capDepth, radius)}`,
    `C ${point(capDepth - shoulder, radius)} ${point(0, radius)} ${point(0, 0)}`,
    `C ${point(0, -radius)} ${point(capDepth - shoulder, -radius)} ${point(capDepth, -radius)}`,
    "Z",
  ].join(" ");
}

function format(value: number): string {
  return String(round(value));
}

function round(value: number): number {
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER / 1_000) return value;
  return Math.round(value * 1_000) / 1_000;
}
