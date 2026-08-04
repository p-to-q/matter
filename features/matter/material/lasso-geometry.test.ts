import { describe, expect, it } from "vitest";
import {
  LASSO_THRESHOLDS,
  analyzeLassoPath,
  lassoClosureIntent,
  lassoHitsRectFragment,
  lassoStrokeQualification,
  pointInPolygon,
  prepareLasso,
  sampleLassoPath,
} from "./lasso-geometry";

const clockwiseSquare = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
] as const;

describe("lasso path preparation", () => {
  it("exports one frozen finite client-pixel contract", () => {
    expect(LASSO_THRESHOLDS).toEqual({
      minimumPointCount: 3,
      minimumPathLength: 24,
      minimumExtent: 6,
      minimumBoundsArea: 64,
      minimumPolygonArea: 36,
      sampleDistance: 4,
      maximumPointCount: 256,
      closureNearDistance: 14,
      closureEarlyArcLength: 12,
      closureMinimumAngleDegrees: 60,
      closureMaximumPathRatio: 0.5,
      closureMaximumBoundsRatio: 0.78,
      edgeMargin: 6,
      probeInsetRatio: 0.25,
      minimumInsideProbeCount: 3,
    });
    expect(Object.isFrozen(LASSO_THRESHOLDS)).toBe(true);
    expect(Object.values(LASSO_THRESHOLDS).every(Number.isFinite)).toBe(true);
  });

  it("samples at the distance threshold while preserving pointer-up", () => {
    const distance = LASSO_THRESHOLDS.sampleDistance;
    expect(sampleLassoPath([
      { x: 0, y: 0 },
      { x: distance - 0.001, y: 0 },
      { x: distance, y: 0 },
      { x: distance + 1, y: 0 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: distance, y: 0 },
      { x: distance + 1, y: 0 },
    ]);
  });

  it("keeps the accepted prefix stable at the cap and reserves only the endpoint slot", () => {
    const raw = Array.from({ length: 400 }, (_, index) => ({ x: index * 4, y: index % 7 }));
    const before = sampleLassoPath(raw.slice(0, 300))!;
    const after = sampleLassoPath(raw)!;
    expect(before).toHaveLength(LASSO_THRESHOLDS.maximumPointCount);
    expect(after).toHaveLength(LASSO_THRESHOLDS.maximumPointCount);
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(before.at(-1)).toEqual(raw[299]);
    expect(after.at(-1)).toEqual(raw.at(-1));
  });

  it("qualifies with path length and two-dimensional bounds rather than point count", () => {
    expect(lassoStrokeQualification([
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 },
    ])).toBe("pending");
    expect(lassoStrokeQualification([
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 },
    ])).toBe("qualified");
    expect(analyzeLassoPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }])).toEqual({
      kind: "uncommitted",
      reason: "linear",
    });
    expect(analyzeLassoPath([{ x: 0, y: 0 }, { x: 7.999, y: 0 }, { x: 7.999, y: 7.999 }, { x: 0, y: 7.999 }])).toEqual({
      kind: "uncommitted",
      reason: "tiny",
    });
    expect(analyzeLassoPath([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]).kind).toBe("prepared");
  });

  it("always adds one explicit closing seam at pointer-up", () => {
    const analysis = analyzeLassoPath(clockwiseSquare);
    expect(analysis.kind).toBe("prepared");
    if (analysis.kind !== "prepared") throw new Error("lasso not prepared");
    expect(analysis.lasso.points).toEqual([...clockwiseSquare, clockwiseSquare[0]]);
    expect(analysis.lasso.points[0]).toEqual(analysis.lasso.points.at(-1));
    expect(analysis.lasso.area).toBe(400);
  });

  it("requires proximity or a turned, proportionate early-release chord", () => {
    const threeSides = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const twoSides = threeSides.slice(0, 3);
    expect(lassoClosureIntent(threeSides)).toBe(true);
    expect(lassoClosureIntent([...threeSides].reverse())).toBe(true);
    expect(lassoClosureIntent(twoSides)).toBe(false);
    expect(analyzeLassoPath(twoSides)).toEqual({ kind: "uncommitted", reason: "open" });
  });

  it("uses an exact near-start threshold without making large open paths permissive", () => {
    const pathTo = (gap: number) => [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: gap, y: 0 },
    ];
    expect(lassoClosureIntent(pathTo(13.999))).toBe(true);
    expect(lassoClosureIntent(pathTo(14.001))).toBe(false);
    expect(lassoClosureIntent([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 1000, y: 500 },
    ])).toBe(false);
  });

  it("uses a 60 degree turn from a 12px interpolated early direction", () => {
    const endpoint = (degrees: number) => {
      const radians = degrees * Math.PI / 180;
      return { x: 20 * Math.cos(radians), y: 20 * Math.sin(radians) };
    };
    const pathAt = (degrees: number) => [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      endpoint(degrees),
    ];
    expect(lassoClosureIntent(pathAt(59.999))).toBe(false);
    expect(lassoClosureIntent(pathAt(60))).toBe(true);
  });

  it("keeps a maximum-density round stroke bounded and selectable", () => {
    const points = Array.from({ length: LASSO_THRESHOLDS.maximumPointCount }, (_, index) => {
      const angle = index / (LASSO_THRESHOLDS.maximumPointCount - 1) * Math.PI * 2;
      return { x: 100 + Math.cos(angle) * 80, y: 100 + Math.sin(angle) * 60 };
    });
    expect(analyzeLassoPath(points).kind).toBe("prepared");
  });

  it("distinguishes self-intersecting and overlapping topology from an open failure", () => {
    expect(analyzeLassoPath([
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 20, y: 0 },
    ])).toEqual({ kind: "ambiguous", reason: "self-intersection" });
    expect(analyzeLassoPath([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 20, y: 20 },
    ])).toEqual({ kind: "ambiguous", reason: "self-intersection" });
    expect(prepareLasso(clockwiseSquare)).not.toBeNull();
  });

  it("rejects non-finite coordinates without throwing", () => {
    expect(analyzeLassoPath([{ x: Number.NaN, y: 0 }])).toEqual({
      kind: "uncommitted",
      reason: "invalid",
    });
    expect(prepareLasso([{ x: 0, y: 0 }, { x: Infinity, y: 1 }, { x: 2, y: 0 }])).toBeNull();
  });

  it("owns immutable copies rather than caller aliases", () => {
    const source: Array<{ x: number; y: number }> = clockwiseSquare.map((point) => ({ ...point }));
    const prepared = prepareLasso(source)!;
    source[0]!.x = 999;
    expect(prepared.points[0]).toEqual({ x: 0, y: 0 });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.points)).toBe(true);
    expect(prepared.points.every(Object.isFrozen)).toBe(true);
  });
});

describe("polygon topology", () => {
  const closed = [...clockwiseSquare, clockwiseSquare[0]];

  it("is independent of clockwise or counter-clockwise winding", () => {
    const reverse = [...clockwiseSquare].reverse();
    reverse.push(reverse[0]!);
    expect(pointInPolygon({ x: 10, y: 10 }, closed)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 10 }, reverse)).toBe(true);
    expect(pointInPolygon({ x: 21, y: 10 }, closed)).toBe(false);
  });

  it("handles concavity and considers the exact boundary inside", () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 10, y: 10 },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ];
    expect(pointInPolygon({ x: 5, y: 10 }, concave)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 15 }, concave)).toBe(false);
    expect(pointInPolygon({ x: 15, y: 15 }, concave)).toBe(true);
  });

  it("requires explicit closure and finite geometry", () => {
    expect(pointInPolygon({ x: 10, y: 10 }, clockwiseSquare)).toBe(false);
    expect(pointInPolygon({ x: Number.NaN, y: 0 }, closed)).toBe(false);
  });
});

describe("text fragment hit predicate", () => {
  const lasso = prepareLasso(clockwiseSquare)!;

  it("accepts a center inside or immediately within the forgiving margin", () => {
    expect(lassoHitsRectFragment(lasso, { x: 4, y: 4, width: 12, height: 4 })).toBe(true);
    const margin = LASSO_THRESHOLDS.edgeMargin;
    expect(lassoHitsRectFragment(lasso, { x: 20 + margin - 0.001, y: 9, width: 0.002, height: 2 })).toBe(true);
    expect(lassoHitsRectFragment(lasso, { x: 20 + margin + 0.001, y: 9, width: 0.002, height: 2 })).toBe(false);
  });

  it("accepts substantial enclosure through at least three of five inset probes", () => {
    expect(lassoHitsRectFragment(lasso, { x: -15, y: 4, width: 40, height: 12 })).toBe(true);
  });

  it("does not select merely because a large fragment edge overlaps", () => {
    expect(lassoHitsRectFragment(lasso, { x: 19, y: 8, width: 50, height: 4 })).toBe(false);
  });

  it("rejects invalid, empty and non-finite fragments", () => {
    for (const rect of [
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0, y: 0, width: -1, height: 1 },
      { x: 0, y: 0, width: 1, height: Number.NaN },
      { x: Number.POSITIVE_INFINITY, y: 0, width: 1, height: 1 },
    ]) {
      expect(lassoHitsRectFragment(lasso, rect)).toBe(false);
    }
  });
});
