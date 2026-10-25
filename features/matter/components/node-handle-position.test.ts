import { describe, expect, it } from "vitest";
import { CORNER_ACTION_OVERLAP, projectNodeHandleMetrics, projectNodeHandlePosition } from "./node-handle-position";

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});
const metricsFor = (coarse: boolean) => projectNodeHandleMetrics({ coarse });

describe("projectNodeHandleMetrics", () => {
  it("keeps fine-pointer controls at one fixed screen size", () => {
    expect(metricsFor(false)).toEqual({ button: 44, gap: 6, paddingX: 12, paddingY: 11 });
  });

  it("keeps coarse-pointer and compact controls at one fixed screen size", () => {
    expect(metricsFor(true)).toEqual({
      button: 48,
      gap: 6,
      paddingX: 12,
      paddingY: 11,
    });
  });

  it("publishes immutable metrics", () => {
    expect(Object.isFrozen(metricsFor(false))).toBe(true);
    expect(Object.isFrozen(metricsFor(true))).toBe(true);
  });
});

describe("projectNodeHandlePosition", () => {
  const documentRect = rect(8, 66, 304, 646);
  const coarseBase = metricsFor(true);

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

  it.each([8, 20, 26, 64])("keeps three fine-pointer controls fixed beside %ipx ink", (inkHeight) => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 900, 700),
      guidanceRect: null,
      railRect: null,
      textRect: rect(300, 240, 156, inkHeight),
      toolCount: 3,
      metrics: metricsFor(false),
    })).toEqual({ left: 261, top: 191, relation: "corner", materialCorner: { x: 39, y: 49 } });
  });

  it("suppresses the fixed-size controls rather than shrinking into narrow paper", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 180, 700),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 240, 140, 8),
      toolCount: 3,
      metrics: metricsFor(false),
    })).toBeNull();
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

  it.each([false, true])("retains exactly 6px of corner button-box contact (coarse: %s)", (coarse) => {
    const metrics = metricsFor(coarse);
    const placement = projectNodeHandlePosition({
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(270, 312, 34, 300),
      textRect: rect(72, 264, 120, 62),
      toolCount: 2,
      metrics,
    });
    const height = metrics.button + metrics.paddingY * 2;
    const buttonBottom = placement!.top + height - metrics.paddingY;
    expect(buttonBottom - 264).toBe(CORNER_ACTION_OVERLAP);
    expect(placement!.materialCorner!.y).toBe(height - metrics.paddingY - CORNER_ACTION_OVERLAP);
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
      metrics: metricsFor(false),
    })).toEqual({ left: 261, top: 191, relation: "corner", materialCorner: { x: 39, y: 49 } });
  });

  it("keeps a clamped paper-edge corner addressable within the visual outset", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(0, 240, 156, 26),
      toolCount: 1,
      metrics: metricsFor(false),
    })).toEqual({ left: 12, top: 191, relation: "corner", materialCorner: { x: -12, y: 49 } });
  });

  it("publishes the measured corner again when one action is clamped at the opposite edge", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(460, 240, 40, 26),
      toolCount: 1,
      metrics: metricsFor(false),
    })).toEqual({ left: 420, top: 191, relation: "corner", materialCorner: { x: 40, y: 49 } });
  });

  it("keeps the fixed-size field beside smaller material near the paper inset", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 90, 460, 20),
      toolCount: 2,
      metrics: metricsFor(false),
    })).toEqual({ left: 12, top: 41, relation: "corner", materialCorner: { x: 8, y: 49 } });
  });

  it("uses the corner placement when a wide line is near the bottom edge", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 440, 460, 20),
      toolCount: 2,
      metrics: metricsFor(false),
    })).toEqual({ left: 12, top: 391, relation: "corner", materialCorner: { x: 8, y: 49 } });
  });

  it("marks a below-material fallback as detached so its fog stays direction-neutral", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(100, 20, 100, 20),
      toolCount: 2,
      metrics: metricsFor(false),
    })).toEqual({ left: 61, top: 54, relation: "detached", materialCorner: null });
  });

  it("uses the detached fallback when bounded corner contact cannot fit inside the paper", () => {
    expect(projectNodeHandlePosition({
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(100, 50, 100, 20),
      toolCount: 3,
      metrics: metricsFor(false),
    })).toEqual({ left: 61, top: 84, relation: "detached", materialCorner: null });
  });
});
