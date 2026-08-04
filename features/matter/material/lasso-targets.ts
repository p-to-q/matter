import {
  LASSO_THRESHOLDS,
  lassoHitsRectFragment,
  type ClientBounds,
  type ClientRect,
  type PreparedLasso,
} from "./lasso-geometry";
import {
  selectionFromSegmentHits,
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
  | Readonly<{ kind: "selection"; selection: SegmentSelection }>
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

  for (const target of targets) {
    if (!boundsIntersectLasso(target.bounds, lasso)) continue;
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

  const selected = selectionFromSegmentHits(textByNodeId, hits);
  if (selected.ok) {
    return Object.freeze({
      kind: "selection",
      selection: Object.freeze({ ...selected.selection }),
    });
  }
  return Object.freeze({
    kind: hits.length === 0 ? "empty-closed" : "ambiguous",
  });
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
