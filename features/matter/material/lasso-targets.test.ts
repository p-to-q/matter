import { describe, expect, it } from "vitest";
import { prepareLasso } from "./lasso-geometry";
import { resolveLassoTargets, type LassoTarget } from "./lasso-targets";

const lasso = prepareLasso([
  { x: 0, y: 0 },
  { x: 80, y: 0 },
  { x: 80, y: 50 },
  { x: 0, y: 50 },
])!;

function target(overrides: Partial<LassoTarget> = {}): LassoTarget {
  return {
    nodeId: "node_a",
    text: "第一句，第二句。第三句。",
    bounds: { left: 5, top: 5, right: 75, bottom: 45 },
    measurement: [
      { index: 0, rects: [{ x: 10, y: 10, width: 30, height: 12 }] },
      { index: 1, rects: [{ x: 42, y: 10, width: 28, height: 12 }] },
      { index: 2, rects: [{ x: 120, y: 10, width: 28, height: 12 }] },
    ],
    ...overrides,
  };
}

describe("lasso target resolution", () => {
  it("resolves one contiguous selection from cached fragment geometry", () => {
    expect(resolveLassoTargets(lasso, [target()])).toMatchObject({
      kind: "selection",
      selection: { nodeId: "node_a", start: 0, selectedText: "第一句，第二句" },
    });
  });

  it("keeps empty, pending, and failed measurements distinct from success", () => {
    expect(resolveLassoTargets(lasso, [target({
      bounds: { left: 100, top: 100, right: 150, bottom: 140 },
    })])).toEqual({ kind: "empty-closed" });
    expect(resolveLassoTargets(lasso, [target({ measurement: "pending" })]))
      .toEqual({ kind: "ambiguous" });
    expect(resolveLassoTargets(lasso, [target({ measurement: "failed" })]))
      .toEqual({ kind: "ambiguous" });
  });

  it("rejects cross-node and non-adjacent hits instead of previewing success", () => {
    const second = target({ nodeId: "node_b", text: "另一句。" });
    expect(resolveLassoTargets(lasso, [target(), second])).toEqual({ kind: "ambiguous" });
    expect(resolveLassoTargets(lasso, [target({
      measurement: [
        { index: 0, rects: [{ x: 10, y: 10, width: 20, height: 12 }] },
        { index: 2, rects: [{ x: 40, y: 10, width: 20, height: 12 }] },
      ],
    })])).toEqual({ kind: "ambiguous" });
  });
});
