import { describe, expect, it } from "vitest";
import { projectNodeHandlePosition } from "./node-handle-position";

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

describe("projectNodeHandlePosition", () => {
  const documentRect = rect(8, 66, 304, 646);

  it("places the compact action field above the material's left edge", () => {
    expect(projectNodeHandlePosition({
      largeTargets: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(270, 312, 34, 300),
      textRect: rect(72, 264, 120, 62),
      toolCount: 2,
    })).toEqual({ left: 54, top: 168 });
  });

  it("keeps a full-width passage's field inside the paper inset", () => {
    expect(projectNodeHandlePosition({
      largeTargets: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(242, 312, 62, 300),
      textRect: rect(20, 264, 272, 62),
      toolCount: 2,
    })).toEqual({ left: 20, top: 168 });
  });

  it("returns null when no side or third position avoids material and guidance", () => {
    expect(projectNodeHandlePosition({
      largeTargets: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: null,
      textRect: rect(20, 78, 272, 588),
      toolCount: 2,
    })).toBeNull();
  });

  it("keeps the field above-left of a short ink line", () => {
    expect(projectNodeHandlePosition({
      largeTargets: false,
      documentRect: rect(0, 0, 900, 700),
      guidanceRect: rect(28, 650, 200, 20),
      railRect: rect(820, 200, 60, 300),
      textRect: rect(300, 240, 156, 32),
      toolCount: 2,
    })).toEqual({ left: 282, top: 148 });
  });

  it("rejects an above placement inside the paper inset and falls below", () => {
    expect(projectNodeHandlePosition({
      largeTargets: false,
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 90, 460, 20),
      toolCount: 2,
    })).toEqual({ left: 12, top: 124 });
  });

  it("uses the safe above placement when a wide line is near the bottom edge", () => {
    expect(projectNodeHandlePosition({
      largeTargets: false,
      documentRect: rect(0, 0, 500, 500),
      guidanceRect: null,
      railRect: null,
      textRect: rect(20, 440, 460, 20),
      toolCount: 2,
    })).toEqual({ left: 12, top: 348 });
  });
});
