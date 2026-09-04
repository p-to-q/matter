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
  it("projects a multi-row range as one reading-order corridor", () => {
    const outline = materialAddressOutline(projection())!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [300, 600],
      [100, 600],
      [100, 260],
    ]);
  });

  it("keeps a centred multi-row range continuous through the column", () => {
    // Centring changes where glyphs sit, not the logical route from one visual
    // line to the next. Only the two true range endpoints stay clipped.
    const centred = materialAddressOutline(projection({
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 560, inlineStart: 140 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 520, inlineStart: 180 },
        { blockEnd: 220, blockStart: 180, inlineEnd: 400, inlineStart: 300 },
      ],
      run: { endInline: 400, endRow: 2, startInline: 140, startRow: 0 },
    }))!;
    expect(centred.bands.map((band) => [band.left, band.right])).toEqual([
      [140, 600],
      [100, 600],
      [100, 400],
    ]);
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
    expect(perRow.bands.map((band) => [band.left, band.right])).toEqual([
      [140, 560],
      [140, 560],
      [300, 400],
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
    }), { separateRows: true })!;
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
      run: { endInline: 140, endRow: 2, startInline: 560, startRow: 0 },
      textDirection: "rtl",
    }))!;
    expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
      [100, 560],
      [100, 600],
      [140, 600],
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
      // The former endpoint row is now inside the interval, so it reaches the
      // logical end before the full-column slot begins.
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
      // The slot and every row before the real end are full-column.
      [100, 600],
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
    // The former endpoint row and its slot advance together toward the logical
    // end, so no shoulder can detach from the selected surface.
    expect(half.bands[2]!.right).toBe(430);
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

  it("never proximity-snaps either real endpoint to the column", () => {
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
    expect(outline.bands[0]!.left).toBe(108);
    expect(outline.bands[1]!.right).toBe(520);
  });

  it("bridges a disjoint wrap through measured leading without a self-touch", () => {
    const outline = materialAddressOutline(projection({
      column: { blockEnd: 220, blockStart: 80, inlineEnd: 600, inlineStart: 100 },
      rows: [
        { blockEnd: 120, blockStart: 100, inlineEnd: 560, inlineStart: 500 },
        { blockEnd: 152, blockStart: 132, inlineEnd: 200, inlineStart: 140 },
      ],
      run: { endInline: 200, endRow: 1, startInline: 500, startRow: 0 },
    }))!;
    expect(outline.bands.map((band) => [band.blockStart, band.blockEnd, band.left, band.right]))
      .toEqual([
        [100, 120, 500, 600],
        [120, 132, 100, 600],
        [132, 152, 100, 200],
      ]);
    expect(ringShape(outline.path)).toEqual({ closes: 1, starts: 1 });
  });

  it("keeps a required wrap turn through the entire upper and lower attachment", () => {
    const disjoint = {
      column: { blockEnd: 240, blockStart: 20, inlineEnd: 600, inlineStart: 100 },
      rows: [
        { blockEnd: 120, blockStart: 100, inlineEnd: 560, inlineStart: 500 },
        { blockEnd: 152, blockStart: 132, inlineEnd: 200, inlineStart: 140 },
      ],
      run: { endInline: 200, endRow: 1, startInline: 500, startRow: 0 },
    };
    for (const direction of ["selection-then-slot", "slot-then-selection"] as const) {
      const expectedBandCount = 4;
      for (const attachmentProgress of [0, 0.001, 0.05, 0.1, 1]) {
        const outline = materialAddressOutline(projection({
          ...disjoint,
          attachmentProgress,
          direction,
          slot: direction === "selection-then-slot"
            ? { blockEnd: 220, blockStart: 152 }
            : { blockEnd: 100, blockStart: 32 },
        }))!;
        const transition = outline.bands.find((band) =>
          band.blockStart === 120 && band.blockEnd === 132
        );
        expect(outline.bands).toHaveLength(expectedBandCount);
        expect(transition).toMatchObject({ left: 100, right: 600 });
        expect(ringShape(outline.path)).toEqual({ closes: 1, starts: 1 });
      }
    }
  });

  it("fails open when disjoint rows have no safe leading for the wrap turn", () => {
    const unsupported = {
      rows: [
        { blockEnd: 121, blockStart: 100, inlineEnd: 560, inlineStart: 500 },
        { blockEnd: 140, blockStart: 120, inlineEnd: 200, inlineStart: 140 },
      ],
      run: { endInline: 200, endRow: 1, startInline: 500, startRow: 0 },
    };
    for (const state of [
      { attachmentProgress: 0, direction: "neutral", slot: null },
      {
        attachmentProgress: 1,
        direction: "selection-then-slot",
        slot: { blockEnd: 220, blockStart: 140 },
      },
      {
        attachmentProgress: 1,
        direction: "slot-then-selection",
        slot: { blockEnd: 100, blockStart: 20 },
      },
    ] as const) {
      expect(materialAddressOutline(projection({ ...unsupported, ...state }))).toBeNull();
    }
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
