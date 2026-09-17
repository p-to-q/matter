import { describe, expect, it } from "vitest";
import { lassoRenderPaths } from "./lasso-path";

describe("lasso render paths", () => {
  it("paints the exact semantic polyline and exposes its straight closing seam", () => {
    const paths = lassoRenderPaths([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ]);
    expect(paths.ink).toBe("M 0 0 L 20 0 L 20 20 L 0 20");
    expect(paths.ink).not.toContain(" Q ");
    expect(paths.ink).not.toContain(" Z");
    expect(paths.closure).toBe("M 0 20 L 0 0");
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it("keeps an open in-progress trace exact without inventing a semantic close", () => {
    const paths = lassoRenderPaths([{ x: 1, y: 2 }, { x: 5, y: 6 }]);
    expect(paths.ink).toBe("M 1 2 L 5 6");
    expect(paths.closure).toBe("");
  });

  it("returns empty paths for invalid input", () => {
    expect(lassoRenderPaths([{ x: Number.NaN, y: 0 }])).toEqual({ ink: "", closure: "" });
  });

  it("uses the same bounded full-path compaction as semantic analysis", () => {
    const points = Array.from({ length: 2049 }, (_, index) => {
      const angle = index / 2048 * Math.PI * 2;
      return { x: 500 + Math.cos(angle) * 400, y: 500 + Math.sin(angle) * 320 };
    });
    const paths = lassoRenderPaths(points);
    expect((paths.ink.match(/ [ML] /g) ?? []).length).toBeLessThanOrEqual(256);
    expect(paths.ink).toContain(`L ${points.at(-1)!.x} ${points.at(-1)!.y}`);
  });
});
