import { describe, expect, it } from "vitest";
import { materialAddressOutline } from "./material-address-outline";
import type { MaterialAddressProjection } from "./projected-layout-receipt";

const COLUMN = Object.freeze({ blockEnd: 400, blockStart: 100, inlineEnd: 600, inlineStart: 100 });

const ROWS = Object.freeze([
  Object.freeze({ blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 300 }),
  Object.freeze({ blockEnd: 180, blockStart: 140, inlineEnd: 600, inlineStart: 100 }),
  Object.freeze({ blockEnd: 220, blockStart: 180, inlineEnd: 260, inlineStart: 100 }),
]);

function projection(
  overrides: Partial<MaterialAddressProjection> = {},
): MaterialAddressProjection {
  return Object.freeze({
    attachmentProgress: 0,
    basis: Object.freeze({
      addressKey: "address",
      documentEpoch: 1,
      layoutEpoch: 1,
      nodeId: "node",
      partitionKey: "partition",
      treeId: "tree",
      viewportKey: "viewport",
    }),
    column: COLUMN,
    coordinateSpace: "client-css-px",
    direction: "neutral",
    metrics: Object.freeze({ blockOutset: 0, cornerRadius: 0, inlineOutset: 0 }),
    rows: ROWS,
    run: Object.freeze({ endInline: 260, endRow: 2, startInline: 300, startRow: 0 }),
    slot: null,
    textDirection: "ltr",
    writingMode: "horizontal-tb",
    ...overrides,
  }) as MaterialAddressProjection;
}

/** A single closed ring is the whole no-holes guarantee, so assert its shape. */
function ringShape(path: string) {
  return {
    closes: (path.match(/Z/g) ?? []).length,
    starts: (path.match(/M/g) ?? []).length,
  };
}

describe("material address outline", () => {
  it("reads a multi-row interval as a corridor rather than glyph rectangles", () => {
    const outline = materialAddressOutline(projection())!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      // First row runs from the real start to the column's logical end,
      // because the line break it ends on is part of the selected reading.
      [300, 600],
      [100, 600],
      [100, 260],
    ]);
  });

  it("keeps a single-row interval on its own glyph edges", () => {
    const outline = materialAddressOutline(projection({
      rows: [ROWS[0]!],
      run: { endInline: 520, endRow: 0, startInline: 300, startRow: 0 },
    }))!;
    expect(outline.bands).toHaveLength(1);
    expect([outline.bands[0]!.left, outline.bands[0]!.right]).toEqual([300, 520]);
  });

  it("mirrors the logical axes for right-to-left material", () => {
    const outline = materialAddressOutline(projection({
      // In RTL the run's start is the physical right edge of the first row and
      // its end is the physical left edge of the last row.
      run: { endInline: 260, endRow: 2, startInline: 300, startRow: 0 },
      textDirection: "rtl",
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [100, 300],
      [100, 600],
      [260, 600],
    ]);
  });

  it("continues the interval into the slot for the lower grip", () => {
    const outline = materialAddressOutline(projection({
      attachmentProgress: 1,
      direction: "selection-then-slot",
      slot: { blockEnd: 300, blockStart: 220 },
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [300, 600],
      [100, 600],
      // The last selected row is now interior, so it reaches the column.
      [100, 600],
      [100, 600],
    ]);
    expect(outline.bands.at(-1)!.blockEnd).toBe(300);
  });

  it("mirrors the interval for the upper grip", () => {
    const outline = materialAddressOutline(projection({
      attachmentProgress: 1,
      direction: "slot-then-selection",
      slot: { blockEnd: 100, blockStart: 20 },
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [100, 600],
      // The first selected row is now interior; only the last row returns.
      [100, 600],
      [100, 600],
      [100, 260],
    ]);
    expect(outline.bands[0]!.blockStart).toBe(20);
  });

  it("opens the slot flush with its own row so no edge can jump", () => {
    const barely = materialAddressOutline(projection({
      attachmentProgress: 0,
      direction: "selection-then-slot",
      slot: { blockEnd: 221, blockStart: 220 },
    }))!;
    const neutral = materialAddressOutline(projection())!;
    // At zero attachment every selected row still matches the neutral interval.
    expect(barely.bands.slice(0, 3).map((band) => [band.left, band.right]))
      .toEqual(neutral.bands.map((band) => [band.left, band.right]));
    // and the slot emerges at the width of the row it attaches to.
    expect([barely.bands.at(-1)!.left, barely.bands.at(-1)!.right]).toEqual([100, 260]);
  });

  it("advances every edge continuously through attachment", () => {
    const half = materialAddressOutline(projection({
      attachmentProgress: 0.5,
      direction: "selection-then-slot",
      slot: { blockEnd: 260, blockStart: 220 },
    }))!;
    expect(half.bands[2]!.right).toBe(430);
    expect(half.bands[3]!.right).toBe(430);
  });

  it("emits one closed ring with no interior hole", () => {
    for (const outline of [
      materialAddressOutline(projection())!,
      materialAddressOutline(projection({
        attachmentProgress: 1,
        direction: "selection-then-slot",
        metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3 },
        slot: { blockEnd: 300, blockStart: 220 },
      }))!,
    ]) {
      expect(ringShape(outline.path)).toEqual({ closes: 1, starts: 1 });
      expect(outline.path.length).toBeGreaterThan(0);
    }
  });

  it("makes neighbouring rows share one block edge", () => {
    // Real line boxes can leave sub-pixel leading; a hole is not permitted.
    const outline = materialAddressOutline(projection({
      metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3 },
      rows: [
        { blockEnd: 139, blockStart: 100, inlineEnd: 600, inlineStart: 300 },
        { blockEnd: 180, blockStart: 141, inlineEnd: 600, inlineStart: 100 },
        { blockEnd: 220, blockStart: 181, inlineEnd: 260, inlineStart: 100 },
      ],
    }))!;
    for (const [index, band] of outline.bands.entries()) {
      const next = outline.bands[index + 1];
      if (next === undefined) continue;
      expect(band.blockEnd).toBe(next.blockStart);
    }
    expect(outline.bands[0]!.blockStart).toBe(97);
    expect(outline.bands.at(-1)!.blockEnd).toBe(223);
  });

  it("rounds corners without exceeding the edges that meet there", () => {
    const outline = materialAddressOutline(projection({
      metrics: { blockOutset: 0, cornerRadius: 4, inlineOutset: 0 },
    }))!;
    expect(outline.path).toContain("A4 4 0 0 1");
    // A concave turn takes the opposite sweep, which is what makes the step
    // between two rows read as one material instead of two boxes.
    expect(outline.path).toContain("A4 4 0 0 0");
  });

  it("fails closed instead of painting something it cannot prove", () => {
    expect(materialAddressOutline(null)).toBeNull();
    expect(materialAddressOutline(projection({ rows: [] }))).toBeNull();
    expect(materialAddressOutline(projection({
      writingMode: "vertical-rl" as MaterialAddressProjection["writingMode"],
    }))).toBeNull();
  });
});
