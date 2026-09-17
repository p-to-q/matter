export type ClientPoint = Readonly<{
  x: number;
  y: number;
}>;

export type ClientRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type ClientBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

/** All distances are client CSS pixels; areas are square client CSS pixels. */
export const LASSO_THRESHOLDS = Object.freeze({
  minimumPointCount: 3,
  minimumPathLength: 24,
  minimumExtent: 6,
  minimumBoundsArea: 64,
  minimumPolygonArea: 36,
  sampleDistance: 4,
  maximumPointCount: 256,
  maximumCapturedPointCount: 4096,
  // Compaction may remove a point only while the complete captured stroke
  // remains within this client-pixel error. If 256 points cannot preserve that
  // bound, the stroke is saturated and cannot change the current selection.
  maximumCompactionError: 1.5,
  // People release a hand-drawn loop near, rather than exactly on, its origin.
  // The tolerance is deliberately large enough for a small trackpad loop.
  closureNearDistance: 32,
  closureEarlyArcLength: 12,
  closureMinimumAngleDegrees: 45,
  closureMaximumPathRatio: 0.68,
  closureMaximumBoundsRatio: 0.92,
  edgeMargin: 6,
  probeInsetRatio: 0.25,
  minimumInsideProbeCount: 2,
});

const PREPARED_LASSO = Symbol("prepared-lasso");
const ANGLE_COMPARISON_EPSILON_DEGREES = 1e-9;

export type PreparedLasso = Readonly<{
  /** The first point is repeated at the end; every consumer sees the same closure. */
  points: readonly ClientPoint[];
  bounds: ClientBounds;
  area: number;
  pathLength: number;
  [PREPARED_LASSO]: true;
}>;

export type LassoPathAnalysis =
  | Readonly<{ kind: "prepared"; lasso: PreparedLasso }>
  | Readonly<{ kind: "uncommitted"; reason: "invalid" | "tiny" | "linear" | "open" | "saturated" }>
  | Readonly<{ kind: "ambiguous"; reason: "self-intersection" }>;

export type LassoPathCompaction =
  | Readonly<{ kind: "compacted"; points: readonly ClientPoint[] }>
  | Readonly<{ kind: "invalid" | "saturated" }>;

export type LassoStrokeQualification = "pending" | "qualified";

/**
 * Produces the one bounded polyline shared by paint and hit testing. Distance
 * sampling removes pointer noise first. Longer strokes are simplified from the
 * complete path at the smallest error that fits the point budget, rather than
 * keeping an accurate prefix and replacing the rest with one long chord.
 *
 * If the budget cannot represent the full stroke inside the declared error,
 * saturation is explicit. Guessing would make the visible loop and the
 * addressed language disagree precisely on the most complex gestures.
 */
export function compactLassoPath(
  rawPoints: readonly ClientPoint[],
): LassoPathCompaction {
  if (!Array.isArray(rawPoints)) {
    return Object.freeze({ kind: "invalid" });
  }
  if (rawPoints.length > LASSO_THRESHOLDS.maximumCapturedPointCount) {
    return Object.freeze({ kind: "saturated" });
  }
  if (rawPoints.some((point) => !isFinitePoint(point))) {
    return Object.freeze({ kind: "invalid" });
  }
  if (rawPoints.length <= 1) {
    return Object.freeze({ kind: "compacted", points: freezePoints(rawPoints) });
  }

  const sampled: ClientPoint[] = [rawPoints[0]!];
  for (let index = 1; index < rawPoints.length - 1; index += 1) {
    const point = rawPoints[index]!;
    if (distance(sampled.at(-1)!, point) >= LASSO_THRESHOLDS.sampleDistance) {
      sampled.push(point);
    }
  }
  const finalPoint = rawPoints.at(-1)!;
  if (!samePoint(sampled.at(-1)!, finalPoint)) sampled.push(finalPoint);
  if (sampled.length <= LASSO_THRESHOLDS.maximumPointCount) {
    return Object.freeze({ kind: "compacted", points: freezePoints(sampled) });
  }

  const atMaximumError = simplifyPolyline(
    sampled,
    LASSO_THRESHOLDS.maximumCompactionError,
    LASSO_THRESHOLDS.maximumPointCount,
  );
  if (atMaximumError.length > LASSO_THRESHOLDS.maximumPointCount) {
    return Object.freeze({ kind: "saturated" });
  }

  // Preserve as much source geometry as the fixed budget permits. Twelve
  // monotonic refinements are sub-millipixel at this bounded error and avoid a
  // data-dependent unbounded loop on the pointer path.
  let lowerError: number = 0;
  let upperError: number = LASSO_THRESHOLDS.maximumCompactionError;
  let best = atMaximumError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidateError = (lowerError + upperError) / 2;
    const candidate = simplifyPolyline(
      sampled,
      candidateError,
      LASSO_THRESHOLDS.maximumPointCount,
    );
    if (candidate.length <= LASSO_THRESHOLDS.maximumPointCount) {
      best = candidate;
      upperError = candidateError;
    } else {
      lowerError = candidateError;
    }
  }
  return Object.freeze({ kind: "compacted", points: freezePoints(best) });
}

/** Nullable compatibility boundary for callers that do not need the reason. */
export function sampleLassoPath(
  rawPoints: readonly ClientPoint[],
): readonly ClientPoint[] | null {
  const compacted = compactLassoPath(rawPoints);
  return compacted.kind === "compacted" ? compacted.points : null;
}

/**
 * Classifies a completed raw stroke. Pointer-up always contributes one explicit
 * straight closing seam; tiny, essentially one-dimensional, and multi-lobed
 * strokes are rejected before they can address language.
 */
export function analyzeLassoPath(rawPoints: readonly ClientPoint[]): LassoPathAnalysis {
  const compacted = compactLassoPath(rawPoints);
  if (compacted.kind !== "compacted") {
    return Object.freeze({ kind: "uncommitted", reason: compacted.kind });
  }
  const sampled = compacted.points;
  if (sampled.length < LASSO_THRESHOLDS.minimumPointCount) {
    return Object.freeze({ kind: "uncommitted", reason: "tiny" });
  }

  const metrics = pathMetrics(sampled);
  if (metrics === null) return Object.freeze({ kind: "uncommitted", reason: "invalid" });
  const { bounds, pathLength, width, height } = metrics;
  if (!metrics.qualified) return Object.freeze({
    kind: "uncommitted",
    reason: width < LASSO_THRESHOLDS.minimumExtent || height < LASSO_THRESHOLDS.minimumExtent
      ? "linear"
      : "tiny",
  });

  const closed = explicitlyClose(sampled);
  if (hasNonAdjacentIntersection(closed)) {
    return Object.freeze({ kind: "ambiguous", reason: "self-intersection" });
  }
  const area = polygonArea(closed);
  if (!Number.isFinite(area) || area < LASSO_THRESHOLDS.minimumPolygonArea) {
    return Object.freeze({ kind: "uncommitted", reason: "tiny" });
  }
  if (!closureIntentFromSampled(sampled, metrics)) {
    return Object.freeze({ kind: "uncommitted", reason: "open" });
  }

  const lasso = Object.freeze({
    points: closed,
    bounds,
    area,
    pathLength,
    [PREPARED_LASSO]: true as const,
  });
  return Object.freeze({ kind: "prepared", lasso });
}

/** A click exits selection mode; a small but deliberate open stroke does not. */
export function lassoClickIntent(
  rawPoints: readonly ClientPoint[],
  maximumTravel: number,
): boolean {
  if (
    !Array.isArray(rawPoints) || rawPoints.length === 0 ||
    !Number.isFinite(maximumTravel) || maximumTravel < 0 ||
    rawPoints.some((point) => !isFinitePoint(point))
  ) return false;
  const origin = rawPoints[0]!;
  return rawPoints.every((point) => distance(origin, point) <= maximumTravel);
}

/**
 * Detects an intentional closure without requiring the pointer to return to
 * its exact origin. Absolute proximity handles a literal close; otherwise a
 * stable early direction, turn angle, and two scale-free gap limits admit a
 * deliberate early release such as three sides of a rectangle.
 */
export function lassoClosureIntent(rawPoints: readonly ClientPoint[]): boolean {
  const sampled = sampleLassoPath(rawPoints);
  if (sampled === null || sampled.length < LASSO_THRESHOLDS.minimumPointCount) {
    return false;
  }
  const metrics = pathMetrics(sampled);
  return metrics?.qualified === true && closureIntentFromSampled(sampled, metrics);
}

/** Cheap qualification only; full topology runs once per preview frame and at commit. */
export function lassoStrokeQualification(
  rawPoints: readonly ClientPoint[],
): LassoStrokeQualification {
  const sampled = sampleLassoPath(rawPoints);
  return sampled !== null && sampled.length >= LASSO_THRESHOLDS.minimumPointCount &&
    pathMetrics(sampled)?.qualified === true
    ? "qualified"
    : "pending";
}

/** Nullable compatibility boundary for the current rendering-edge adapter. */
export function prepareLasso(rawPoints: readonly ClientPoint[]): PreparedLasso | null {
  const analysis = analyzeLassoPath(rawPoints);
  return analysis.kind === "prepared" ? analysis.lasso : null;
}

/**
 * A fragment needs either a forgiving center hit or substantial enclosure.
 * Four inset probes prevent an incidental rectangle-edge touch from selecting.
 */
export function lassoHitsRectFragment(lasso: PreparedLasso, rect: ClientRect): boolean {
  if (!isPreparedLasso(lasso) || !isFiniteNonEmptyRect(rect)) return false;

  const probes = rectProbes(rect);
  const center = probes[0]!;
  const expanded = expandBounds(lasso.bounds, LASSO_THRESHOLDS.edgeMargin);
  if (
    pointInBounds(center, expanded) &&
    (pointInPolygon(center, lasso.points) ||
      squaredDistanceToPolygon(center, lasso.points) <= LASSO_THRESHOLDS.edgeMargin ** 2)
  ) {
    return true;
  }
  // A person may circle a few words within a long punctuation segment rather
  // than its typographic centre. If the loop's own interior centre lands in
  // this DOM fragment, it is a deliberate hit; adjacent semantic fragments
  // remain distinct because their client rectangles do not share that point.
  const loopCenter = {
    x: (lasso.bounds.left + lasso.bounds.right) / 2,
    y: (lasso.bounds.top + lasso.bounds.bottom) / 2,
  };
  if (
    pointInPolygon(loopCenter, lasso.points) &&
    pointInBounds(loopCenter, {
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    })
  ) return true;
  const insideCount = probes.filter((probe) => pointInPolygon(probe, lasso.points)).length;
  if (insideCount >= LASSO_THRESHOLDS.minimumInsideProbeCount) return true;
  // A loose loop often crosses a wrapped line without containing its centre.
  // Accept a fragment when its bounds are substantially enclosed; this keeps
  // selection forgiving without turning a single edge touch into a hit.
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const enclosedCorners = corners.filter((corner) => pointInPolygon(corner, lasso.points)).length;
  return enclosedCorners >= 2 && insideCount > 0;
}

export function pointInPolygon(point: ClientPoint, polygon: readonly ClientPoint[]): boolean {
  if (
    !isFinitePoint(point) ||
    !Array.isArray(polygon) ||
    polygon.length < 4 ||
    polygon.some((candidate) => !isFinitePoint(candidate)) ||
    !samePoint(polygon[0]!, polygon.at(-1)!)
  ) {
    return false;
  }

  let inside = false;
  for (let current = 1; current < polygon.length; current += 1) {
    const a = polygon[current - 1]!;
    const b = polygon[current]!;
    if (squaredDistanceToSegment(point, a, b) === 0) return true;
    const crosses =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function explicitlyClose(points: readonly ClientPoint[]): readonly ClientPoint[] {
  const closed = points.map(ownPoint);
  if (!samePoint(closed[0]!, closed.at(-1)!)) closed.push(ownPoint(closed[0]!));
  return Object.freeze(closed);
}

function rectProbes(rect: ClientRect): readonly ClientPoint[] {
  const left = rect.x + rect.width * LASSO_THRESHOLDS.probeInsetRatio;
  const right = rect.x + rect.width * (1 - LASSO_THRESHOLDS.probeInsetRatio);
  const top = rect.y + rect.height * LASSO_THRESHOLDS.probeInsetRatio;
  const bottom = rect.y + rect.height * (1 - LASSO_THRESHOLDS.probeInsetRatio);
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return [center, { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

function hasNonAdjacentIntersection(points: readonly ClientPoint[]): boolean {
  const segmentCount = points.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      if (second === first + 1 || (first === 0 && second === segmentCount - 1)) continue;
      if (segmentsIntersect(points[first]!, points[first + 1]!, points[second]!, points[second + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(a: ClientPoint, b: ClientPoint, c: ClientPoint, d: ClientPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return (abC < 0) !== (abD < 0) && (cdA < 0) !== (cdB < 0);
}

function orientation(a: ClientPoint, b: ClientPoint, c: ClientPoint): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(cross) <= Number.EPSILON ? 0 : cross;
}

function pointOnSegment(point: ClientPoint, start: ClientPoint, end: ClientPoint): boolean {
  return point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y);
}

function polygonArea(points: readonly ClientPoint[]): number {
  let signedDoubleArea = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index - 1]!;
    const next = points[index]!;
    signedDoubleArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(signedDoubleArea) / 2;
}

function polygonBounds(points: readonly ClientPoint[]): ClientBounds | null {
  if (points.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return [left, top, right, bottom].every(Number.isFinite)
    ? Object.freeze({ left, top, right, bottom })
    : null;
}

function pathMetrics(points: readonly ClientPoint[]): Readonly<{
  bounds: ClientBounds;
  pathLength: number;
  width: number;
  height: number;
  qualified: boolean;
}> | null {
  const bounds = polygonBounds(points);
  if (bounds === null) return null;
  const pathLength = polylineLength(points);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    bounds,
    pathLength,
    width,
    height,
    qualified:
      pathLength >= LASSO_THRESHOLDS.minimumPathLength &&
      width >= LASSO_THRESHOLDS.minimumExtent &&
      height >= LASSO_THRESHOLDS.minimumExtent &&
      width * height >= LASSO_THRESHOLDS.minimumBoundsArea,
  };
}

function closureIntentFromSampled(
  points: readonly ClientPoint[],
  metrics: NonNullable<ReturnType<typeof pathMetrics>>,
): boolean {
  const start = points[0]!;
  const end = points.at(-1)!;
  const gap = distance(start, end);
  if (!Number.isFinite(gap)) return false;
  if (gap <= LASSO_THRESHOLDS.closureNearDistance) return true;

  const early = pointAtPathDistance(points, LASSO_THRESHOLDS.closureEarlyArcLength);
  if (early === null) return false;
  const initial = { x: early.x - start.x, y: early.y - start.y };
  const endpoint = { x: end.x - start.x, y: end.y - start.y };
  const initialLength = Math.hypot(initial.x, initial.y);
  const endpointLength = Math.hypot(endpoint.x, endpoint.y);
  const boundsDiagonal = Math.hypot(metrics.width, metrics.height);
  if (
    initialLength < LASSO_THRESHOLDS.minimumExtent ||
    endpointLength === 0 ||
    boundsDiagonal === 0
  ) return false;

  const cosine = clampUnit(
    (initial.x * endpoint.x + initial.y * endpoint.y) /
      (initialLength * endpointLength),
  );
  const angle = Math.acos(cosine) * 180 / Math.PI;
  return Number.isFinite(angle) &&
    angle + ANGLE_COMPARISON_EPSILON_DEGREES >=
      LASSO_THRESHOLDS.closureMinimumAngleDegrees &&
    gap <= metrics.pathLength * LASSO_THRESHOLDS.closureMaximumPathRatio &&
    gap <= boundsDiagonal * LASSO_THRESHOLDS.closureMaximumBoundsRatio;
}

function pointAtPathDistance(
  points: readonly ClientPoint[],
  targetDistance: number,
): ClientPoint | null {
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = distance(start, end);
    if (segmentLength === 0) continue;
    if (traversed + segmentLength >= targetDistance) {
      const amount = (targetDistance - traversed) / segmentLength;
      return Object.freeze({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      });
    }
    traversed += segmentLength;
  }
  return null;
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function polylineLength(points: readonly ClientPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1]!, points[index]!);
  return length;
}

function squaredDistanceToPolygon(point: ClientPoint, polygon: readonly ClientPoint[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polygon.length; index += 1) {
    minimum = Math.min(minimum, squaredDistanceToSegment(point, polygon[index - 1]!, polygon[index]!));
  }
  return minimum;
}

function squaredDistanceToSegment(point: ClientPoint, start: ClientPoint, end: ClientPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return squaredDistance(point, start);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return squaredDistance(point, { x: start.x + projection * dx, y: start.y + projection * dy });
}

/** Ramer-Douglas-Peucker over the complete path with stable source ordering. */
function simplifyPolyline(
  points: readonly ClientPoint[],
  maximumError: number,
  pointLimit: number,
): readonly ClientPoint[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  let keptPointCount = 2;
  const spans: Array<readonly [number, number]> = [[0, points.length - 1]];
  const maximumSquaredError = maximumError ** 2;
  while (spans.length > 0) {
    const [startIndex, endIndex] = spans.pop()!;
    const start = points[startIndex]!;
    const end = points[endIndex]!;
    let furthestIndex = -1;
    let furthestSquaredDistance = maximumSquaredError;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const candidate = squaredDistanceToSegment(points[index]!, start, end);
      if (candidate > furthestSquaredDistance) {
        furthestSquaredDistance = candidate;
        furthestIndex = index;
      }
    }
    if (furthestIndex < 0) continue;
    keep[furthestIndex] = 1;
    keptPointCount += 1;
    if (keptPointCount > pointLimit) {
      // Callers need only the fact that this error cannot satisfy the bound.
      // Returning a bounded sentinel avoids quadratic work on a pathological
      // sawtooth while preserving the exact yes/no decision.
      return points.slice(0, pointLimit + 1);
    }
    spans.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }
  return points.filter((_, index) => keep[index] === 1);
}

function squaredDistance(left: ClientPoint, right: ClientPoint): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function distance(left: ClientPoint, right: ClientPoint): number {
  return Math.sqrt(squaredDistance(left, right));
}

function expandBounds(bounds: ClientBounds, amount: number): ClientBounds {
  return { left: bounds.left - amount, top: bounds.top - amount, right: bounds.right + amount, bottom: bounds.bottom + amount };
}

function pointInBounds(point: ClientPoint, bounds: ClientBounds): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function isFinitePoint(value: unknown): value is ClientPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Partial<ClientPoint>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteNonEmptyRect(value: unknown): value is ClientRect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rect = value as Partial<ClientRect>;
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) && (rect.width ?? 0) > 0 && (rect.height ?? 0) > 0;
}

function isPreparedLasso(value: unknown): value is PreparedLasso {
  return Boolean(value && typeof value === "object" && (value as Partial<PreparedLasso>)[PREPARED_LASSO] === true);
}

function samePoint(left: ClientPoint, right: ClientPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function ownPoint(point: ClientPoint): ClientPoint {
  return Object.freeze({ x: point.x, y: point.y });
}

function freezePoints(points: readonly ClientPoint[]): readonly ClientPoint[] {
  return Object.freeze(points.map(ownPoint));
}
