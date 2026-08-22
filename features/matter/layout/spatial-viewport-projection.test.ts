import { describe, expect, it } from "vitest";
import type { ColumnarLayout, LayoutBox } from "./model";
import {
  projectSpatialViewport,
  type ScreenPaperViewport,
  type SpatialViewportBasis,
  type TransientViewportPinLease,
} from "./spatial-viewport-projection";

const BASIS: SpatialViewportBasis = Object.freeze({ documentEpoch: 4, layoutEpoch: 7 });
const SCREEN: ScreenPaperViewport = Object.freeze({ x: 400, y: 400, width: 200, height: 100 });

function box(nodeId: string, x: number, y: number, width = 20, height = 20): LayoutBox {
  return Object.freeze({
    depth: 0,
    height,
    nodeId,
    parentId: null,
    subtreeHeight: height,
    width,
    x,
    y,
  });
}

function layout(inputBoxes: readonly LayoutBox[], layoutEpoch = BASIS.layoutEpoch): ColumnarLayout {
  if (inputBoxes.length === 0) {
    return Object.freeze({
      bounds: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }),
      boxes: Object.freeze([]),
      edges: Object.freeze([]),
      layoutEpoch,
    });
  }
  const left = Math.min(...inputBoxes.map(({ x }) => x));
  const top = Math.min(...inputBoxes.map(({ y }) => y));
  const right = Math.max(...inputBoxes.map((item) => item.x + item.width));
  const bottom = Math.max(...inputBoxes.map((item) => item.y + item.height));
  return Object.freeze({
    bounds: Object.freeze({ x: left, y: top, width: right - left, height: bottom - top }),
    boxes: Object.freeze([...inputBoxes]),
    edges: Object.freeze([]),
    layoutEpoch,
  });
}

function lease(
  ownerId: string,
  ids: readonly string[],
  override: Partial<TransientViewportPinLease> = {},
): TransientViewportPinLease {
  return Object.freeze({
    documentEpoch: BASIS.documentEpoch,
    ids: Object.freeze([...ids]),
    layoutEpoch: BASIS.layoutEpoch,
    ownerId,
    ...override,
  });
}

function project(input: Readonly<{
  basis?: SpatialViewportBasis;
  boxes?: readonly LayoutBox[];
  cameraZoom?: number;
  nodeIds?: readonly string[];
  pinLeases?: readonly TransientViewportPinLease[];
  screen?: ScreenPaperViewport;
}> = {}) {
  const boxes = input.boxes ?? Object.freeze([
    box("before", 100, 120),
    box("visible", 200, 180),
    box("after", 380, 300),
    box("far", 900, 900),
  ]);
  return projectSpatialViewport({
    cameraZoom: input.cameraZoom ?? 2,
    completePreorderNodeIds: input.nodeIds ?? Object.freeze(boxes.map(({ nodeId }) => nodeId)),
    expectedBasis: input.basis ?? BASIS,
    layout: layout(boxes, input.basis?.layoutEpoch ?? BASIS.layoutEpoch),
    pinLeases: input.pinLeases ?? Object.freeze([]),
    screenPaperViewport: input.screen ?? SCREEN,
  });
}

describe("projectSpatialViewport", () => {
  it("converts clamped screen overscan through zoom and includes touching boundaries", () => {
    const result = project();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);

    // screen / 2 => world { 200, 200, 100, 50 }; min screen overscan
    // 160 / 2 => 80 world pixels on each axis.
    expect(result.projection.expandedWorldViewport).toEqual({
      x: 120,
      y: 120,
      width: 260,
      height: 210,
    });
    expect(result.projection.nodeIds).toEqual(["before", "visible", "after"]);
  });

  it.each([
    [100, 160],
    [600, 300],
    [1_200, 480],
  ])("clamps %spx screen axes to %spx overscan", (axis, overscan) => {
    const result = project({
      boxes: Object.freeze([]),
      nodeIds: Object.freeze([]),
      cameraZoom: 1,
      screen: Object.freeze({ x: 0, y: 0, width: axis, height: axis }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.expandedWorldViewport).toEqual({
      x: -overscan,
      y: -overscan,
      width: axis + overscan * 2,
      height: axis + overscan * 2,
    });
  });

  it("unions valid offscreen pins and filters the result through complete preorder", () => {
    const result = project({
      pinLeases: Object.freeze([
        lease("focus", ["far", "before"]),
        lease("selection", ["after", "far", "far"]),
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.nodeIds).toEqual(["before", "visible", "after", "far"]);
    expect(result.projection.pinnedNodeIds).toEqual(["before", "after", "far"]);
    expect(result.projection.validPinOwnerIds).toEqual(["focus", "selection"]);
    expect(result.projection.invalidPinOwners).toEqual([]);
  });

  it("invalidates a stale or unknown owner atomically without blanking visible material", () => {
    const result = project({
      pinLeases: Object.freeze([
        lease("old-document", ["far"], { documentEpoch: 3 }),
        lease("old-layout", ["far"], { layoutEpoch: 6 }),
        lease("deleted-target", ["before", "deleted"]),
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.nodeIds).toEqual(["before", "visible", "after"]);
    expect(result.projection.pinnedNodeIds).toEqual([]);
    expect(result.projection.invalidPinOwners).toEqual([
      { code: "STALE_DOCUMENT_EPOCH", ownerId: "old-document" },
      { code: "STALE_LAYOUT_EPOCH", ownerId: "old-layout" },
      { code: "UNKNOWN_PIN_ID", nodeId: "deleted", ownerId: "deleted-target" },
    ]);
  });

  it("rejects duplicate owner identity rather than merging unrelated authority", () => {
    const result = project({
      pinLeases: Object.freeze([
        lease("camera", ["before"]),
        lease("camera", ["far"]),
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.pinnedNodeIds).toEqual([]);
    expect(result.projection.invalidPinOwners).toEqual([
      { code: "DUPLICATE_OWNER_ID", ownerId: "camera" },
    ]);
  });

  it("reports malformed transient owners without admitting any of their ids", () => {
    const result = project({
      pinLeases: Object.freeze([
        lease("", ["far"]),
        lease("empty", []),
        lease("invalid-id", [""]),
        lease("invalid-epoch", ["far"], { documentEpoch: -1 }),
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.pinnedNodeIds).toEqual([]);
    expect(result.projection.invalidPinOwners).toEqual([
      { code: "INVALID_OWNER_ID", ownerId: "" },
      { code: "EMPTY_PIN_IDS", ownerId: "empty" },
      { code: "INVALID_PIN_ID", ownerId: "invalid-id" },
      { code: "INVALID_EPOCH", ownerId: "invalid-epoch" },
    ]);
  });

  it("fails closed on stale global layout authority", () => {
    const result = projectSpatialViewport({
      cameraZoom: 1,
      completePreorderNodeIds: Object.freeze([]),
      expectedBasis: BASIS,
      layout: layout([], BASIS.layoutEpoch - 1),
      pinLeases: Object.freeze([]),
      screenPaperViewport: SCREEN,
    });
    expect(result).toEqual({ ok: false, error: { code: "STALE_LAYOUT_BASIS" } });
  });

  it("fails closed on an invalid current basis before reconciling owners", () => {
    expect(project({ basis: Object.freeze({ ...BASIS, documentEpoch: -1 }) })).toEqual({
      ok: false,
      error: { code: "INVALID_EXPECTED_BASIS" },
    });
  });

  it.each([
    ["zero viewport width", { screen: Object.freeze({ ...SCREEN, width: 0 }) }],
    ["non-finite viewport", { screen: Object.freeze({ ...SCREEN, x: Number.NaN }) }],
    ["zero zoom", { cameraZoom: 0 }],
    ["non-finite zoom", { cameraZoom: Number.POSITIVE_INFINITY }],
    ["world conversion overflow", { cameraZoom: Number.MIN_VALUE }],
  ])("fails closed on invalid screen geometry: %s", (_label, override) => {
    expect(project(override).ok).toBe(false);
  });

  it.each([
    ["zero width", box("bad", 0, 0, 0, 20)],
    ["zero height", box("bad", 0, 0, 20, 0)],
    ["non-finite coordinate", box("bad", Number.NaN, 0)],
    ["overflow", box("bad", Number.MAX_VALUE, 0, Number.MAX_VALUE, 20)],
  ])("fails closed on an invalid layout rect: %s", (_label, invalidBox) => {
    const result = project({ boxes: Object.freeze([invalidBox]), nodeIds: Object.freeze(["bad"]) });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_LAYOUT_BOX" } });
  });

  it("rejects missing, duplicate, or reordered complete preorder identity", () => {
    expect(project({ nodeIds: Object.freeze(["before"]) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMPLETE_PREORDER" },
    });
    expect(project({ nodeIds: Object.freeze(["before", "visible", "after", "after"]) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMPLETE_PREORDER" },
    });
    expect(project({ nodeIds: Object.freeze(["visible", "before", "after", "far"]) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_LAYOUT_BOX", index: 0 },
    });
  });

  it("accepts empty complete layout while explicitly invalidating an unknown pin owner", () => {
    const result = project({
      boxes: Object.freeze([]),
      nodeIds: Object.freeze([]),
      pinLeases: Object.freeze([lease("focus", ["deleted"])]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.boxes).toEqual([]);
    expect(result.projection.nodeIds).toEqual([]);
    expect(result.projection.invalidPinOwners).toEqual([
      { code: "UNKNOWN_PIN_ID", nodeId: "deleted", ownerId: "focus" },
    ]);
  });

  it("does not impose a correctness-truncating runtime node cap", () => {
    const many = Object.freeze(Array.from({ length: 4_257 }, (_, index) =>
      box(`node-${index}`, index, 0, 1, 1)));
    const result = project({
      boxes: many,
      cameraZoom: 1,
      screen: Object.freeze({ x: 0, y: 0, width: 5_000, height: 100 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.projection.nodeIds).toHaveLength(4_257);
  });

  it("keeps inputs untouched and publishes frozen membership", () => {
    const boxes = Object.freeze([box("visible", 200, 180), box("far", 900, 900)]);
    const pins = Object.freeze([lease("focus", ["far"])]);
    const before = JSON.stringify({ boxes, pins, screen: SCREEN });
    const result = project({ boxes, pinLeases: pins });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(JSON.stringify({ boxes, pins, screen: SCREEN })).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.projection)).toBe(true);
    expect(Object.isFrozen(result.projection.boxes)).toBe(true);
    expect(Object.isFrozen(result.projection.nodeIds)).toBe(true);
    expect(Object.isFrozen(result.projection.pinnedNodeIds)).toBe(true);
    expect(Object.isFrozen(result.projection.invalidPinOwners)).toBe(true);
  });
});
