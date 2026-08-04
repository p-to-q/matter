import { describe, expect, it } from "vitest";
import { lassoRenderPaths } from "./lasso-path";

describe("lasso render paths", () => {
  it("smooths only the ink and exposes the semantic straight closing seam", () => {
    const paths = lassoRenderPaths([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ]);
    expect(paths.ink).toContain(" Q ");
    expect(paths.ink).not.toContain(" Z");
    expect(paths.closure).toBe("M 0 20 L 0 0");
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it("keeps an open in-progress trace smooth without inventing a semantic close", () => {
    const paths = lassoRenderPaths([{ x: 1, y: 2 }, { x: 5, y: 6 }]);
    expect(paths.ink).toBe("M 1 2 Q 1 2 3 4 L 5 6");
    expect(paths.closure).toBe("");
  });

  it("returns empty paths for invalid input", () => {
    expect(lassoRenderPaths([{ x: Number.NaN, y: 0 }])).toEqual({ ink: "", closure: "" });
  });
});
