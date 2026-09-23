import { describe, expect, it } from "vitest";
import {
  excludePointTalkRightOccluder,
  intersectPointTalkBounds,
  projectPointTalkPlacement,
  projectPointTalkPlacementWithinSurfaces,
  projectPointTalkScale,
} from "./point-talk-placement";

describe("Point-and-Talk visual scale", () => {
  it("follows canvas zoom through one bounded optical response", () => {
    expect(projectPointTalkScale(.6)).toBe(.74);
    expect(projectPointTalkScale(1)).toBe(1);
    expect(projectPointTalkScale(1.25)).toBe(1.035);
    expect(projectPointTalkScale(1.8)).toBe(1.1);
  });

  it("falls back to the canonical scale for damaged zoom", () => {
    expect(projectPointTalkScale(Number.NaN)).toBe(1);
    expect(projectPointTalkScale(0)).toBe(1);
  });
});

describe("Point-and-Talk visible field", () => {
  it("excludes both clipped paper and translated index space", () => {
    expect(intersectPointTalkBounds(
      { left: 0, top: 0, right: 1280, bottom: 800 },
      { left: 304, top: 12, right: 1268, bottom: 788 },
      { left: 356, top: 12, right: 1320, bottom: 788 },
    )).toEqual({ left: 356, top: 12, right: 1268, bottom: 788 });
  });

  it("fails closed when surfaces do not share a visible field", () => {
    expect(intersectPointTalkBounds(
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 100, top: 0, right: 200, bottom: 100 },
    )).toBeNull();
  });

  it("reserves a visible right-side instrument lane", () => {
    expect(excludePointTalkRightOccluder(
      { left: 12, top: 12, right: 363, bottom: 655 },
      { left: 303, top: 216, right: 363, bottom: 504 },
    )).toEqual({ left: 12, top: 12, right: 303, bottom: 655 });
  });

  it("ignores an occluder outside the horizontal field and rejects damaged input", () => {
    const viewport = { left: 12, top: 12, right: 363, bottom: 655 };
    expect(excludePointTalkRightOccluder(
      viewport,
      { left: 380, top: 10, right: 420, bottom: 500 },
    )).toEqual(viewport);
    expect(excludePointTalkRightOccluder(
      viewport,
      { left: Number.NaN, top: 10, right: 420, bottom: 500 },
    )).toBeNull();
  });
});

describe("Point-and-Talk placement", () => {
  const viewport = { left: 0, top: 0, right: 390, bottom: 844 };
  const bubble = { width: 264, height: 38 };

  it("aligns to the addressed material's upper-left edge", () => {
    expect(projectPointTalkPlacement({
      target: { left: 40, top: 220, right: 250, bottom: 270 },
      bubble,
      viewport,
    })).toEqual({ left: 40, maxWidth: 366, top: 168 });
  });

  it("keeps the upper-left attachment near the lower visual edge", () => {
    expect(projectPointTalkPlacement({
      target: { left: 40, top: 780, right: 250, bottom: 820 },
      bubble,
      viewport,
    })).toEqual({ left: 40, maxWidth: 366, top: 728 });
  });

  it("clamps against an offset visual viewport after keyboard resizing", () => {
    expect(projectPointTalkPlacement({
      target: { left: 445, top: 170, right: 530, bottom: 210 },
      bubble: { width: 300, height: 58 },
      viewport: { left: 120, top: 80, right: 520, bottom: 430 },
    })).toEqual({ left: 208, maxWidth: 376, top: 98 });
  });

  it("keeps an oversized surface at the leading inset as a best effort", () => {
    expect(projectPointTalkPlacement({
      target: { left: 30, top: 40, right: 60, bottom: 60 },
      bubble: { width: 420, height: 900 },
      viewport,
    })).toEqual({ left: 12, maxWidth: 366, top: 12 });
  });

  it("fails closed when the visible material cannot preserve usable controls", () => {
    expect(projectPointTalkPlacement({
      target: { left: 330, top: 180, right: 370, bottom: 230 },
      bubble: { width: 264, height: 38 },
      viewport: { left: 304, top: 10, right: 390, bottom: 800 },
    })).toBeNull();
  });

  it("fails closed for damaged geometry", () => {
    expect(projectPointTalkPlacement({
      target: { left: Number.NaN, top: 0, right: 20, bottom: 20 },
      bubble,
      viewport,
    })).toBeNull();
  });

  it("keeps the turn alive while a keyboard publishes transient viewport geometry", () => {
    const shared = {
      target: { left: 40, top: 220, right: 250, bottom: 270 },
      bubble,
      boundary: { left: 8, top: 66, right: 382, bottom: 836 },
      positioningSurface: { left: 8, top: 66, right: 382, bottom: 836 },
      rightOccluder: null,
    };
    expect(projectPointTalkPlacementWithinSurfaces({
      ...shared,
      visualViewport: { left: 0, top: 0, right: 390, bottom: 0 },
    })).toEqual({ kind: "temporarily-unavailable" });
    expect(projectPointTalkPlacementWithinSurfaces({
      ...shared,
      visualViewport: { left: 0, top: 900, right: 390, bottom: 1_220 },
    })).toEqual({ kind: "temporarily-unavailable" });
    expect(projectPointTalkPlacementWithinSurfaces({
      ...shared,
      visualViewport: { left: 0, top: 80, right: 390, bottom: 430 },
    })).toEqual({
      kind: "placed",
      placement: { left: 40, maxWidth: 350, top: 168 },
    });
    expect(projectPointTalkPlacementWithinSurfaces({
      ...shared,
      visualViewport: { left: 0, top: Number.NaN, right: 390, bottom: 430 },
    })).toEqual({ kind: "unusable" });
  });

  it("still revokes a coherent field that cannot preserve usable controls", () => {
    expect(projectPointTalkPlacementWithinSurfaces({
      target: { left: 24, top: 220, right: 120, bottom: 270 },
      bubble,
      visualViewport: { left: 0, top: 0, right: 170, bottom: 844 },
      boundary: { left: 8, top: 66, right: 162, bottom: 836 },
      positioningSurface: { left: 8, top: 66, right: 162, bottom: 836 },
      rightOccluder: null,
    })).toEqual({ kind: "unusable" });
  });
});
