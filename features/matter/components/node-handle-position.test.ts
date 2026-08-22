import { describe, expect, it } from "vitest";
import { CORNER_GLYPH_DESCENT, projectNodeHandleMetrics, projectNodeHandlePosition } from "./node-handle-position";

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});
const metricsFor = (inkHeight: number, coarse: boolean) => projectNodeHandleMetrics({ inkHeight, coarse });

describe("projectNodeHandleMetrics", () => {
  it("keeps root-sized material at the base control size", () => {
    expect(metricsFor(26, false)).toEqual({ button: 44, gap: 6, paddingX: 12, paddingY: 11 });
  });

  it("shrinks the field for smaller material", () => {
    expect(metricsFor(20, false)).toEqual({ button: 34, gap: 5, paddingX: 9, paddingY: 8 });
  });

  it("never grows past the base size for larger material", () => {
    expect(metricsFor(64, false).button).toBe(44);
  });

  it("holds the coarse-pointer target floor however small the material is", () => {
    expect(metricsFor(8, true).button).toBe(48);
  });

  it("holds the fine-pointer target floor however small the material is", () => {
    expect(metricsFor(8, false).button).toBe(32);
  });

  it("treats an unmeasurable line as base sized rather than collapsing", () => {
    expect(metricsFor(0, false).button).toBe(44);
    expect(metricsFor(Number.NaN, false).button).toBe(44);
  });
});

describe("projectNodeHandlePosition", () => {
  const documentRect = rect(8, 66, 304, 646);
  const coarseBase = metricsFor(26, true);

  it("sets the field at the material's upper-left corner", () => {
    expect(projectNodeHandlePosition({
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(270, 312, 34, 300),
      textRect: rect(72, 264, 120, 62),
      toolCount: 2,
      metrics: coarseBase,
    })).toEqual({ left: 30, top: 211, relation: "corner", materialCorner: { x: 42, y: 53 } });
  });

  it("keeps a full-width passage's field inside the paper inset", () => {
    expect(projectNodeHandlePosition({
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(242, 312, 62, 300),
      textRect: rect(20, 264, 272, 62),
      toolCount: 2,
      metrics: coarseBase,
    })).toEqual({ left: 20, top: 211, relation: "corner", materialCorner: { x: 0, y: 53 } });
  });

  it("lets the glyphs rest on the first line by exactly the authorised descent", () => {
    const placement = projectNodeHandlePosition({
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(270, 312, 34, 300),
      textRect: rect(72, 264, 120, 62),
      toolCount: 2,
      metrics: coarseBase,
    });
    const height = coarseBase.button + coarseBase.paddingY * 2;
    const glyphBottom = placement!.top + height - coarseBase.paddingY;
    expect(glyphBottom - 264).toBe(CORNER_GLYPH_DESCENT);
  });

  it("returns null when no side or third position avoids material and guidance", () => {
    expect(projectNodeHandlePosition({
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: null,
      textRect: rect(20, 78, 272, 588),
      toolCount: 2,
      metrics: coarseBase,
    })).toBeNull();
  });

  it("keeps the field at the corner of a short ink line", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 900, 700),
      guidanceRect: rect(28, 650, 200, 20),
      railRect: rect(820, 200, 60, 300),
      textRect: rect(300, 240, 156, 32),
      toolCount: 2,
      metrics: metricsFor(32, false),
    })).toEqual({ left: 261, top: 191, relation: "corner", materialCorner: { x: 39, y: 49 } });
  });

  it("keeps a clamped paper-edge corner addressable within the visual outset", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(0, 240, 156, 26),
      toolCount: 1,
      metrics: metricsFor(26, false),
    })).toEqual({ left: 12, top: 191, relation: "corner", materialCorner: { x: -12, y: 49 } });
  });

  it("publishes the measured corner again when one action is clamped at the opposite edge", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(460, 240, 40, 26),
      toolCount: 1,
      metrics: metricsFor(26, false),
    })).toEqual({ left: 420, top: 191, relation: "corner", materialCorner: { x: 40, y: 49 } });
  });

  it("fits beside material near the paper inset once the field is sized to it", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 90, 460, 20),
      toolCount: 2,
      metrics: metricsFor(20, false),
    })).toEqual({ left: 12, top: 54, relation: "corner", materialCorner: { x: 8, y: 36 } });
  });

  it("uses the corner placement when a wide line is near the bottom edge", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 440, 460, 20),
      toolCount: 2,
      metrics: metricsFor(20, false),
    })).toEqual({ left: 12, top: 404, relation: "corner", materialCorner: { x: 8, y: 36 } });
  });

  it("marks a below-material fallback as detached so its fog stays direction-neutral", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(100, 20, 100, 20),
      toolCount: 2,
      metrics: metricsFor(26, false),
    })).toEqual({ left: 61, top: 54, relation: "detached", materialCorner: null });
  });
});
