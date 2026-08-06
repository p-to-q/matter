import { describe, expect, it } from "vitest";
import {
  projectMaterialFileRenderRanges,
  projectMaterialFileWindow,
  scrollTopForMaterialFileIndex,
} from "./material-file-window";

describe("material file window", () => {
  it("keeps small projections complete and windows a large fixed-height projection", () => {
    expect(projectMaterialFileWindow({
      rowCount: 3,
      rowHeight: 42,
      scrollTop: 0,
      viewportHeight: 300,
    })).toMatchObject({ start: 0, end: 3, windowed: false, totalHeight: 126 });

    expect(projectMaterialFileWindow({
      rowCount: 2_000,
      rowHeight: 42,
      scrollTop: 42 * 1_000,
      viewportHeight: 420,
      overscanRows: 2,
    })).toEqual({
      start: 998,
      end: 1_012,
      topSpacerHeight: 41_916,
      bottomSpacerHeight: 41_496,
      totalHeight: 84_000,
      windowed: true,
    });
  });

  it("clamps malformed scroll values and preserves exact spacer geometry", () => {
    const window = projectMaterialFileWindow({
      rowCount: 201,
      rowHeight: 48,
      scrollTop: Number.POSITIVE_INFINITY,
      viewportHeight: 96,
      overscanRows: 0,
    });

    expect(window).toMatchObject({ start: 0, end: 2, topSpacerHeight: 0, bottomSpacerHeight: 9_552 });
    expect(window.topSpacerHeight + (window.end - window.start) * 48 + window.bottomSpacerHeight)
      .toBe(window.totalHeight);
  });

  it("keeps a focused offscreen row mounted as a separate ordered range", () => {
    const window = projectMaterialFileWindow({
      rowCount: 2_000,
      rowHeight: 42,
      scrollTop: 42 * 1_000,
      viewportHeight: 420,
      overscanRows: 2,
    });
    expect(projectMaterialFileRenderRanges(window, 4)).toEqual([
      { start: 4, end: 5 },
      { start: 998, end: 1_012 },
    ]);
    expect(projectMaterialFileRenderRanges(window, 1_001)).toEqual([
      { start: 998, end: 1_012 },
    ]);
  });

  it("moves an active row into view without moving an already visible row", () => {
    expect(scrollTopForMaterialFileIndex({
      index: 3,
      rowCount: 2_000,
      rowHeight: 42,
      scrollTop: 42 * 10,
      viewportHeight: 42 * 5,
    })).toBe(42 * 3);
    expect(scrollTopForMaterialFileIndex({
      index: 15,
      rowCount: 2_000,
      rowHeight: 42,
      scrollTop: 42 * 10,
      viewportHeight: 42 * 5,
    })).toBe(42 * 11);
    expect(scrollTopForMaterialFileIndex({
      index: 12,
      rowCount: 2_000,
      rowHeight: 42,
      scrollTop: 42 * 10,
      viewportHeight: 42 * 5,
    })).toBe(42 * 10);
  });
});
