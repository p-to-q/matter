import { describe, expect, it } from "vitest";
import { projectPointTalkPlacement } from "./point-talk-placement";

describe("Point-and-Talk placement", () => {
  const viewport = { left: 0, top: 0, right: 390, bottom: 844 };
  const bubble = { width: 312, height: 44 };

  it("aligns to the addressed material's upper-left edge", () => {
    expect(projectPointTalkPlacement({
      target: { left: 40, top: 220, right: 250, bottom: 270 },
      bubble,
      viewport,
    })).toEqual({ left: 40, top: 168 });
  });

  it("keeps the upper-left attachment near the lower visual edge", () => {
    expect(projectPointTalkPlacement({
      target: { left: 40, top: 780, right: 250, bottom: 820 },
      bubble,
      viewport,
    })).toEqual({ left: 40, top: 728 });
  });

  it("clamps against an offset visual viewport after keyboard resizing", () => {
    expect(projectPointTalkPlacement({
      target: { left: 445, top: 170, right: 530, bottom: 210 },
      bubble: { width: 300, height: 58 },
      viewport: { left: 120, top: 80, right: 520, bottom: 430 },
    })).toEqual({ left: 208, top: 104 });
  });

  it("keeps an oversized surface at the leading inset as a best effort", () => {
    expect(projectPointTalkPlacement({
      target: { left: 30, top: 40, right: 60, bottom: 60 },
      bubble: { width: 420, height: 900 },
      viewport,
    })).toEqual({ left: 12, top: 12 });
  });

  it("fails closed for damaged geometry", () => {
    expect(projectPointTalkPlacement({
      target: { left: Number.NaN, top: 0, right: 20, bottom: 20 },
      bubble,
      viewport,
    })).toBeNull();
  });
});
