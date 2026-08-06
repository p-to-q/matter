import { describe, expect, it } from "vitest";
import { projectNodeHandlePosition } from "./node-handle-position";

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

describe("projectNodeHandlePosition", () => {
  const documentRect = rect(8, 66, 304, 646);

  it("chooses a clear adjacent side within a compact canvas", () => {
    expect(projectNodeHandlePosition({
      coarse: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(270, 312, 34, 300),
      textRect: rect(72, 264, 120, 62),
      toolCount: 2,
    })).toEqual({ left: 204, top: 240 });
  });

  it("uses a third clear position instead of clamping controls over full-width material", () => {
    expect(projectNodeHandlePosition({
      coarse: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: rect(242, 312, 62, 300),
      textRect: rect(20, 264, 272, 62),
      toolCount: 2,
    })).toEqual({ left: 127, top: 142 });
  });

  it("returns null when no side or third position avoids material and guidance", () => {
    expect(projectNodeHandlePosition({
      coarse: true,
      documentRect,
      guidanceRect: rect(24, 676, 180, 14),
      railRect: null,
      textRect: rect(20, 78, 272, 588),
      toolCount: 2,
    })).toBeNull();
  });
});
