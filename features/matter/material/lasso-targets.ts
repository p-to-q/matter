import {
  LASSO_THRESHOLDS,
  lassoHitsRectFragment,
  type ClientBounds,
  type ClientRect,
  type PreparedLasso,
} from "./lasso-geometry";
import {
  selectionFromSegmentHits,
  segmentText,
  type SegmentSelection,
} from "./text-segments";

export type MeasuredLassoSegment = Readonly<{
  index: number;
  rects: readonly ClientRect[];
}>;

export type LassoSegmentMeasurement = Readonly<{
  index: number;
  rects: readonly ClientRect[] | null;
}>;

export type LassoTarget = Readonly<{
  nodeId: string;
  text: string;
  /** Tight union of visible text fragments, not the layout column box. */
  bounds: ClientBounds;
  measurement: "pending" | "failed" | readonly MeasuredLassoSegment[];
}>;

export type LassoTargetResolution =
  | Readonly<{
      kind: "selection";
      mode: "contiguous-segment-range" | "selection-set";
      selection: SegmentSelection;
      selections: readonly SegmentSelection[];
    }>
  | Readonly<{ kind: "empty-closed" | "ambiguous" }>;

/**
 * Converts one complete render-edge measurement into a resolver target. A
 * root bound is fallback ambiguity coverage only: if any required segment is
 * missing or fails, no measured fragment survives as selectable authority.
 */
export function lassoTargetFromMeasurements(input: Readonly<{
  nodeId: string;
  text: string;
  rootBounds: ClientBounds;
  measurements: readonly LassoSegmentMeasurement[];
}>): LassoTarget | null {
  if (!validBounds(input.rootBounds)) return null;
  const expected = segmentText(input.text);
  if (expected.length === 0) return null;
  const byIndex = new Map<number, readonly ClientRect[] | null>();
  for (const measurement of input.measurements) {
    if (byIndex.has(measurement.index)) {
      return failedTarget(input);
    }
    byIndex.set(measurement.index, measurement.rects);
  }
  const measured: MeasuredLassoSegment[] = [];
  for (const segment of expected) {
    const rects = byIndex.get(segment.index);
    if (rects === undefined || rects === null || rects.length === 0) {
      return failedTarget(input);
    }
    measured.push(Object.freeze({ index: segment.index, rects: ownRects(rects) }));
  }
  if (byIndex.size !== expected.length) return failedTarget(input);
  const bounds = unionRects(measured.flatMap(({ rects }) => rects));
  if (bounds === null) return failedTarget(input);
  return Object.freeze({
    nodeId: input.nodeId,
    text: input.text,
    bounds,
    measurement: Object.freeze(measured),
  });
}

/**
 * Resolves one loop to either one contiguous address inside one node or a
 * higher-level selection set. Wrapped DOM fragments and adjacent punctuation
 * segments collapse into one range; gaps and multiple nodes stay separate.
 */
export function resolveLassoTargets(
  lasso: PreparedLasso,
  targets: readonly LassoTarget[],
): LassoTargetResolution {
  const textByNodeId: Record<string, string> = {};
  const hits: Array<{ nodeId: string; segmentIndex: number }> = [];
  const candidates: LassoTarget[] = [];

  for (const target of targets) {
    if (!boundsIntersectLasso(target.bounds, lasso)) continue;
    candidates.push(target);
    if (target.measurement === "pending" || target.measurement === "failed") {
      return Object.freeze({ kind: "ambiguous" });
    }
    textByNodeId[target.nodeId] = target.text;
    for (const segment of target.measurement) {
      if (segment.rects.some((rect) => lassoHitsRectFragment(lasso, rect))) {
        hits.push({ nodeId: target.nodeId, segmentIndex: segment.index });
      }
    }
  }

  // A generous loop around exactly one node is still language when that node
  // consists of exactly one punctuation segment. A whole sentence
  // must not be demoted to a reference-only block merely because it fills the
  // authored node.
  if (hits.length === 0 && candidates.length === 1) {
    const target = candidates[0]!;
    if (
      target.measurement !== "pending" &&
      target.measurement !== "failed" &&
      lassoHitsRectFragment(lasso, boundsRect(target.bounds))
    ) {
      const whole = selectionFromSegmentHits(
        { [target.nodeId]: target.text },
        target.measurement.map((segment) => ({
          nodeId: target.nodeId,
          segmentIndex: segment.index,
        })),
      );
      if (whole.ok) {
        const selection = Object.freeze({ ...whole.selection });
        return Object.freeze({
          kind: "selection",
          mode: "contiguous-segment-range",
          selection,
          selections: Object.freeze([selection]),
        });
      }
    }
  }

  if (hits.length === 0) return Object.freeze({ kind: "empty-closed" });
  const selections = selectionsFromSegmentHits(textByNodeId, hits);
  if (selections.length === 0) return Object.freeze({ kind: "ambiguous" });
  const owned = Object.freeze(selections.map((selection) => Object.freeze({ ...selection })));
  return Object.freeze({
    kind: "selection",
    mode: owned.length === 1 ? "contiguous-segment-range" : "selection-set",
    selection: owned[0]!,
    selections: owned,
  });
}

/** Each contiguous run is one passage; two or more runs form selection mode. */
function selectionsFromSegmentHits(
  textByNodeId: Readonly<Record<string, string>>,
  hits: readonly { nodeId: string; segmentIndex: number }[],
): SegmentSelection[] {
  const grouped = new Map<string, number[]>();
  for (const hit of hits) {
    const indices = grouped.get(hit.nodeId) ?? [];
    if (!indices.includes(hit.segmentIndex)) indices.push(hit.segmentIndex);
    grouped.set(hit.nodeId, indices);
  }
  const selections: SegmentSelection[] = [];
  for (const [nodeId, indices] of grouped) {
    const text = textByNodeId[nodeId];
    if (typeof text !== "string") continue;
    const validIndices = new Set(segmentText(text).map((segment) => segment.index));
    const sorted = indices
      .filter((index) => validIndices.has(index))
      .sort((left, right) => left - right);
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const resolved = selectionFromSegmentHits(
        textByNodeId,
        run.map((segmentIndex) => ({ nodeId, segmentIndex })),
      );
      if (resolved.ok) selections.push(Object.freeze({ ...resolved.selection }));
      run = [];
    };
    for (const index of sorted) {
      const previous = run.at(-1);
      if (previous !== undefined && index !== previous + 1) flush();
      run.push(index);
    }
    flush();
  }
  return selections;
}

function boundsRect(bounds: ClientBounds): ClientRect {
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function failedTarget(input: Readonly<{
  nodeId: string;
  text: string;
  rootBounds: ClientBounds;
}>): LassoTarget {
  return Object.freeze({
    nodeId: input.nodeId,
    text: input.text,
    bounds: Object.freeze({ ...input.rootBounds }),
    measurement: "failed",
  });
}

function ownRects(rects: readonly ClientRect[]): readonly ClientRect[] {
  return Object.freeze(rects.map((rect) => Object.freeze({ ...rect })));
}

function unionRects(rects: readonly ClientRect[]): ClientBounds | null {
  const valid = rects.filter(validRect);
  if (valid.length !== rects.length || valid.length === 0) return null;
  return Object.freeze({
    left: Math.min(...valid.map(({ x }) => x)),
    top: Math.min(...valid.map(({ y }) => y)),
    right: Math.max(...valid.map(({ x, width }) => x + width)),
    bottom: Math.max(...valid.map(({ y, height }) => y + height)),
  });
}

function validRect(rect: ClientRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0;
}

function validBounds(bounds: ClientBounds): boolean {
  return [bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) &&
    bounds.right > bounds.left && bounds.bottom > bounds.top;
}

export function boundsIntersectLasso(
  bounds: ClientBounds,
  lasso: PreparedLasso,
): boolean {
  const margin = LASSO_THRESHOLDS.edgeMargin;
  return bounds.right >= lasso.bounds.left - margin &&
    bounds.left <= lasso.bounds.right + margin &&
    bounds.bottom >= lasso.bounds.top - margin &&
    bounds.top <= lasso.bounds.bottom + margin;
}
