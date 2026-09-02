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

  it("paints the owning column when the address names a whole node", () => {
    // A whole-node address names a node, not a set of words. Tracing centred
    // ragged text gave every node a different silhouette for reasons no reader
    // can see, so the node's own box is the honest shape.
    const outline = materialAddressOutline(projection({
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 560, inlineStart: 140 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 400, inlineStart: 300 },
      ],
      run: { endInline: 400, endRow: 1, startInline: 140, startRow: 0 },
    }), { columnAligned: true })!;
    for (const band of outline.bands) expect([band.left, band.right]).toEqual([100, 600]);
    // Identical spans collapse to one rectangle, so the node reads as one card.
    expect(ringShape(outline.path)).toEqual({ closes: 1, starts: 1 });
    expect((outline.path.match(/A/g) ?? []).length).toBeLessThanOrEqual(4);
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

  describe("short lateral steps", () => {
    // Rows whose left edges differ by 14px and whose right edges differ by 80px.
    const STEPPED = Object.freeze([
      Object.freeze({ blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 114 }),
      Object.freeze({ blockEnd: 180, blockStart: 140, inlineEnd: 520, inlineStart: 100 }),
    ]);
    const stepped = (overrides: Partial<MaterialAddressProjection> = {}) => projection({
      rows: STEPPED,
      run: { endInline: 520, endRow: 1, startInline: 114, startRow: 0 },
      ...overrides,
    });

    it("opens a step too short to hold its corners and keeps a long one", () => {
      const outline = materialAddressOutline(stepped(), { cornerRadius: 10, minimumStepExtent: 20 })!;
      // The 14px left step is gone: both bands share the outer edge.
      expect(outline.bands.map((band) => band.left)).toEqual([100, 100]);
      // The 80px right step is real shape and survives.
      expect(outline.bands.map((band) => band.right)).toEqual([600, 520]);
    });

    it("snaps only a wrapped endpoint close enough to the paper edge", () => {
      const near = materialAddressOutline(stepped(), {
        cornerRadius: 4,
        edgeSnapExtent: 16,
      })!;
      expect(near.bands.map((band) => band.left)).toEqual([100, 100]);
      expect(near.bands.map((band) => band.right)).toEqual([600, 520]);

      const far = materialAddressOutline(stepped(), {
        cornerRadius: 4,
        edgeSnapExtent: 13,
      })!;
      expect(far.bands.map((band) => band.left)).toEqual([114, 100]);
    });

    it("keeps the snapped endpoint while either grip attaches the slot", () => {
      const lower = materialAddressOutline(stepped({
        attachmentProgress: 1,
        direction: "selection-then-slot",
        slot: { blockEnd: 260, blockStart: 180 },
      }), { edgeSnapExtent: 16 })!;
      expect(lower.bands.map((band) => band.left)).toEqual([100, 100, 100]);

      const upper = materialAddressOutline(projection({
        attachmentProgress: 1,
        direction: "slot-then-selection",
        rows: [
          { blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 180 },
          { blockEnd: 180, blockStart: 140, inlineEnd: 586, inlineStart: 100 },
        ],
        run: { endInline: 586, endRow: 1, startInline: 180, startRow: 0 },
        slot: { blockEnd: 100, blockStart: 20 },
      }), { edgeSnapExtent: 16 })!;
      expect(upper.bands.map((band) => band.right)).toEqual([600, 600, 600]);
    });

    it("never expands a one-line exact address merely because it is near an edge", () => {
      const single = materialAddressOutline(projection({
        rows: [ROWS[0]!],
        run: { endInline: 590, endRow: 0, startInline: 110, startRow: 0 },
      }), { edgeSnapExtent: 20 })!;
      expect([single.bands[0]!.left, single.bands[0]!.right]).toEqual([110, 590]);
    });

    it("mirrors endpoint snapping in right-to-left material", () => {
      const outline = materialAddressOutline(projection({
        rows: [
          { blockEnd: 140, blockStart: 100, inlineEnd: 586, inlineStart: 100 },
          { blockEnd: 180, blockStart: 140, inlineEnd: 600, inlineStart: 180 },
        ],
        run: { endInline: 180, endRow: 1, startInline: 586, startRow: 0 },
        textDirection: "rtl",
      }), { edgeSnapExtent: 16 })!;
      expect(outline.bands.map((band) => [band.left, band.right])).toEqual([
        [100, 600],
        [180, 600],
      ]);
    });

    it("only ever moves an edge outward, so no glyph is clipped", () => {
      const plain = materialAddressOutline(stepped())!;
      const opened = materialAddressOutline(stepped(), { cornerRadius: 10, minimumStepExtent: 20 })!;
      for (const [index, band] of plain.bands.entries()) {
        const after = opened.bands[index]!;
        expect(after.left).toBeLessThanOrEqual(band.left);
        expect(after.right).toBeGreaterThanOrEqual(band.right);
        expect(after.blockStart).toBe(band.blockStart);
        expect(after.blockEnd).toBe(band.blockEnd);
      }
    });

    it("judges each step against the rows it was measured from", () => {
      // Three 14px steps in one direction must not swallow each other into one
      // 42px merge; each pair is compared before any edge has moved.
      const outline = materialAddressOutline(projection({
        rows: [
          { blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 142 },
          { blockEnd: 180, blockStart: 140, inlineEnd: 600, inlineStart: 128 },
          { blockEnd: 220, blockStart: 180, inlineEnd: 600, inlineStart: 114 },
        ],
        run: { endInline: 600, endRow: 2, startInline: 142, startRow: 0 },
      }), { cornerRadius: 4, minimumStepExtent: 8 })!;
      // Each 14px step is wider than the 8px threshold, so none is opened.
      expect(outline.bands.map((band) => band.left)).toEqual([142, 128, 114]);
    });

    it("mirrors the policy for right-to-left material", () => {
      const outline = materialAddressOutline(stepped({
        run: { endInline: 100, endRow: 1, startInline: 486, startRow: 0 },
        textDirection: "rtl",
      }), { cornerRadius: 10, minimumStepExtent: 20 })!;
      // The short step is opened on whichever physical side carries it.
      const rights = outline.bands.map((band) => band.right);
      const lefts = outline.bands.map((band) => band.left);
      expect(new Set(rights).size + new Set(lefts).size).toBeLessThan(4);
      expect((outline.path.match(/M/g) ?? []).length).toBe(1);
    });

    it("leaves a single-row interval and precise addresses untouched", () => {
      const single = materialAddressOutline(projection({
        rows: [ROWS[0]!],
        run: { endInline: 520, endRow: 0, startInline: 300, startRow: 0 },
      }), { cornerRadius: 10, minimumStepExtent: 20 })!;
      expect([single.bands[0]!.left, single.bands[0]!.right]).toEqual([300, 520]);
      // Without a threshold nothing merges at all.
      const precise = materialAddressOutline(stepped(), { cornerRadius: 4 })!;
      expect(precise.bands.map((band) => band.left)).toEqual([114, 100]);
      expect(precise.bands.map((band) => band.right)).toEqual([600, 520]);
    });

    it("stays one closed ring after opening a step", () => {
      const outline = materialAddressOutline(stepped(), { cornerRadius: 10, minimumStepExtent: 20 })!;
      expect((outline.path.match(/M/g) ?? []).length).toBe(1);
      expect((outline.path.match(/Z/g) ?? []).length).toBe(1);
    });
  });

  it("fails closed instead of painting something it cannot prove", () => {
    expect(materialAddressOutline(null)).toBeNull();
    expect(materialAddressOutline(projection({ rows: [] }))).toBeNull();
    expect(materialAddressOutline(projection({
      writingMode: "vertical-rl" as MaterialAddressProjection["writingMode"],
    }))).toBeNull();
    expect(materialAddressOutline(projection(), { edgeSnapExtent: Number.NaN })).toBeNull();
  });
});
