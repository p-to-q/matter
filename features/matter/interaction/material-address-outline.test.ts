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
  it("bounds every row by the language it contains", () => {
    const outline = materialAddressOutline(projection())!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [300, 600],
      [100, 600],
      [100, 260],
    ]);
  });

  it("never claims the margin that centring leaves on either side", () => {
    // Centred rows are inset from BOTH column edges, so the region between an
    // edge and the glyphs belongs to no line. Filling to the edge put a wide
    // first row above a narrow band pinned to the far side of the column.
    const centred = materialAddressOutline(projection({
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 560, inlineStart: 140 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 520, inlineStart: 180 },
        { blockEnd: 220, blockStart: 180, inlineEnd: 400, inlineStart: 300 },
      ],
      run: { endInline: 400, endRow: 2, startInline: 140, startRow: 0 },
    }))!;
    expect(centred.bands.map((band) => [band.left, band.right])).toEqual([
      [140, 560],
      [180, 520],
      [300, 400],
    ]);
    // Centring also makes the fill unnecessary: rows share one centre axis, so
    // consecutive bands always overlap and the outline stays one closed ring.
    for (const [index, band] of centred.bands.entries()) {
      const next = centred.bands[index + 1];
      if (next === undefined) continue;
      expect(Math.min(band.right, next.right)).toBeGreaterThan(Math.max(band.left, next.left));
    }
    expect(ringShape(centred.path)).toEqual({ closes: 1, starts: 1 });
  });

  it("reads a whole-node address line by line", () => {
    // The label this replaced cloned its decoration per line box, so the
    // leading between two lines was never filled. Joining the rows into one
    // region turned a stack of lines into a single slab.
    const rows = [
      { blockEnd: 140, blockStart: 100, inlineEnd: 560, inlineStart: 140 },
      { blockEnd: 195, blockStart: 155, inlineEnd: 560, inlineStart: 140 },
      { blockEnd: 250, blockStart: 210, inlineEnd: 400, inlineStart: 300 },
    ];
    const run = { endInline: 400, endRow: 2, startInline: 140, startRow: 0 };
    const perRow = materialAddressOutline(projection({ rows, run }), {
      blockOutset: 2,
      cornerRadius: 10,
      separateRows: true,
    })!;
    expect((perRow.path.match(/M/g) ?? []).length).toBe(3);
    expect((perRow.path.match(/Z/g) ?? []).length).toBe(3);
    // Each capsule keeps its own row, so the leading survives between them.
    expect(perRow.bands.map((band) => [band.blockStart, band.blockEnd])).toEqual([
      [98, 142],
      [153, 197],
      [208, 252],
    ]);
    // A precise address still resolves to one region.
    const joined = materialAddressOutline(projection({ rows, run }), {
      blockOutset: 2,
      cornerRadius: 10,
    })!;
    expect((joined.path.match(/M/g) ?? []).length).toBe(1);
  });

  it("keeps a whole-node address on the glyphs it names", () => {
    // Following the language is the point of the mark. A whole-node address is
    // not allowed to collapse into a plain column rectangle just because its
    // rows are ragged.
    const outline = materialAddressOutline(projection({
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 560, inlineStart: 140 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 400, inlineStart: 300 },
      ],
      run: { endInline: 400, endRow: 1, startInline: 140, startRow: 0 },
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [140, 560],
      [300, 400],
    ]);
    expect(outline.bands.some((band) => band.left === 100 || band.right === 600)).toBe(false);
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
      run: { endInline: 100, endRow: 2, startInline: 600, startRow: 0 },
      textDirection: "rtl",
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [300, 600],
      [100, 600],
      [100, 260],
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
      // The selected rows keep their own language; only the slot is column
      // space, so only the slot reaches both edges.
      [100, 260],
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
      // The slot is inserted column space and reaches both edges; the rows
      // below it keep the language they contain.
      [100, 600],
      [300, 600],
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
    // The row keeps its own end throughout; only the slot advances toward the
    // column, so attachment can never widen language that was not selected.
    expect(half.bands[2]!.right).toBe(260);
    expect(half.bands[3]!.right).toBe(430);
  });

  it("emits one closed ring with no interior hole", () => {
    for (const outline of [
      materialAddressOutline(projection())!,
      materialAddressOutline(projection({
        attachmentProgress: 1,
        direction: "selection-then-slot",
        metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3, medianRowExtent: 20 },
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
      metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3, medianRowExtent: 20 },
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
      metrics: { blockOutset: 0, cornerRadius: 4, inlineOutset: 0, medianRowExtent: 20 },
    }))!;
    expect(outline.path).toContain("A4 4 0 0 1");
    // A concave turn takes the opposite sweep, which is what makes the step
    // between two rows read as one material instead of two boxes.
    expect(outline.path).toContain("A4 4 0 0 0");
  });

  it("leaves the same air on both sides of a centred row", () => {
    // A boundary endpoint used to snap outward to the column edge when it came
    // within a corner diameter of it. Every row here is inset by centring, not
    // by a missing paper cell, so snapping made the first row asymmetric: it
    // claimed the left gutter while its right edge stayed on the glyphs.
    const outline = materialAddressOutline(projection({
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 592, inlineStart: 108 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 520, inlineStart: 180 },
      ],
      run: { endInline: 520, endRow: 1, startInline: 108, startRow: 0 },
    }), { blockOutset: 2, cornerRadius: 4 })!;
    const [first] = outline.bands;
    expect(first!.left - 108).toBe(592 - first!.right);
  });

  it("fails closed instead of painting something it cannot prove", () => {
    expect(materialAddressOutline(null)).toBeNull();
    expect(materialAddressOutline(projection({ rows: [] }))).toBeNull();
    expect(materialAddressOutline(projection({
      writingMode: "vertical-rl" as MaterialAddressProjection["writingMode"],
    }))).toBeNull();
    expect(materialAddressOutline(projection(), { cornerRadius: Number.NaN })).toBeNull();
    expect(materialAddressOutline(projection(), { blockOutset: -1 })).toBeNull();
  });
});
