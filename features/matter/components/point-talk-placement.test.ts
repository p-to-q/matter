import { describe, expect, it } from "vitest";
import {
  excludePointTalkRightOccluder,
  intersectPointTalkBounds,
  POINT_TALK_GAP_PX,
  projectPointTalkControlReserve,
  projectPointTalkEntrance,
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

describe("Point-and-Talk entrance", () => {
  const target = { left: 100, top: 300, right: 620, bottom: 360 };
  const bubble = { width: 264, height: 38 };

  it("grows from the pressed mark and settles toward a passage below it", () => {
    expect(projectPointTalkEntrance({
      origin: { x: 90, y: 270 },
      placement: { left: 100, top: 248 },
      bubble,
      target,
      travelPx: 4,
    })).toEqual({ originX: 0, originY: 22, travelY: -4 });
  });

  it("travels upward toward a passage above it and clamps the origin into the field", () => {
    expect(projectPointTalkEntrance({
      origin: { x: 900, y: 10 },
      placement: { left: 100, top: 374 },
      bubble,
      target,
      travelPx: 4,
    })).toEqual({ originX: 264, originY: 0, travelY: 4 });
  });

  it("grows from the edge facing the passage when nothing was pressed", () => {
    expect(projectPointTalkEntrance({
      origin: null,
      placement: { left: 100, top: 248 },
      bubble,
      target,
      travelPx: 4,
    })).toEqual({ originX: 0, originY: 38, travelY: -4 });
  });
});

describe("Point-and-Talk width with the picture control", () => {
  it("lends the field the control's own width at scale 1, plus one gap", () => {
    expect(POINT_TALK_GAP_PX).toBe(4);
    expect(projectPointTalkControlReserve({ controlWidth: 41.5, scale: 1 })).toBe(46);
    expect(projectPointTalkControlReserve({ controlWidth: 66.9, scale: 1 })).toBe(71);
    // Laid out at a larger scale, the width is brought back to scale 1: the
    // stylesheet multiplies it by the scale again.
    expect(projectPointTalkControlReserve({ controlWidth: 55, scale: 1.1 })).toBe(54);
    expect(projectPointTalkControlReserve({ controlWidth: 37, scale: .74 })).toBe(54);
  });

  it("reports nothing for a control that has no width, so the field keeps the room it took", () => {
    expect(projectPointTalkControlReserve({ controlWidth: 0, scale: 1 })).toBeNull();
    expect(projectPointTalkControlReserve({ controlWidth: -3, scale: 1 })).toBeNull();
    expect(projectPointTalkControlReserve({ controlWidth: Number.NaN, scale: 1 })).toBeNull();
    expect(projectPointTalkControlReserve({ controlWidth: Number.POSITIVE_INFINITY, scale: 1 })).toBeNull();
  });

  it("reads an unusable scale as 1", () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(projectPointTalkControlReserve({ controlWidth: 40, scale })).toBe(44);
    }
  });

  const field = { left: 304, top: 12, right: 1268, bottom: 788 };
  const rail = { left: 1196, top: 216, right: 1256, bottom: 504 };

  it("places the wider box clear of the tool rail and inside the paper, wherever its passage is", () => {
    for (const bubbleWidth of [264, 309, 335]) {
      for (const targetLeft of [320, 700, 1000, 1180]) {
        const projected = projectPointTalkPlacementWithinSurfaces({
          target: { left: targetLeft, top: 400, right: targetLeft + 300, bottom: 440 },
          bubble: { width: bubbleWidth, height: 38 },
          visualViewport: { left: 0, top: 0, right: 1280, bottom: 800 },
          boundary: field,
          positioningSurface: field,
          rightOccluder: rail,
        });
        expect(projected.kind).toBe("placed");
        if (projected.kind !== "placed") continue;
        expect(projected.placement.left).toBeGreaterThanOrEqual(316);
        expect(projected.placement.left + bubbleWidth).toBeLessThanOrEqual(rail.left - 12);
      }
    }
  });

  it("clamps the wider box further left than the base box near the rail", () => {
    const place = (width: number) => projectPointTalkPlacementWithinSurfaces({
      target: { left: 1100, top: 400, right: 1180, bottom: 440 },
      bubble: { width, height: 38 },
      visualViewport: { left: 0, top: 0, right: 1280, bottom: 800 },
      boundary: field,
      positioningSurface: field,
      rightOccluder: rail,
    });
    const base = place(264);
    const grown = place(309);
    if (base.kind !== "placed" || grown.kind !== "placed") throw new Error("not placed");
    expect(base.placement.left - grown.placement.left).toBe(45);
  });

  it("offers the wider box no more room than the visible field has", () => {
    const projected = projectPointTalkPlacementWithinSurfaces({
      target: { left: 20, top: 400, right: 300, bottom: 440 },
      bubble: { width: 335, height: 38 },
      visualViewport: { left: 0, top: 0, right: 390, bottom: 844 },
      boundary: { left: 9, top: 9, right: 381, bottom: 835 },
      positioningSurface: { left: 9, top: 9, right: 381, bottom: 835 },
      rightOccluder: { left: 306, top: 200, right: 381, bottom: 600 },
    });
    expect(projected.kind).toBe("placed");
    if (projected.kind !== "placed") return;
    // 306 − 9 − 2 × 12: the field's own width limit, which the stylesheet reads.
    expect(projected.placement.maxWidth).toBe(273);
  });
});
