import { describe, expect, it } from "vitest";
import { prepareLasso } from "./lasso-geometry";
import { settleLassoSelectionSet } from "./lasso-selection";
import {
  lassoTargetFromMeasurements,
  resolveLassoTargets,
  visibleLassoLayoutNodeIds,
  type LassoTarget,
} from "./lasso-targets";

const lasso = prepareLasso([
  { x: 0, y: 0 },
  { x: 80, y: 0 },
  { x: 80, y: 50 },
  { x: 0, y: 50 },
])!;

function target(overrides: Partial<LassoTarget> = {}): LassoTarget {
  return {
    nodeId: "node_a",
    text: "第一句，第二句。第三句。",
    bounds: { left: 5, top: 5, right: 150, bottom: 45 },
    measurement: [
      { index: 0, rects: [{ x: 10, y: 10, width: 24, height: 12 }] },
      { index: 1, rects: [{ x: 100, y: 10, width: 24, height: 12 }] },
      { index: 2, rects: [{ x: 130, y: 10, width: 24, height: 12 }] },
    ],
    ...overrides,
  };
}

describe("punctuation-bounded lasso target resolution", () => {
  it("snaps one hit to exactly one punctuation segment", () => {
    expect(resolveLassoTargets(lasso, [target()])).toMatchObject({
      kind: "selection",
      mode: "contiguous-segment-range",
      selections: [{ nodeId: "node_a" }],
      selection: {
        type: "segment-range",
        nodeId: "node_a",
        selectedText: "第一句",
      },
    });
  });

  it("allows a whole one-sentence node to remain actionable language", () => {
    expect(resolveLassoTargets(lasso, [target({
      text: "身体怎样保存这种怀念。",
      bounds: { left: 8, top: 8, right: 72, bottom: 42 },
      measurement: [{ index: 0, rects: [{ x: 90, y: 10, width: 20, height: 12 }] }],
    })])).toMatchObject({
      kind: "selection",
      selection: { selectedText: "身体怎样保存这种怀念" },
    });
  });

  it("does not promote the blank between segments to a whole-node selection", () => {
    const blank = prepareLasso([
      { x: 40, y: 0 },
      { x: 90, y: 0 },
      { x: 90, y: 50 },
      { x: 40, y: 50 },
    ])!;
    expect(resolveLassoTargets(blank, [target({
      bounds: { left: 45, top: 5, right: 85, bottom: 45 },
      measurement: [
        { index: 0, rects: [{ x: 5, y: 10, width: 20, height: 12 }] },
        { index: 1, rects: [{ x: 105, y: 10, width: 20, height: 12 }] },
        { index: 2, rects: [{ x: 135, y: 10, width: 20, height: 12 }] },
      ],
    })])).toEqual({ kind: "empty-closed" });
  });

  it("joins adjacent hits and promotes disconnected or cross-node runs to selection mode", () => {
    expect(resolveLassoTargets(lasso, [target({
      measurement: [
        { index: 0, rects: [{ x: 10, y: 10, width: 20, height: 12 }] },
        { index: 1, rects: [{ x: 40, y: 10, width: 20, height: 12 }] },
      ],
    })])).toMatchObject({
      kind: "selection",
      mode: "contiguous-segment-range",
      selection: { nodeId: "node_a", selectedText: "第一句，第二句" },
    });
    expect(resolveLassoTargets(lasso, [target({
      measurement: [
        { index: 0, rects: [{ x: 10, y: 10, width: 20, height: 12 }] },
        { index: 2, rects: [{ x: 40, y: 10, width: 20, height: 12 }] },
      ],
    })])).toMatchObject({
      kind: "selection",
      mode: "selection-set",
      selections: [
        { nodeId: "node_a", selectedText: "第一句" },
        { nodeId: "node_a", selectedText: "第三句" },
      ],
    });
    expect(resolveLassoTargets(lasso, [
      target(),
      target({ nodeId: "node_b", text: "另一句。" }),
    ])).toMatchObject({
      kind: "selection",
      mode: "selection-set",
      selections: [
        { nodeId: "node_a", selectedText: "第一句" },
        { nodeId: "node_b", selectedText: "另一句" },
      ],
    });
  });

  it("keeps empty, pending, and failed measurements distinct", () => {
    expect(resolveLassoTargets(lasso, [target({
      bounds: { left: 100, top: 100, right: 150, bottom: 140 },
    })])).toEqual({ kind: "empty-closed" });
    expect(resolveLassoTargets(lasso, [target({ measurement: "pending" })]))
      .toEqual({ kind: "ambiguous" });
    expect(resolveLassoTargets(lasso, [target({ measurement: "failed" })]))
      .toEqual({ kind: "ambiguous" });
  });

  it("retains a visible all-failed target as ambiguity and recovers all-or-none", () => {
    const rootBounds = { left: 5, top: 5, right: 155, bottom: 45 };
    const allFailed = lassoTargetFromMeasurements({
      nodeId: "node_a",
      text: "第一句，第二句。第三句。",
      rootBounds,
      measurements: [
        { index: 0, rects: null },
        { index: 1, rects: null },
        { index: 2, rects: null },
      ],
    });
    expect(allFailed).toEqual({
      nodeId: "node_a",
      text: "第一句，第二句。第三句。",
      bounds: rootBounds,
      measurement: "failed",
    });
    const prior = Object.freeze([Object.freeze({
      type: "segment-range" as const,
      nodeId: "prior",
      start: 0,
      end: 3,
      selectedText: "旧选择",
    })]);
    const failedResolution = resolveLassoTargets(lasso, [allFailed!]);
    expect(failedResolution).toEqual({ kind: "ambiguous" });
    expect(settleLassoSelectionSet(prior, failedResolution)).toBe(prior);

    const partial = lassoTargetFromMeasurements({
      nodeId: "node_a",
      text: "第一句，第二句。第三句。",
      rootBounds,
      measurements: [
        { index: 0, rects: [{ x: 10, y: 10, width: 20, height: 12 }] },
        { index: 1, rects: null },
        { index: 2, rects: [{ x: 130, y: 10, width: 24, height: 12 }] },
      ],
    });
    expect(partial).toMatchObject({ bounds: rootBounds, measurement: "failed" });
    expect(resolveLassoTargets(lasso, [partial!])).toEqual({ kind: "ambiguous" });

    const recovered = lassoTargetFromMeasurements({
      nodeId: "node_a",
      text: "第一句，第二句。第三句。",
      rootBounds,
      measurements: [
        { index: 0, rects: [{ x: 10, y: 10, width: 20, height: 12 }] },
        { index: 1, rects: [{ x: 40, y: 10, width: 20, height: 12 }] },
        { index: 2, rects: [{ x: 130, y: 10, width: 24, height: 12 }] },
      ],
    });
    expect(recovered).toMatchObject({
      bounds: { left: 10, top: 10, right: 154, bottom: 22 },
      measurement: [{ index: 0 }, { index: 1 }, { index: 2 }],
    });
    expect(resolveLassoTargets(lasso, [recovered!])).toMatchObject({
      kind: "selection",
      mode: "contiguous-segment-range",
      selection: { nodeId: "node_a", selectedText: "第一句，第二句" },
    });
  });
});

describe("pure visible-layout prefilter", () => {
  const boxes = [
    { nodeId: "visible", x: 10, y: 20, width: 40, height: 20 },
    { nodeId: "outside", x: 400, y: 500, width: 40, height: 20 },
  ] as const;

  it("projects non-unit scale and a negative camera-derived canvas origin", () => {
    expect(Array.from(visibleLassoLayoutNodeIds({
      boxes,
      canvasOrigin: { x: -50, y: -20 },
      scale: 2,
      viewport: { left: 0, top: 0, right: 200, bottom: 160 },
    }) ?? [])).toEqual(["visible"]);
  });

  it("retains a node within the shared client-pixel hit margin", () => {
    const margin = 6;
    expect(Array.from(visibleLassoLayoutNodeIds({
      boxes: [{ nodeId: "near", x: 100 + margin - 0.001, y: 10, width: 10, height: 10 }],
      canvasOrigin: { x: 0, y: 0 },
      scale: 1,
      viewport: { left: 0, top: 0, right: 100, bottom: 100 },
    }) ?? [])).toEqual(["near"]);
    expect(Array.from(visibleLassoLayoutNodeIds({
      boxes: [{ nodeId: "far", x: 100 + margin + 0.001, y: 10, width: 10, height: 10 }],
      canvasOrigin: { x: 0, y: 0 },
      scale: 1,
      viewport: { left: 0, top: 0, right: 100, bottom: 100 },
    }) ?? [])).toEqual([]);
  });

  it("fails open on invalid or duplicate layout authority", () => {
    expect(visibleLassoLayoutNodeIds({
      boxes: [...boxes, { ...boxes[0] }],
      canvasOrigin: { x: 0, y: 0 },
      scale: 1,
      viewport: { left: 0, top: 0, right: 100, bottom: 100 },
    })).toBeNull();
    expect(visibleLassoLayoutNodeIds({
      boxes,
      canvasOrigin: { x: 0, y: 0 },
      scale: 0,
      viewport: { left: 0, top: 0, right: 100, bottom: 100 },
    })).toBeNull();
  });
});
