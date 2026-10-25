import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "./columnar-layout";
import type { ColumnarLayout, LayoutNode } from "./model";
import {
  OPERATION_TRAIL_LIMITS as LIMITS,
  OPERATION_TRAIL_PX as PX,
  operationTrailGeometry as buildOperationTrail,
  operationTrailNodes,
  snapBox,
  snapStrokeCentre,
  trailEdgeAlpha,
  trailWindow,
  type TrailRect,
  type TrailMaterialBounds,
} from "./operation-trail";

const material = (nodeId: string, bounds: TrailRect, firstRow = bounds, bottomExtent = 0) =>
  ({ nodeId, bounds, firstRow, bottomExtent });

/** These fixtures deliberately fill their measured material boxes, unlike centred short text. */
function operationTrailGeometry(input: Omit<Parameters<typeof buildOperationTrail>[0], "materialBounds"> & {
  materialBounds?: TrailMaterialBounds | null;
}) {
  const required = input.layout === null || input.lineages === null ? null :
    operationTrailNodes(input.layout, input.lineages.slice(0, LIMITS.targets), input.descendantsOf ?? null);
  return buildOperationTrail({
    ...input,
    materialBounds: input.materialBounds === undefined
      ? input.layout === null || required === null ? null : {
          layoutEpoch: input.layout.layoutEpoch,
          passages: required.nodes.map(({ box }) => material(box.nodeId,
            { x: box.x, y: box.y, width: box.width, height: box.height })),
        }
      : input.materialBounds,
  });
}

function node(id: string, parentId: string | null, depth: number, height = 40): LayoutNode {
  return { id, parentId, depth, size: { width: 200, height } };
}

function laidOut(nodes: LayoutNode[] = TREE, epoch = 5): ColumnarLayout {
  const result = layoutColumnarTree({
    nodes,
    origin: { x: 0, y: 0 },
    layoutEpoch: epoch,
    columnWidth: 200,
    columnGap: 40,
    siblingGap: 20,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.layout;
}

// a -> b -> c -> d, with side branches that must never join the trail.
const TREE: LayoutNode[] = [
  node("a", null, 0),
  node("b", "a", 1),
  node("c", "b", 2),
  node("d", "c", 3),
  node("c2", "b", 2),
  node("b2", "a", 1),
];

const WIDE: TrailRect = { x: -3000, y: -3000, width: 9000, height: 9000 };

function geometry(overrides: Partial<Parameters<typeof operationTrailGeometry>[0]> = {}) {
  return operationTrailGeometry({
    layout: laidOut(),
    currentLayoutEpoch: 5,
    lineages: [["a", "b", "c", "d"]],
    zoom: 1,
    window: WIDE,
    ...overrides,
  });
}

/** A target with `children` children, each with `grand` children of its own. */
function branch(children: number, grand = 0, deep = false): LayoutNode[] {
  const nodes: LayoutNode[] = [node("t", null, 0)];
  for (let child = 0; child < children; child += 1) {
    nodes.push(node(`k${child}`, "t", 1));
    for (let index = 0; index < grand; index += 1) {
      nodes.push(node(`g${child}_${index}`, `k${child}`, 2));
      if (deep && child === 0 && index === 0) nodes.push(node("deep", `g${child}_${index}`, 3));
    }
  }
  return nodes;
}

function commands(d: string): [string, number[]][] {
  return Array.from(d.matchAll(/([MLAZh])([^MLAZh]*)/gu), (match) => [
    match[1]!,
    match[2]!.trim().split(/[ ,]+/u).filter((part) => part.length > 0).map(Number),
  ] as [string, number[]]);
}

describe("operationTrailNodes", () => {
  const layout = laidOut();

  it("is one passage per lineage step, root first, merged across lineages", () => {
    const single = operationTrailNodes(layout, [["a", "b", "c"]], null)!;
    expect(single.nodes.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(single.nodes.map(({ target }) => target)).toEqual([false, false, true]);
    const union = operationTrailNodes(layout, [["a", "b", "c"], ["a", "b2"]], null)!;
    expect(union.nodes.map(({ id }) => id)).toEqual(["a", "b", "c", "b2"]);
    expect(union.nodes.filter(({ target }) => target).map(({ id }) => id)).toEqual(["c", "b2"]);
  });

  it("never names a sibling branch or a descendant of the target unless descendants were asked for", () => {
    const nodes = operationTrailNodes(layout, [["a", "b", "c"]], null)!.nodes;
    expect(nodes.some(({ id }) => id === "c2" || id === "b2" || id === "d")).toBe(false);
  });

  it("draws nothing for an unknown, unlaid-out or disagreeing lineage", () => {
    expect(operationTrailNodes(layout, [], null)).toBeNull();
    expect(operationTrailNodes(layout, [[]], null)).toBeNull();
    expect(operationTrailNodes(layout, [["a", "b", "ghost"]], null)).toBeNull();
    expect(operationTrailNodes(layout, [["a", "b2", "c"]], null)).toBeNull();
    expect(operationTrailNodes(layout, [["a", "b", "b", "c"]], null)).toBeNull();
    expect(operationTrailNodes(layout, [["a", "b", "c"], ["a", "b2", "c"]], null)).toBeNull();
  });

  it("adds the children of the one selected passage, and their children while they fit", () => {
    const result = operationTrailNodes(laidOut(branch(3, 2)), [["t"]], "t")!;
    expect(result.nodes.filter(({ kind }) => kind === "down").map(({ id }) => id)).toEqual([
      "k0", "k1", "k2", "g0_0", "g0_1", "g1_0", "g1_1", "g2_0", "g2_1",
    ]);
    expect(result.more).toBeNull();
  });

  it("draws the first level only, and says more once, when there are more than six children", () => {
    const result = operationTrailNodes(laidOut(branch(9, 1)), [["t"]], "t")!;
    expect(result.nodes.filter(({ kind }) => kind === "down").map(({ id }) => id))
      .toEqual(["k0", "k1", "k2", "k3", "k4", "k5"]);
    expect(result.more).toBe("k5");
  });

  it("stops at the first level when anything lies deeper than two below, or the grandchildren are many", () => {
    const deeper = operationTrailNodes(laidOut(branch(3, 1, true)), [["t"]], "t")!;
    expect(deeper.nodes.filter(({ kind }) => kind === "down").map(({ id }) => id)).toEqual(["k0", "k1", "k2"]);
    expect(deeper.more).toBe("k2");
    const many = operationTrailNodes(laidOut(branch(5, 2)), [["t"]], "t")!;
    expect(many.nodes.filter(({ kind }) => kind === "down")).toHaveLength(5);
    expect(many.more).toBe("k4");
    // The cap is a count, not a feeling.
    expect(LIMITS.children).toBe(6);
    expect(LIMITS.grandchildren).toBe(8);
  });

  it("never draws the subtree of a large branch", () => {
    const result = operationTrailNodes(laidOut(branch(40, 5)), [["t"]], "t")!;
    expect(result.nodes.length).toBeLessThanOrEqual(1 + LIMITS.children);
  });

  it("draws no children for a passage with none, or when descendants were not asked for", () => {
    expect(operationTrailNodes(laidOut(branch(0)), [["t"]], "t")!.nodes).toHaveLength(1);
    expect(operationTrailNodes(laidOut(branch(3)), [["t"]], null)!.nodes).toHaveLength(1);
  });

  it("never draws siblings of the path", () => {
    const result = operationTrailNodes(layout, [["a", "b", "c"]], "c")!;
    expect(result.nodes.some(({ id }) => id === "c2" || id === "b2")).toBe(false);
    expect(result.nodes.filter(({ kind }) => kind === "down").map(({ id }) => id)).toEqual(["d"]);
  });
});

describe("operationTrailGeometry", () => {
  it("draws the current publication, and nothing for another epoch or no layout", () => {
    expect(geometry()).not.toBeNull();
    expect(geometry({ currentLayoutEpoch: 6 })).toBeNull();
    expect(geometry({ currentLayoutEpoch: 4 })).toBeNull();
    expect(geometry({ currentLayoutEpoch: null })).toBeNull();
    expect(geometry({ layout: null })).toBeNull();
    expect(geometry({ lineages: null })).toBeNull();
  });

  it("refuses a degenerate camera or window", () => {
    expect(geometry({ zoom: 0 })).toBeNull();
    expect(geometry({ zoom: Number.NaN })).toBeNull();
    expect(geometry({ window: { x: 0, y: 0, width: 0, height: 10 } })).toBeNull();
    expect(geometry({ window: { ...WIDE, x: Number.NaN } })).toBeNull();
    expect(geometry({ window: { ...WIDE, height: Number.POSITIVE_INFINITY } })).toBeNull();
    expect(geometry({ grid: { x0: 0, y0: 0, dpr: 0 } })).toBeNull();
    expect(geometry({ grid: { x0: Number.NaN, y0: 0, dpr: 2 } })).toBeNull();
  });

  it("refuses absent, stale, duplicate, missing, non-finite or out-of-passage material bounds", () => {
    const layout = laidOut();
    const receipt: TrailMaterialBounds = {
      layoutEpoch: 5,
      passages: layout.boxes.filter((box) => ["a", "b", "c", "d"].includes(box.nodeId)).map((box) => material(box.nodeId, {
        x: box.x, y: box.y, width: box.width, height: box.height,
      })),
    };
    expect(geometry({ materialBounds: null })).toBeNull();
    expect(geometry({ materialBounds: { ...receipt, layoutEpoch: 4 } })).toBeNull();
    expect(geometry({ materialBounds: { ...receipt, passages: receipt.passages.slice(1) } })).toBeNull();
    expect(geometry({ materialBounds: { ...receipt, passages: [...receipt.passages, receipt.passages[0]!] } })).toBeNull();
    expect(geometry({ materialBounds: { ...receipt, passages: [
      ...receipt.passages.slice(0, -1), material("unrelated", receipt.passages[0]!.bounds),
    ] } })).toBeNull();
    for (const bounds of [
      { ...receipt.passages[0]!.bounds, width: Number.NaN },
      { ...receipt.passages[0]!.bounds, x: -8 },
      { ...receipt.passages[0]!.bounds, height: 0 },
      { ...receipt.passages[0]!.bounds, height: 100 },
    ]) {
      expect(geometry({ materialBounds: {
        ...receipt, passages: [material("a", bounds), ...receipt.passages.slice(1)],
      } })).toBeNull();
    }
  });

  it("attaches both points to centred short material instead of the invisible column edges", () => {
    const layout = laidOut([node("a", null, 0), node("b", "a", 1)]);
    const trail = geometry({ layout, lineages: [["a", "b"]], materialBounds: {
      layoutEpoch: 5,
      passages: [
        material("a", { x: 60, y: 10, width: 80, height: 20 }),
        material("b", { x: 290, y: 10, width: 100, height: 20 }),
      ],
    } })!;
    expect(commands(trail.up.line)).toEqual([["M", [148, 20]], ["L", [282, 20]]]);
    expect(commands(trail.up.dots)).toEqual([["M", [148, 20]], ["h", [0]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 282, y: 20 }]);
  });

  it("retains the published bend corridor when real first rows are disjoint", () => {
    const layout = laidOut([node("a", null, 0, 140), node("b", "a", 1, 80)]);
    const trail = geometry({ layout, lineages: [["a", "b"]], materialBounds: {
      layoutEpoch: 5,
      passages: [
        material("a", { x: 50, y: 10, width: 100, height: 120 }, { x: 50, y: 70, width: 100, height: 20 }),
        material("b", { x: 290, y: 10, width: 100, height: 60 }, { x: 290, y: 10, width: 100, height: 20 }),
      ],
    } })!;
    const path = commands(trail.up.line);
    expect(path[0]).toEqual(["M", [158, 80]]);
    expect(path.at(-1)).toEqual(["L", [282, 20]]);
    expect(path.filter(([letter]) => letter === "A")[0]![1][5]).toBe(layout.edges[0]!.points[1].x);
  });

  it("keeps a short passage parallel with a two-line child's true first row, not the paragraph/image midpoint", () => {
    const layout = laidOut([node("a", null, 0, 140), node("b", "a", 1, 80)]);
    const trail = geometry({ layout, lineages: [["a", "b"]], materialBounds: { layoutEpoch: 5, passages: [
      material("a", { x: 50, y: 10, width: 100, height: 120 }, { x: 65, y: 10, width: 70, height: 20 }),
      material("b", { x: 290, y: 10, width: 100, height: 60 }, { x: 300, y: 10, width: 80, height: 20 }),
    ] } })!;
    expect(commands(trail.up.line)).toEqual([["M", [143, 20]], ["L", [292, 20]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 292, y: 20 }]);
    expect(PX.stroke).toBe(2.5);
    expect(PX.corner).toBe(4);
  });

  it("bounds Elastic damage by its exact receipt and the current publication, never the whole deep tree", () => {
    const base = laidOut([node("a", null, 0), node("b", "a", 1)]);
    const layout = { ...base, bounds: { ...base.bounds, height: 200 } };
    const firstRow = { x: 60, y: 10, width: 80, height: 20 };
    const passages = [material("a", { x: 60, y: 10, width: 80, height: 110 }, firstRow, 80),
      material("b", { x: 290, y: 10, width: 100, height: 20 })];
    const input = { layout, lineages: [["a", "b"]], materialBounds: { layoutEpoch: 5, passages } };
    expect(geometry(input)).not.toBeNull();
    for (const bottomExtent of [0, 20, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
        passages: [{ ...passages[0]!, bottomExtent }, passages[1]!] } })).toBeNull();
    }
    expect(geometry({ ...input, materialBounds: { layoutEpoch: 5, passages: [
      material("a", { x: 60, y: 10, width: 80, height: 300 }, firstRow, 1000), passages[1]!,
    ] } })).toBeNull();
    expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
      passages: [{ ...passages[0]!, bottomExtent: 1000000 }, passages[1]!] } })).toBeNull();
    for (const row of [{ ...firstRow, x: 50 }, { ...firstRow, width: Number.NaN }, { ...firstRow, y: 120 }]) {
      expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
        passages: [{ ...passages[0]!, firstRow: row }, passages[1]!] } })).toBeNull();
    }
  });

  it("allows exactly one canvas unit at the publication boundary, never a larger extent or envelope", () => {
    const base = laidOut([node("a", null, 0), node("b", "a", 1)]);
    const layout = { ...base, bounds: { ...base.bounds, height: 200 } };
    const firstRow = { x: 60, y: 10, width: 80, height: 20 };
    const passages = [material("a", firstRow, firstRow, 161),
      material("b", { x: 290, y: 10, width: 100, height: 20 })];
    const input = { layout, lineages: [["a", "b"]], materialBounds: { layoutEpoch: 5, passages } };
    // The actual ink stays small: damage itself must still obey box.bottom + extent <= published.bottom + 1.
    expect(layout.boxes[0]!.y + layout.boxes[0]!.height + passages[0]!.bottomExtent).toBe(201);
    expect(geometry(input)).not.toBeNull();
    expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
      passages: [{ ...passages[0]!, bottomExtent: 161.01 }, passages[1]!] } })).toBeNull();
    expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
      passages: [{ ...passages[0]!, bounds: { ...firstRow, height: 191 } }, passages[1]!] } })).not.toBeNull();
    expect(geometry({ ...input, materialBounds: { layoutEpoch: 5,
      passages: [{ ...passages[0]!, bounds: { ...firstRow, height: 191.01 } }, passages[1]!] } })).toBeNull();
  });

  it("joins a deep first-child chain as separate adjacent bridges, never across passage interiors", () => {
    const layout = laidOut();
    const trail = geometry()!;
    const steps = trail.up.line.split("M").filter(Boolean).map((part) => commands(`M${part}`));
    expect(steps).toHaveLength(3);
    for (let index = 0; index < steps.length; index += 1) {
      const parent = layout.boxes.find(({ nodeId }) => nodeId === ["a", "b", "c"][index])!;
      const child = layout.boxes.find(({ nodeId }) => nodeId === ["b", "c", "d"][index])!;
      expect(steps[index]![0]).toEqual(["M", [parent.x + parent.width + PX.clearance, parent.y + parent.height / 2]]);
      expect(steps[index]!.at(-1)).toEqual(["L", [child.x - PX.clearance, child.y + child.height / 2]]);
      expect(steps[index]!.every(([, values]) => values[0]! >= parent.x + parent.width && values[0]! <= child.x)).toBe(true);
    }
    expect(trail.up.line).not.toContain("-24");
  });

  it("refuses missing, duplicate, wrong-parent, non-finite and detached published bridges", () => {
    const layout = laidOut();
    const edge = layout.edges.find(({ childId }) => childId === "b")!;
    const replace = (replacement: typeof edge) => ({
      ...layout,
      edges: layout.edges.map((candidate) => candidate === edge ? replacement : candidate),
    });
    expect(geometry({ layout: { ...layout, edges: layout.edges.filter((candidate) => candidate !== edge) } })).toBeNull();
    expect(geometry({
      layout: { ...layout, edges: layout.edges.filter((candidate) => candidate !== edge) },
      window: { x: 1000, y: 1000, width: 300, height: 300 },
    })).toBeNull();
    expect(geometry({ layout: { ...layout, edges: [...layout.edges, edge] } })).toBeNull();
    expect(geometry({ layout: replace({ ...edge, parentId: "b2" }) })).toBeNull();
    expect(geometry({ layout: replace({ ...edge, points: [{ ...edge.points[0], x: Number.NaN }, edge.points[1], edge.points[2], edge.points[3]] }) })).toBeNull();
    expect(geometry({ layout: replace({ ...edge, points: [edge.points[0], edge.points[1], edge.points[2], { ...edge.points[3], y: edge.points[3].y + 1 }] }) })).toBeNull();
    expect(geometry({ layout: replace({ ...edge, points: [edge.points[0], { ...edge.points[1], y: edge.points[1].y + 1 }, edge.points[2], edge.points[3]] }) })).toBeNull();
    expect(geometry({ layout: { ...layout, boxes: [...layout.boxes, layout.boxes[1]!] } })).toBeNull();
  });

  it("does not use nearby or unrelated bridges as substitutes for an exact parent-child pair", () => {
    const layout = laidOut();
    const unrelated = layout.edges.find(({ childId }) => childId === "b2")!;
    const missing = { ...layout, edges: layout.edges.filter(({ childId }) => childId !== "b") };
    expect(geometry({ layout: { ...missing, edges: [...missing.edges, { ...unrelated, childId: "c2" }] } })).toBeNull();
    expect(geometry({ layout: { ...layout, edges: [...layout.edges, unrelated] } })).toEqual(geometry());
  });

  it.each([[160, 40], [40, 160]])("levels unequal overlapping first-child rows (%i, %i) inside both rows", (parentHeight, childHeight) => {
    const layout = laidOut([node("a", null, 0, parentHeight), node("b", "a", 1, childHeight)]);
    const trail = geometry({ layout, lineages: [["a", "b"]] })!;
    const path = commands(trail.up.line);
    const common = Math.min(parentHeight - 0.01, childHeight / 2);
    expect(path).toEqual([["M", [208, common]], ["L", [232, common]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 232, y: common }]);
    for (const [letter, values] of path) {
      const x = letter === "A" ? values[5]! : values[0]!;
      const y = letter === "A" ? values[6]! : values[1]!;
      expect(x).toBeGreaterThanOrEqual(200);
      expect(x).toBeLessThanOrEqual(240);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(Math.min(parentHeight, childHeight));
    }
  });

  it("shares the small receiving row's centre with a larger top-aligned parent row", () => {
    const layout = laidOut([node("a", null, 0, 140), node("b", "a", 1, 40)]);
    const trail = geometry({ layout, lineages: [["a", "b"]], materialBounds: { layoutEpoch: 5, passages: [
      material("a", { x: 50, y: 8, width: 100, height: 100 }, { x: 50, y: 8, width: 100, height: 40 }),
      material("b", { x: 290, y: 5, width: 100, height: 20 }),
    ] } })!;
    expect(commands(trail.up.line)).toEqual([["M", [158, 15]], ["L", [282, 15]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 282, y: 15 }]);
  });

  it("keeps one shared outgoing point for both a level first child and a later sibling", () => {
    const layout = laidOut([node("a", null, 0, 140), node("b", "a", 1), node("c", "a", 1)]);
    const trail = geometry({ layout, lineages: [["a", "b"], ["a", "c"]], materialBounds: { layoutEpoch: 5, passages: [
      material("a", { x: 50, y: 8, width: 100, height: 100 }, { x: 50, y: 8, width: 100, height: 40 }),
      material("b", { x: 290, y: 5, width: 100, height: 20 }),
      material("c", { x: 290, y: 65, width: 100, height: 20 }),
    ] } })!;
    const paths = trail.up.line.split("M").filter(Boolean).map((path) => commands(`M${path}`));
    expect(paths[0]).toEqual([["M", [158, 15]], ["L", [282, 15]]]);
    expect(paths[1]![0]).toEqual(["M", [158, 15]]);
    expect(paths[1]!.at(-1)).toEqual(["L", [282, 75]]);
    expect(paths[1]!.filter(([letter]) => letter === "A")).toHaveLength(2);
    expect(commands(trail.up.dots)).toEqual([["M", [158, 15]], ["h", [0]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 282, y: 15 }, { nodeId: "c", x: 282, y: 75 }]);
  });

  it("never guesses an unmeasured first child's ordinate from a later sibling's overlapping row", () => {
    const layout = laidOut([node("a", null, 0, 160), node("b", "a", 1), node("c", "a", 1)]);
    const trail = geometry({ layout, lineages: [["a", "c"]], materialBounds: { layoutEpoch: 5, passages: [
      material("a", { x: 50, y: 0, width: 100, height: 120 }),
      material("c", { x: 290, y: 60, width: 100, height: 20 }),
    ] } })!;
    const path = commands(trail.up.line);
    expect(path[0]).toEqual(["M", [158, 60]]);
    expect(path.at(-1)).toEqual(["L", [282, 70]]);
    expect(path.filter(([letter]) => letter === "A")).toHaveLength(2);
    expect(trail.targets).toEqual([{ nodeId: "c", x: 282, y: 70 }]);
  });

  it("snaps a common ordinate once at each zoom and DPR without detaching its target", () => {
    const layout = laidOut([node("a", null, 0, 140), node("b", "a", 1)]);
    const materialBounds = { layoutEpoch: 5, passages: [
      material("a", { x: 50, y: 8, width: 100, height: 100 }, { x: 50, y: 8, width: 100, height: 40 }),
      material("b", { x: 290, y: 5, width: 100, height: 20 }),
    ] };
    for (const zoom of [0.6, 1, 1.8]) for (const dpr of [1, 2, 3]) {
      const trail = geometry({ layout, lineages: [["a", "b"]], materialBounds, zoom, grid: { x0: 0.37, y0: 0.23, dpr } })!;
      const path = commands(trail.up.line);
      expect(path).toHaveLength(2);
      const [, [sourceX, sourceY]] = path[0]!;
      const [, [targetX, targetY]] = path[1]!;
      expect(sourceX).toBeLessThan(targetX!);
      expect(sourceY).toBe(targetY);
      expect(targetY).toBeGreaterThan(8);
      expect(targetY).toBeLessThan(25);
      expect(trail.targets).toEqual([{ nodeId: "b", x: targetX, y: targetY }]);
    }
  });

  it("keeps real row-centre ports if pixel snapping leaves a narrow common interior", () => {
    const layout = laidOut([node("a", null, 0), node("b", "a", 1)]);
    const trail = geometry({ layout, lineages: [["a", "b"]], grid: { x0: 0, y0: 0, dpr: 1 },
      materialBounds: { layoutEpoch: 5, passages: [
        material("a", { x: 50, y: 0.1, width: 100, height: 1 }),
        material("b", { x: 290, y: 1, width: 100, height: 1 }),
      ] },
    })!;
    const path = commands(trail.up.line);
    expect(path[0]).toEqual(["M", [158.5, 0.5]]);
    expect(path.at(-1)).toEqual(["L", [282.5, 1.5]]);
    expect(path.filter(([letter]) => letter === "A")).toHaveLength(2);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 282.5, y: 1.5 }]);
  });

  it("attaches ancestor dots and the target bead to each passage's left boundary midpoint", () => {
    const layout = laidOut();
    const trail = geometry({ lineages: [["a", "b", "c"]] })!;
    expect(commands(trail.up.dots).filter(([letter]) => letter === "M")).toHaveLength(3);
    const target = trail.targets[0]!;
    const box = layout.boxes.find(({ nodeId }) => nodeId === "c")!;
    expect(target.nodeId).toBe("c");
    expect(target.x).toBe(box.x - PX.clearance);
    expect(target.y).toBe(box.y + box.height / 2);
    expect(trail.targets).toHaveLength(1);
  });

  it("keeps attachments at the actual passage boundary at every zoom", () => {
    const layout = laidOut();
    const box = layout.boxes.find(({ nodeId }) => nodeId === "b")!;
    for (const zoom of [0.6, 1, 2, 4]) {
      const trail = geometry({ lineages: [["a", "b"]], zoom })!;
      expect((box.x - trail.targets[0]!.x) * zoom).toBeCloseTo(PX.clearance, 1);
      expect(trail.targets[0]!.y).toBe(box.y + box.height / 2);
    }
  });

  it("keeps the larger target clear of text after screen-grid snapping at permitted zooms and DPRs", () => {
    const box = laidOut().boxes.find(({ nodeId }) => nodeId === "b")!;
    expect(PX).toMatchObject({ bead: 5, target: 7, clearance: 8, stroke: 2.5 });
    for (const zoom of [0.6, 1, 1.8]) {
      for (const dpr of [1, 1.25, 2, 3]) {
        const trail = geometry({ lineages: [["a", "b"]], zoom,
          grid: { x0: 13.37, y0: 211.61, dpr } })!;
        const textToVisibleEdge = (box.x - trail.targets[0]!.x) * zoom - PX.target / 2;
        // Snapping moves the centre by at most half a device pixel; world values round to .01.
        expect(textToVisibleEdge).toBeGreaterThanOrEqual(PX.clearance - PX.target / 2 - 0.5 / dpr - 0.01);
        expect(textToVisibleEdge).toBeGreaterThan(0);
      }
    }
  });

  it("uses real boundary midpoints with unequal heights and a nearby sibling", () => {
    const layout = laidOut([node("a", null, 0, 140), node("s0", "a", 1), node("s1", "a", 1, 80)]);
    const lower = layout.boxes.find(({ nodeId }) => nodeId === "s1")!;
    const upper = layout.boxes.find(({ nodeId }) => nodeId === "s0")!;
    const gap = lower.y - (upper.y + upper.height);
    expect(gap).toBe(20);
    const trail = operationTrailGeometry({
      layout, currentLayoutEpoch: 5, lineages: [["a", "s1"]], zoom: 1, window: WIDE,
    })!;
    expect(trail.targets[0]!.y).toBe(lower.y + lower.height / 2);
    const path = commands(trail.up.line);
    expect(path[0]).toEqual(["M", [208, 70]]);
    expect(path.at(-1)).toEqual(["L", [lower.x - PX.clearance, lower.y + lower.height / 2]]);
  });

  it("draws only a quiet anchor for a top-level target: its bead and no line", () => {
    const trail = geometry({ lineages: [["a"]] })!;
    expect(trail.up).toEqual({ line: "", dots: "", arrows: "" });
    expect(trail.down.line).toBe("");
    expect(trail.targets.map(({ nodeId }) => nodeId)).toEqual(["a"]);
    expect(trail.chevron).toBeNull();
  });

  it("is made only of level and plumb legs and rounded corners, nothing diagonal", () => {
    const trail = geometry({ lineages: [["a", "b", "c2"]] })!;
    let at: [number, number] | null = null;
    for (const [letter, numbers] of commands(trail.up.line)) {
      if (letter === "M") {
        at = [numbers[0]!, numbers[1]!];
      } else if (letter === "L") {
        const [x, y] = numbers as [number, number];
        expect(Math.min(Math.abs(x - at![0]), Math.abs(y - at![1]))).toBeLessThan(0.02);
        at = [x, y];
      } else {
        expect(letter).toBe("A");
        expect(numbers[0]).toBe(numbers[1]);
        at = [numbers[5]!, numbers[6]!];
      }
    }
  });

  it("turns with one small corner radius of 4 screen px at every zoom, and a short leg never overshoots", () => {
    for (const zoom of [0.6, 1, 2]) {
      const trail = geometry({ lineages: [["a", "b", "c2"]], zoom })!;
      const arcs = commands(trail.up.line).filter(([letter]) => letter === "A");
      expect(arcs.length).toBeGreaterThan(0);
      for (const [, numbers] of arcs) expect(numbers[0]! * zoom).toBeLessThanOrEqual(PX.corner + 0.01);
    }
    const shallow = laidOut([node("a", null, 0), node("b", "a", 1, 54)]);
    const trail = operationTrailGeometry({
      layout: shallow, currentLayoutEpoch: 5, lineages: [["a", "b"]], zoom: 1, window: WIDE,
      materialBounds: { layoutEpoch: 5, passages: [
        material("a", { x: 0, y: 0, width: 200, height: 40 }, { x: 0, y: 5, width: 200, height: 6 }),
        material("b", { x: 240, y: 0, width: 200, height: 54 }, { x: 240, y: 12, width: 200, height: 6 }),
      ] },
    })!;
    const arcs = commands(trail.up.line).filter(([letter]) => letter === "A");
    expect(arcs).toHaveLength(2);
    expect(arcs[0]![1][0]).toBeCloseTo(3.5, 1);
  });

  it("removes a small typographic midpoint difference when the real row interiors overlap", () => {
    const near = laidOut([node("a", null, 0), node("b", "a", 1, 48)]);
    const trail = operationTrailGeometry({
      layout: near, currentLayoutEpoch: 5, lineages: [["a", "b"]], zoom: 1, window: WIDE,
    })!;
    expect(commands(trail.up.line)).toEqual([["M", [208, 24]], ["L", [232, 24]]]);
    expect(trail.targets).toEqual([{ nodeId: "b", x: 232, y: 24 }]);
  });

  it("keeps optional comparison arrows open and exactly on the receiving port", () => {
    const trail = geometry({ lineages: [["a", "b", "c2"]] })!;
    const arrows = commands(trail.up.arrows);
    expect(arrows.filter(([letter]) => letter === "Z")).toHaveLength(0);
    expect(arrows.filter(([letter]) => letter === "M")).toHaveLength(2);
    expect(arrows.filter(([letter]) => letter === "L")).toHaveLength(4);
    // Both edges arrive rightward at the child's left boundary, even after a vertical drop.
    const [first, second] = trail.up.arrows.split("M").filter(Boolean).map((part) => commands(`M${part}`));
    const [left1, tip1, right1] = first!.slice(0, 3).map(([, numbers]) => numbers as [number, number]);
    expect(left1![0]).toBeLessThan(tip1![0]);
    expect(left1![0]).toBe(right1![0]);
    expect(Math.abs(left1![1] - right1![1])).toBeCloseTo(PX.arrowWidth, 0);
    const [left2, tip2] = second!.slice(0, 3).map(([, numbers]) => numbers as [number, number]);
    expect(left2![0]).toBeLessThan(tip2![0]);
    expect(tip2![1]).toBe(trail.targets[0]!.y);
    expect(tip2![0]).toBe(trail.targets[0]!.x);
  });

  it("keeps the arrowhead the same screen size at every zoom", () => {
    for (const zoom of [0.6, 1, 2]) {
      const trail = geometry({ lineages: [["a", "b"]], zoom })!;
      const [left, tip, right] = commands(trail.up.arrows).slice(0, 3).map(([, numbers]) => numbers as [number, number]);
      expect((tip![0] - left![0]) * zoom).toBeCloseTo(PX.arrowLength, 1);
      expect(Math.abs(left![1] - right![1]) * zoom).toBeCloseTo(PX.arrowWidth, 1);
    }
  });

  it("draws the children below the target in their own lighter paths, with the same vocabulary", () => {
    const trail = operationTrailGeometry({
      layout: laidOut(branch(3, 0)), currentLayoutEpoch: 5, lineages: [["t"]], descendantsOf: "t", zoom: 1, window: WIDE,
    })!;
    expect(trail.up).toEqual({ line: "", dots: "", arrows: "" });
    expect(commands(trail.down.line).filter(([letter]) => letter === "M")).toHaveLength(3);
    expect(commands(trail.down.dots).filter(([letter]) => letter === "M")).toHaveLength(4);
    expect(commands(trail.down.arrows).filter(([letter]) => letter === "M")).toHaveLength(3);
    expect(trail.down.more).toBe("");
  });

  it("says more with three dots under the last drawn child", () => {
    const trail = operationTrailGeometry({
      layout: laidOut(branch(9, 0)), currentLayoutEpoch: 5, lineages: [["t"]], descendantsOf: "t", zoom: 1, window: WIDE,
    })!;
    expect(commands(trail.down.line).filter(([letter]) => letter === "M")).toHaveLength(LIMITS.children);
    const dots = commands(trail.down.more).filter(([letter]) => letter === "M").map(([, numbers]) => numbers as [number, number]);
    expect(dots).toHaveLength(3);
    expect(new Set(dots.map(([x]) => x)).size).toBe(1);
    expect(dots[1]![1]).toBeGreaterThan(dots[0]![1]);
  });

  it("is a union for several targets: a shared ancestor is drawn once, every target has its bead", () => {
    const trail = geometry({ lineages: [["a", "b", "c"], ["a", "b2"]] })!;
    expect(trail.targets.map(({ nodeId }) => nodeId)).toEqual(["c", "b2"]);
    // a and b are shared: one dot each, and one edge into b.
    expect(commands(trail.up.dots).filter(([letter]) => letter === "M")).toHaveLength(3);
    expect(commands(trail.up.line).filter(([letter]) => letter === "M")).toHaveLength(3);
  });

  it("caps the number of target beads", () => {
    const many = [node("r", null, 0), ...Array.from({ length: 12 }, (_, index) => node(`s${index}`, "r", 1))];
    const trail = operationTrailGeometry({
      layout: laidOut(many), currentLayoutEpoch: 5, zoom: 1, window: WIDE,
      lineages: many.slice(1).map((entry) => ["r", entry.id]),
    })!;
    expect(trail.targets).toHaveLength(LIMITS.targets);
  });

  it("culls dots outside the window and ends the thread in a cue where it leaves", () => {
    const full = geometry()!;
    expect(full.chevron).toBeNull();
    // The cut crosses the genuine b→c gap, not the interior of passage b.
    const clipped = geometry({ window: { x: 450, y: -3000, width: 9000, height: 9000 } })!;
    expect(clipped.chevron).not.toBeNull();
    expect(clipped.chevron!.angle).toBe(180);
    expect(clipped.chevron!.x).toBeGreaterThanOrEqual(clipped.window.x);
    expect(clipped.chevron!.x).toBeLessThanOrEqual(clipped.window.x + PX.chevronInset);
    expect(commands(clipped.up.dots).filter(([l]) => l === "M").length).toBeLessThan(commands(full.up.dots).filter(([l]) => l === "M").length);
    // The line itself is whole: the window clips it, and the fade softens the cut.
    expect(clipped.up.line).toBe(full.up.line);
  });

  it("does not invent a continuation across a clipped passage interior", () => {
    const full = geometry()!;
    const clipped = geometry({ window: { x: full.targets[0]!.x - 300, y: -3000, width: 9000, height: 9000 } })!;
    expect(clipped.chevron).toBeNull();
    expect(clipped.up.line).toBe(full.up.line);
  });

  it("points the cue up when the thread continues above", () => {
    const layout = laidOut();
    const trail = operationTrailGeometry({
      layout, currentLayoutEpoch: 5, lineages: [["a", "b", "c2"]], zoom: 1,
      window: { x: -3000, y: layout.boxes.find(({ nodeId }) => nodeId === "c2")!.y - 30, width: 9000, height: 9000 },
    })!;
    expect(trail.chevron).not.toBeNull();
    expect(trail.chevron!.angle).toBe(-90);
  });

  it("never pins an offscreen target as a fake node; only a genuine clipped bridge gets a cue", () => {
    const full = geometry()!;
    const past: TrailRect = { x: full.targets[0]!.x + 200, y: -3000, width: 9000, height: 9000 };
    const trail = geometry({ window: past })!;
    expect(trail.targets).toHaveLength(0);
    expect(trail.up.dots).toBe("");
    expect(trail.up.line).toBe(full.up.line);
    expect(trail.chevron).toBeNull();
    const crossing = geometry({ window: { x: 650, y: -3000, width: 50, height: 9000 } })!;
    expect(crossing.targets).toHaveLength(0);
    expect(crossing.chevron?.angle).toBe(0);
  });

  it("is deterministic and moves with the layout", () => {
    expect(geometry()).toEqual(geometry());
    const taller = laidOut(TREE.map((entry) => entry.id === "b" ? node("b", "a", 1, 140) : entry), 6);
    const before = geometry({ lineages: [["a", "b2"]] });
    const after = operationTrailGeometry({
      layout: taller, currentLayoutEpoch: 6, lineages: [["a", "b2"]], zoom: 1, window: WIDE,
    });
    expect(after!.up.line).not.toBe(before!.up.line);
  });
});

describe("the device pixel grid", () => {
  it("centres an even-width stroke on a pixel edge and an odd one on a pixel centre", () => {
    for (const screen of [10, 10.2, 10.49, 10.5, 10.9, 123.77]) {
      expect(snapStrokeCentre(screen, 1, 2) % 1).toBeCloseTo(0, 6);
      expect(snapStrokeCentre(screen, 2, 2) * 2 % 1).toBeCloseTo(0, 6);
      // The live 2.5px stroke rounds to odd device widths at dpr 1 and 2.
      expect(snapStrokeCentre(screen, 1, PX.stroke) % 1).toBeCloseTo(0.5, 6);
      expect(snapStrokeCentre(screen, 2, PX.stroke) * 2 % 1).toBeCloseTo(0.5, 6);
      expect(snapStrokeCentre(screen, 1, 1) % 1).toBeCloseTo(0.5, 6);
      expect(Math.abs(snapStrokeCentre(screen, 1, PX.stroke) - screen)).toBeLessThanOrEqual(1);
    }
    expect(snapStrokeCentre(7.3, 3, 1) * 3 % 1).toBeCloseTo(0.5, 6);
  });

  it("lands every anchor on the grid, in screen terms, at any zoom", () => {
    for (const [zoom, dpr] of [[1, 1], [0.6, 1], [2, 1], [1, 2], [1.37, 2]] as const) {
      const grid = { x0: 13.37, y0: 211.61, dpr };
      const trail = geometry({ lineages: [["a", "b", "c", "d"]], zoom, grid })!;
      const target = trail.targets[0]!;
      for (const [value, origin] of [[target.x, grid.x0], [target.y, grid.y0]] as const) {
        const device = (origin + zoom * value) * dpr;
        const fraction = ((device % 1) + 1) % 1;
        const expected = Math.round(PX.stroke * dpr) % 2 === 1 ? 0.5 : 0;
        expect(Math.abs(fraction - expected)).toBeLessThan(0.05);
      }
    }
  });

  it("widens the window to the device pixel that holds its corner, never narrowing it", () => {
    const window: TrailRect = { x: 10.3, y: 20.8, width: 100, height: 50 };
    const grid = { x0: 3.4, y0: 7.9, dpr: 1 };
    const box = snapBox(window, 1, grid);
    expect(box.x).toBeLessThanOrEqual(window.x);
    expect(box.y).toBeLessThanOrEqual(window.y);
    expect(box.x + box.width).toBeCloseTo(window.x + window.width, 1);
    expect(box.y + box.height).toBeCloseTo(window.y + window.height, 1);
    expect(((grid.x0 + box.x) % 1 + 1) % 1).toBeLessThan(0.02);
    expect(snapBox(window, 1, undefined)).toBe(window);
  });
});

describe("trailWindow and the edge fade", () => {
  it("maps the camera to the canvas's own coordinates", () => {
    expect(trailWindow({
      viewport: { x: -400, y: 100, zoom: 2 },
      worldSize: { width: 1000, height: 600 },
      canvasOrigin: { x: 50, y: 20 },
    })).toEqual({ x: 150, y: -70, width: 500, height: 300 });
  });

  it("ramps from nothing at the edge, through the knee, to full ink at the fade distance", () => {
    expect(trailEdgeAlpha(0)).toBe(0);
    expect(trailEdgeAlpha(-5)).toBe(0);
    expect(trailEdgeAlpha(PX.knee)).toBeCloseTo(PX.kneeAlpha, 6);
    expect(trailEdgeAlpha(PX.fade)).toBe(1);
    expect(trailEdgeAlpha(PX.fade + 100)).toBe(1);
    let last = 0;
    for (let distance = 1; distance <= PX.fade; distance += 1) {
      const alpha = trailEdgeAlpha(distance);
      expect(alpha).toBeGreaterThanOrEqual(last);
      last = alpha;
    }
  });

  it("is the same ramp the stylesheet draws as its mask", () => {
    const css = readFileSync(new URL("../components/OperationTrail.css", import.meta.url), "utf8");
    const rule = /\.operation-trail__line\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    expect(rule).toContain(`calc(${PX.knee} * var(--operation-trail-unit))`);
    expect(rule).toContain(`calc(${PX.fade} * var(--operation-trail-unit))`);
    expect(rule).toContain(`rgb(0 0 0 / ${String(PX.kneeAlpha).replace(/^0/u, "")})`);
    // Four edges, one definition: the mask is written once and used twice (prefixed and not).
    expect(rule.match(/linear-gradient/gu)).toHaveLength(4);
    expect(rule).toContain("mask-image: var(--operation-trail-mask)");
    expect(rule).toContain("mask-composite: intersect");
    expect(rule).toContain("pointer-events: none");
  });
});

describe("the stylesheet consumes the projected screen dimensions", () => {
  const css = readFileSync(new URL("../components/OperationTrail.css", import.meta.url), "utf8");
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]]/gu, "\\$&")}\\s*\\{([^}]*)\\}`, "u").exec(css)?.[1] ?? "";

  it("uses the owner's screen-sized strokes without competing CSS defaults", () => {
    for (const selector of [".operation-trail__path", ".operation-trail__arrows", ".operation-trail__chevron"]) {
      expect(rule(selector)).toContain("stroke-width: var(--operation-trail-stroke)");
      expect(rule(selector)).toContain("vector-effect: non-scaling-stroke");
    }
    expect(rule(".operation-trail__dots")).toContain("stroke-width: var(--operation-trail-bead)");
    expect(rule(".operation-trail__more")).toContain("stroke-width: var(--operation-trail-more-dot)");
    expect(css).not.toMatch(/stroke-width:\s*[\d.]|var\(--operation-trail-(?:stroke|bead|more-dot),/u);
    expect(rule(".operation-trail__bead")).toContain("fill: var(--trail-ink)");
    expect(css).not.toContain(".operation-trail__bead::before");
    expect(rule(".operation-trail__path")).toContain("vector-effect: non-scaling-stroke");
    expect(rule(".operation-trail__dots")).toContain("vector-effect: non-scaling-stroke");
  });
});
