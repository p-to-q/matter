import { describe, expect, it } from "vitest";
import { ELASTIC_PREVIEW_METRICS, elasticPreviewGeometry } from "./elastic-preview";

const stepped = [
  { x: 100, y: 200, width: 120, height: 20 },
  { x: 100, y: 224, width: 48, height: 20 },
] as const;

describe("elastic preview geometry", () => {
  it("groups same-line fragments and anchors each grip to its own visual line", () => {
    const rects = [
      { x: 100, y: 200, width: 30, height: 20 },
      { x: 150, y: 200.5, width: 70, height: 19 },
      { x: 100, y: 224, width: 48, height: 20 },
    ];
    const preview = elasticPreviewGeometry(rects, 0)!;
    expect(preview.visualLines).toEqual([
      { left: 100, top: 200, right: 220, bottom: 220 },
      { left: 100, top: 224, right: 148, bottom: 244 },
    ]);
    expect((preview.topHandle.x1 + preview.topHandle.x2) / 2).toBe(160);
    expect((preview.bottomHandle.x1 + preview.bottomHandle.x2) / 2).toBe(124);
  });

  it("uses one center for both handles on a single visual line", () => {
    const preview = elasticPreviewGeometry([
      { x: 20, y: 50, width: 40, height: 18 },
      { x: 70, y: 50, width: 30, height: 18 },
    ], 0)!;
    expect(preview.visualLines).toHaveLength(1);
    expect(preview.topHandle.x1).toBe(preview.bottomHandle.x1);
    expect(preview.topHandle.x2).toBe(preview.bottomHandle.x2);
  });

  it("uses the top handle as input ownership for the same downward slot", () => {
    const preview = elasticPreviewGeometry(stepped, 0.5, undefined, undefined, "top", "top")!;
    expect(preview).toMatchObject({ mode: "expand", amount: 0.5, activeHandle: "top", pocketDepth: 72 });
    expect(preview.topHandle.y).toBe(197);
    expect(preview.bottomHandle.y).toBe(319);
    expect(preview.pocket.bottom).toBe(preview.bottomHandle.y);
    expect(preview.fragments).toEqual(stepped);
  });

  it("expands downward from the bottom handle without changing source fragments", () => {
    const preview = elasticPreviewGeometry(stepped, 0.5, undefined, undefined, "bottom", "bottom")!;
    expect(preview).toMatchObject({ mode: "expand", amount: 0.5, activeHandle: "bottom", pocketDepth: 72 });
    expect(preview.topHandle.y).toBe(197);
    expect(preview.bottomHandle.y).toBe(319);
    expect(preview.pocket.bottom).toBe(preview.bottomHandle.y);
    expect(preview.fragments).toEqual(stepped);
  });

  it("clamps controls without changing the material depth", () => {
    const viewport = { left: 0, top: 180, right: 300, bottom: 270 };
    const top = elasticPreviewGeometry(stepped, 1, viewport, undefined, "top", "top")!;
    const bottom = elasticPreviewGeometry(stepped, 1, viewport, undefined, "bottom", "bottom")!;
    expect(top.topHandle.y).toBe(224);
    expect(bottom.bottomHandle.y).toBe(226);
    expect(top.maximumDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(bottom.maximumDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(top.pocketDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(bottom.pocketDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(top.topHandle.x1).toBeGreaterThanOrEqual(ELASTIC_PREVIEW_METRICS.handleHalfWidth - 11);
  });

  it("clamps negative input to zero and overshoot to one", () => {
    expect(elasticPreviewGeometry(stepped, -1)!.amount).toBe(0);
    expect(elasticPreviewGeometry(stepped, 4)!.amount).toBe(1);
  });

  it("owns exact source fragments and rejects malformed geometry", () => {
    const source: Array<{ x: number; y: number; width: number; height: number }> =
      stepped.map((rect) => ({ ...rect }));
    const preview = elasticPreviewGeometry(source, 0.25)!;
    source[0]!.x = 999;
    expect(preview.fragments[0]!.x).toBe(100);
    expect(Object.isFrozen(preview.fragments[0])).toBe(true);
    expect(elasticPreviewGeometry([], 0)).toBeNull();
    expect(elasticPreviewGeometry([{ x: 0, y: 0, width: 0, height: 2 }], 0)).toBeNull();
    expect(elasticPreviewGeometry(stepped, Number.NaN)).toBeNull();
  });
});
