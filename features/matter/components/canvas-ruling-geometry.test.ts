import { describe, expect, it } from "vitest";
import {
  advanceCanvasRulingOffset,
  projectCanvasRulingGeometry,
} from "./canvas-ruling-geometry";

describe("projectCanvasRulingGeometry", () => {
  it("shares the desktop material column step and follows camera translation", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      offset: { x: 42, y: -18 },
    })).toEqual({ cellHeight: 196, cellWidth: 636, originX: 204, originY: 195 });
  });

  it("keeps the paper step fixed when material zoom is projected elsewhere", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      offset: { x: -25, y: 31 },
    })).toEqual({ cellHeight: 196, cellWidth: 636, originX: 137, originY: 244 });
  });

  it("keeps narrow and compact lanes aligned to their responsive canvas anchors", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: -28,
      cellHeight: 172,
      columnGap: 64,
      columnWidth: 280,
      surfaceHeight: 760,
      surfaceWidth: 374,
      offset: { x: 0, y: 0 },
    })).toEqual({ cellHeight: 172, cellWidth: 344, originX: -13, originY: 238.8 });
    expect(projectCanvasRulingGeometry({
      anchorX: -34,
      cellHeight: 160,
      columnGap: 56,
      columnWidth: 236,
      surfaceHeight: 640,
      surfaceWidth: 304,
      offset: { x: 0, y: 0 },
    })).toEqual({ cellHeight: 160, cellWidth: 292, originX: -28, originY: 187.2 });
  });

  it("fails closed for invalid surface or camera values", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 0,
      surfaceWidth: 960,
      offset: { x: 0, y: 0 },
    })).toBeNull();
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      offset: { x: 0, y: Number.NaN },
    })).toBeNull();
  });

  it("advances only for pan and ignores the focal translation produced by zoom", () => {
    const initial = Object.freeze({ x: 18, y: -7 });
    expect(advanceCanvasRulingOffset(
      initial,
      { x: 0, y: 0, zoom: 1 },
      { x: 64, y: 38, zoom: 1 },
    )).toEqual({ x: 82, y: 31 });
    expect(advanceCanvasRulingOffset(
      initial,
      { x: 64, y: 38, zoom: 1 },
      { x: -4, y: -19, zoom: 1.2 },
    )).toBe(initial);
  });
});
