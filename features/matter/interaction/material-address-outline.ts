import type { MaterialAddressProjection } from "./projected-layout-receipt";

export type MaterialAddressBand = Readonly<{
  blockEnd: number;
  blockStart: number;
  left: number;
  right: number;
}>;

export type MaterialAddressOutline = Readonly<{
  bands: readonly MaterialAddressBand[];
  bounds: Readonly<{ bottom: number; left: number; right: number; top: number }>;
  path: string;
}>;

/** Two coordinates that bound one row along the logical inline axis. */
type LogicalSpan = Readonly<{ from: number; to: number }>;

const MINIMUM_BAND_EXTENT = 0.5;

/**
 * Projects one reading-order interval into a single rounded orthogonal outline.
 *
 * The interval's row bands follow the frozen formula: the only row keeps both
 * real edges, the first row runs to the logical end, interior rows span the
 * column, and the last row returns to the real end edge. A lower grip makes the
 * interval `selection start -> slot end` and an upper grip mirrors it, so the
 * slot is never a second object that has to be connected back.
 *
 * Attachment interpolates between the neutral interval and the engaged one, so
 * no edge can jump when the slot first opens. It is a pure function of the
 * projection, so a pointer and a keyboard at one amount produce one path.
 */
export function materialAddressOutline(
  projection: MaterialAddressProjection | null,
): MaterialAddressOutline | null {
  if (projection === null) return null;
  if (projection.writingMode !== "horizontal-tb") return null;
  const { column, metrics, rows, run } = projection;
  if (rows.length === 0) return null;
  if (!Number.isFinite(metrics.cornerRadius) || metrics.cornerRadius < 0) return null;

  const first = Math.max(0, Math.min(run.startRow, rows.length - 1));
  const last = Math.max(first, Math.min(run.endRow, rows.length - 1));
  const selected = rows.slice(first, last + 1);
  if (selected.length === 0) return null;

  // Logical edge values are already physical coordinates; RTL simply swaps
  // which column side the logical start and end refer to.
  const logicalStart = projection.textDirection === "ltr" ? column.inlineStart : column.inlineEnd;
  const logicalEnd = projection.textDirection === "ltr" ? column.inlineEnd : column.inlineStart;
  const count = selected.length;
  const progress = clamp01(projection.attachmentProgress);
  const engaged = projection.slot !== null && projection.direction !== "neutral";
  const slotFollows = projection.direction === "selection-then-slot";

  const neutralSpan = (index: number): LogicalSpan => {
    if (count === 1) return { from: run.startInline, to: run.endInline };
    if (index === 0) return { from: run.startInline, to: logicalEnd };
    if (index === count - 1) return { from: logicalStart, to: run.endInline };
    return { from: logicalStart, to: logicalEnd };
  };
  const engagedSpan = (index: number): LogicalSpan => {
    if (!engaged) return neutralSpan(index);
    // The grip that owns the slot turns its own boundary row into an interior
    // row, because the interval now continues past it into the opened space.
    if (slotFollows) {
      return index === 0
        ? { from: run.startInline, to: logicalEnd }
        : { from: logicalStart, to: logicalEnd };
    }
    return index === count - 1
      ? { from: logicalStart, to: run.endInline }
      : { from: logicalStart, to: logicalEnd };
  };

  const bands: MaterialAddressBand[] = [];
  const pushBand = (span: LogicalSpan, blockStart: number, blockEnd: number) => {
    const left = Math.min(span.from, span.to) - metrics.inlineOutset;
    const right = Math.max(span.from, span.to) + metrics.inlineOutset;
    bands.push({
      blockEnd,
      blockStart,
      left,
      right: Math.max(right, left + MINIMUM_BAND_EXTENT),
    });
  };
  const slotSpan = (): LogicalSpan => {
    // The slot emerges flush with the row it attaches to and only then reaches
    // the column, so a shallow slot cannot appear already full width.
    const attached = slotFollows ? neutralSpan(count - 1) : neutralSpan(0);
    return {
      from: mix(attached.from, logicalStart, progress),
      to: mix(attached.to, logicalEnd, progress),
    };
  };
  const slotVisible = projection.slot !== null &&
    projection.slot.blockEnd - projection.slot.blockStart > 0;

  if (engaged && !slotFollows && slotVisible) {
    pushBand(slotSpan(), projection.slot!.blockStart, projection.slot!.blockEnd);
  }
  for (const [index, row] of selected.entries()) {
    const from = mix(neutralSpan(index).from, engagedSpan(index).from, progress);
    const to = mix(neutralSpan(index).to, engagedSpan(index).to, progress);
    pushBand({ from, to }, row.blockStart, row.blockEnd);
  }
  if (engaged && slotFollows && slotVisible) {
    pushBand(slotSpan(), projection.slot!.blockStart, projection.slot!.blockEnd);
  }

  const joined = joinBlockEdges(bands, metrics.blockOutset);
  if (joined.length === 0) return null;
  const path = outlinePath(joined, metrics.cornerRadius);
  if (path.length === 0) return null;
  return Object.freeze({
    bands: Object.freeze(joined),
    bounds: Object.freeze({
      bottom: joined.at(-1)!.blockEnd,
      left: Math.min(...joined.map((band) => band.left)),
      right: Math.max(...joined.map((band) => band.right)),
      top: joined[0]!.blockStart,
    }),
    path,
  });
}

/**
 * Adjacent rows are made to share one block edge before painting. Real line
 * boxes can leave sub-pixel leading between them, and a single outline may not
 * contain a hole, so neighbours meet at their midpoint instead.
 */
function joinBlockEdges(
  bands: readonly MaterialAddressBand[],
  blockOutset: number,
): readonly MaterialAddressBand[] {
  const ordered = [...bands].sort((left, right) => left.blockStart - right.blockStart);
  const joined: MaterialAddressBand[] = [];
  for (const [index, band] of ordered.entries()) {
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const blockStart = previous === undefined
      ? band.blockStart - blockOutset
      : (previous.blockEnd + band.blockStart) / 2;
    const blockEnd = next === undefined
      ? band.blockEnd + blockOutset
      : (band.blockEnd + next.blockStart) / 2;
    if (blockEnd - blockStart < MINIMUM_BAND_EXTENT) continue;
    joined.push({ blockEnd, blockStart, left: band.left, right: band.right });
  }
  return joined;
}

/** Walks the staircase clockwise: right edges downward, then left edges up. */
function outlinePath(
  bands: readonly MaterialAddressBand[],
  cornerRadius: number,
): string {
  const points: Array<readonly [number, number]> = [];
  for (const band of bands) {
    points.push([band.right, band.blockStart], [band.right, band.blockEnd]);
  }
  for (const band of [...bands].reverse()) {
    points.push([band.left, band.blockEnd], [band.left, band.blockStart]);
  }
  const ring = simplifyRing(points);
  if (ring.length < 4) return "";

  const segments: string[] = [];
  for (const [index, point] of ring.entries()) {
    const previous = ring[(index - 1 + ring.length) % ring.length]!;
    const next = ring[(index + 1) % ring.length]!;
    const radius = Math.min(
      cornerRadius,
      distance(previous, point) / 2,
      distance(point, next) / 2,
    );
    const entry = towards(point, previous, radius);
    const exit = towards(point, next, radius);
    if (index === 0) segments.push(`M${format(entry[0])} ${format(entry[1])}`);
    else segments.push(`L${format(entry[0])} ${format(entry[1])}`);
    if (radius > 0) {
      const turn = cross(point, previous, next);
      segments.push(
        `A${format(radius)} ${format(radius)} 0 0 ${turn > 0 ? 1 : 0} ${format(exit[0])} ${format(exit[1])}`,
      );
    }
  }
  segments.push("Z");
  return segments.join("");
}

function simplifyRing(
  points: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const deduped: Array<readonly [number, number]> = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous !== undefined && near(previous, point)) continue;
    deduped.push(point);
  }
  while (deduped.length > 1 && near(deduped[0]!, deduped.at(-1)!)) deduped.pop();
  const ring: Array<readonly [number, number]> = [];
  for (const [index, point] of deduped.entries()) {
    const previous = deduped[(index - 1 + deduped.length) % deduped.length]!;
    const next = deduped[(index + 1) % deduped.length]!;
    if (Math.abs(cross(point, previous, next)) < 1e-6) continue;
    ring.push(point);
  }
  return ring;
}

function cross(
  point: readonly [number, number],
  previous: readonly [number, number],
  next: readonly [number, number],
): number {
  return (point[0] - previous[0]) * (next[1] - point[1]) -
    (point[1] - previous[1]) * (next[0] - point[0]);
}

function towards(
  point: readonly [number, number],
  target: readonly [number, number],
  radius: number,
): readonly [number, number] {
  const length = distance(point, target);
  if (length === 0 || radius === 0) return point;
  const ratio = radius / length;
  return [
    point[0] + (target[0] - point[0]) * ratio,
    point[1] + (target[1] - point[1]) * ratio,
  ];
}

function distance(left: readonly [number, number], right: readonly [number, number]): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function near(left: readonly [number, number], right: readonly [number, number]): boolean {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100);
}
