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

export type LassoTarget = Readonly<{
  nodeId: string;
  text: string;
  bounds: ClientBounds;
  measurement: "pending" | "failed" | readonly MeasuredLassoSegment[];
}>;

export type LassoTargetResolution =
  | Readonly<{
      kind: "selection";
      selection: SegmentSelection;
      selections: readonly SegmentSelection[];
    }>
  | Readonly<{ kind: "empty-closed" | "ambiguous" }>;

/**
 * Resolves both live success feedback and pointer-up from one measured target
 * snapshot. An intersecting incomplete node makes the whole result ambiguous.
 */
export function resolveLassoTargets(
  lasso: PreparedLasso,
  targets: readonly LassoTarget[],
): LassoTargetResolution {
  const textByNodeId: Record<string, string> = {};
  const hits: Array<{ nodeId: string; segmentIndex: number }> = [];
  const candidateTargets: LassoTarget[] = [];

  for (const target of targets) {
    if (!boundsIntersectLasso(target.bounds, lasso)) continue;
    candidateTargets.push(target);
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

  // A single loose loop around a wrapped text block is an intentional whole
  // block selection even when its individual line probes straddle the stroke.
  // Keep this fallback scoped to one node so adjacent thoughts can never be
  // merged by generous hit geometry.
  if (hits.length === 0 && candidateTargets.length === 1) {
    const target = candidateTargets[0]!;
    if (target.measurement !== "pending" && target.measurement !== "failed" &&
      lassoHitsRectFragment(lasso, {
        x: target.bounds.left,
        y: target.bounds.top,
        width: target.bounds.right - target.bounds.left,
        height: target.bounds.bottom - target.bounds.top,
      })) {
      const segments = selectionFromSegmentHits(
        { [target.nodeId]: target.text },
        target.measurement.map((segment) => ({ nodeId: target.nodeId, segmentIndex: segment.index })),
      );
      if (segments.ok) {
        const selection = Object.freeze({ ...segments.selection });
        return Object.freeze({ kind: "selection", selection, selections: Object.freeze([selection]) });
      }
    }
  }

  const selections = selectionsFromSegmentHits(textByNodeId, hits);
  if (selections.length > 0) {
    return Object.freeze({
      kind: "selection",
      selection: Object.freeze({ ...selections[0] }),
      selections: Object.freeze(selections.map((selection) => Object.freeze({ ...selection }))),
    });
  }
  return Object.freeze({
    kind: hits.length === 0 ? "empty-closed" : "ambiguous",
  });
}

/**
 * Resolves each contiguous run independently. A single loop may therefore
 * address several passages, while gaps inside one passage remain separate
 * selections instead of becoming an accidental replacement range.
 */
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
    const sorted = indices.filter((index) => validIndices.has(index)).sort((left, right) => left - right);
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const result = selectionFromSegmentHits(
        textByNodeId,
        run.map((segmentIndex) => ({ nodeId, segmentIndex })),
      );
      if (result.ok) selections.push(Object.freeze({ ...result.selection }));
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
