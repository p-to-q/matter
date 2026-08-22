import { describe, expect, it } from "vitest";
import {
  ELASTIC_PREVIEW_METRICS,
  elasticPreviewGeometry,
  prepareElasticPreviewSource,
  projectElasticPreview,
} from "./elastic-preview";

const stepped = [
  { x: 100, y: 200, width: 120, height: 20 },
  { x: 100, y: 224, width: 48, height: 20 },
] as const;

describe("elastic preview geometry", () => {
  it("groups same-line fragments and anchors the seam cue and lower grip", () => {
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

  it("uses one center for the seam cue and grip on a single visual line", () => {
    const preview = elasticPreviewGeometry([
      { x: 20, y: 50, width: 40, height: 18 },
      { x: 70, y: 50, width: 30, height: 18 },
    ], 0)!;
    expect(preview.visualLines).toHaveLength(1);
    expect(preview.topHandle.x1).toBe(preview.bottomHandle.x1);
    expect(preview.topHandle.x2).toBe(preview.bottomHandle.x2);
  });

  it("moves only the lower grip down for the shared degree", () => {
    const preview = elasticPreviewGeometry(stepped, 0.5, undefined, undefined, "bottom", "bottom")!;
    expect(preview).toMatchObject({ mode: "expand", amount: 0.5, activeHandle: "bottom", pocketDepth: 72 });
    expect(preview.topHandle.y).toBe(197);
    expect(preview.bottomHandle.y).toBe(319);
    expect(preview.pocket).toMatchObject({ top: 247, bottom: 319 });
    expect(preview.fragments).toEqual(stepped);
  });

  it("keeps the upper seam fixed while its outward gesture opens the slot below", () => {
    const preview = elasticPreviewGeometry(stepped, 0.5, undefined, undefined, "top", "top")!;
    expect(preview).toMatchObject({ mode: "expand", amount: 0.5, activeHandle: "top", pocketDepth: 72 });
    expect(preview.topHandle.y).toBe(197);
    expect(preview.bottomHandle.y).toBe(319);
    expect(preview.pocket).toMatchObject({ top: 197, bottom: 269 });
    expect(preview.fragments).toEqual(stepped);
  });

  it("clamps controls without changing the material depth", () => {
    const viewport = { left: 0, top: 150, right: 300, bottom: 270 };
    const bottom = elasticPreviewGeometry(stepped, 1, viewport, undefined, "bottom", "bottom")!;
    expect(bottom.bottomHandle.y).toBe(221);
    expect(bottom.bottomHandle.y - bottom.topHandle.y)
      .toBeGreaterThanOrEqual(ELASTIC_PREVIEW_METRICS.minimumHandleSeparation);
    expect(bottom.maximumDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(bottom.pocketDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
    expect(bottom.topHandle.x1).toBeGreaterThanOrEqual(ELASTIC_PREVIEW_METRICS.handleHalfWidth - 11);
  });

  it("keeps the full coarse lower-grip target inside the viewport", () => {
    const viewport = { left: 0, top: 140, right: 300, bottom: 270 };
    const preview = elasticPreviewGeometry(
      stepped,
      1,
      viewport,
      undefined,
      "bottom",
      "bottom",
      true,
    )!;
    expect(preview.handleViewportInset).toBe(ELASTIC_PREVIEW_METRICS.coarseHandleOutwardExtent);
    expect(preview.bottomHandle.y).toBe(217);
    expect(preview.bottomHandle.y + preview.handleViewportInset).toBe(viewport.bottom);
    expect(preview.bottomHandle.y - preview.topHandle.y)
      .toBeGreaterThanOrEqual(ELASTIC_PREVIEW_METRICS.minimumHandleSeparation);
  });

  it.each([
    { coarse: false, top: 150, bottom: 270 },
    { coarse: true, top: 140, bottom: 270 },
  ])("separates fine/coarse grips deterministically after edge clamping", ({ coarse, top, bottom }) => {
    const preview = elasticPreviewGeometry(
      [{ x: 100, y: 250, width: 80, height: 2 }],
      0,
      { left: 0, top, right: 320, bottom },
      undefined,
      null,
      null,
      coarse,
    );

    expect(preview).not.toBeNull();
    expect(preview!.bottomHandle.y - preview!.topHandle.y)
      .toBe(ELASTIC_PREVIEW_METRICS.minimumHandleSeparation);
    expect(preview!.topHandle.y - preview!.handleViewportInset).toBeGreaterThanOrEqual(top);
    expect(preview!.bottomHandle.y + preview!.handleViewportInset).toBeLessThanOrEqual(bottom);
  });

  it("keeps the largest possible deterministic separation in a collapsed visual viewport", () => {
    const viewport = { left: 0, top: 180, right: 300, bottom: 270 };
    const preview = elasticPreviewGeometry(stepped, 1, viewport, undefined, "top", "top")!;
    expect(preview.topHandle.y).toBe(225);
    expect(preview.bottomHandle.y).toBe(225);
    expect(preview.pocketDepth).toBe(ELASTIC_PREVIEW_METRICS.maximumExpansionDepth);
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

  it("reuses measured fragments while projecting many pointer degrees", () => {
    const source = prepareElasticPreviewSource(stepped, { left: 80, top: 180, right: 260, bottom: 360 });
    if (source === null) throw new Error("source should be valid");
    const viewport = { left: 0, top: 0, right: 320, bottom: 480 };

    const first = projectElasticPreview(source, 0.2, viewport, "bottom", "bottom");
    const second = projectElasticPreview(source, 0.8, viewport, "bottom", "bottom");
    expect(first?.fragments).toBe(source.fragments);
    expect(second?.fragments).toBe(source.fragments);
    expect(first?.visualLines).toBe(source.visualLines);
    expect(second?.pocketDepth).toBeGreaterThan(first?.pocketDepth ?? 0);
    expect(second).toEqual(elasticPreviewGeometry(stepped, 0.8, viewport, source.textColumn ?? undefined, "bottom", "bottom"));
  });

});
