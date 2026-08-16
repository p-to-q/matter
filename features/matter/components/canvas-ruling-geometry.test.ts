import { describe, expect, it } from "vitest";
import { projectCanvasRulingGeometry } from "./canvas-ruling-geometry";

describe("projectCanvasRulingGeometry", () => {
  it("shares the desktop material column step and follows camera translation", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      viewport: { x: 42, y: -18, zoom: 1 },
    })).toEqual({ cellHeight: 196, cellWidth: 636, originX: 204, originY: 195 });
  });

  it("scales both the repeating step and its camera origin", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      viewport: { x: -25, y: 31, zoom: 1.5 },
    })).toEqual({ cellHeight: 294, cellWidth: 954, originX: 218, originY: 350.5 });
  });

  it("keeps narrow and compact lanes aligned to their responsive canvas anchors", () => {
    expect(projectCanvasRulingGeometry({
      anchorX: -28,
      cellHeight: 172,
      columnGap: 64,
      columnWidth: 280,
      surfaceHeight: 760,
      surfaceWidth: 374,
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toEqual({ cellHeight: 172, cellWidth: 344, originX: -13, originY: 238.8 });
    expect(projectCanvasRulingGeometry({
      anchorX: -34,
      cellHeight: 160,
      columnGap: 56,
      columnWidth: 236,
      surfaceHeight: 640,
      surfaceWidth: 304,
      viewport: { x: 0, y: 0, zoom: 1 },
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
      viewport: { x: 0, y: 0, zoom: 1 },
    })).toBeNull();
    expect(projectCanvasRulingGeometry({
      anchorX: 0,
      cellHeight: 196,
      columnGap: 116,
      columnWidth: 520,
      surfaceHeight: 700,
      surfaceWidth: 960,
      viewport: { x: 0, y: 0, zoom: Number.NaN },
    })).toBeNull();
  });
});
