import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "./columnar-layout";
import type { ColumnarLayout, LayoutNode } from "./model";
import {
  OPERATION_TRAIL_LIMITS as LIMITS,
  OPERATION_TRAIL_PX as PX,
  operationTrailGeometry,
  operationTrailNodes,
  snapBox,
  snapStrokeCentre,
  trailEdgeAlpha,
  trailWindow,
  type TrailRect,
} from "./operation-trail";

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
  });

  it("puts a dot on every ancestor, in the left gutter and above the passage's top, and a target bead on the target", () => {
    const layout = laidOut();
    const trail = geometry({ lineages: [["a", "b", "c"]] })!;
    expect(commands(trail.up.dots).filter(([letter]) => letter === "M")).toHaveLength(2);
    const target = trail.targets[0]!;
    const box = layout.boxes.find(({ nodeId }) => nodeId === "c")!;
    expect(target.nodeId).toBe("c");
    expect(target.x).toBeCloseTo(box.x - PX.gutter, 1);
    expect(target.y).toBeLessThan(box.y);
    expect(box.y - target.y).toBeLessThanOrEqual(PX.lift + 0.01);
    expect(trail.targets).toHaveLength(1);
  });

  it("keeps the gutter and the lift screen distances at every zoom", () => {
    const layout = laidOut();
    const box = layout.boxes.find(({ nodeId }) => nodeId === "b")!;
    for (const zoom of [0.6, 1, 2, 4]) {
      const trail = geometry({ lineages: [["a", "b"]], zoom })!;
      expect((box.x - trail.targets[0]!.x) * zoom).toBeCloseTo(PX.gutter, 1);
    }
  });

  it("never lets the lift take more than its share of the gap above", () => {
    // Two leaf siblings 20px apart: the thread may take only 55% of that gap.
    const layout = laidOut([node("a", null, 0), node("s0", "a", 1), node("s1", "a", 1)]);
    const lower = layout.boxes.find(({ nodeId }) => nodeId === "s1")!;
    const upper = layout.boxes.find(({ nodeId }) => nodeId === "s0")!;
    const gap = lower.y - (upper.y + upper.height);
    expect(gap).toBe(20);
    const trail = operationTrailGeometry({
      layout, currentLayoutEpoch: 5, lineages: [["a", "s1"]], zoom: 1, window: WIDE,
    })!;
    expect(lower.y - trail.targets[0]!.y).toBeCloseTo(gap * 0.55, 1);
    // With room to spare it takes the whole lift.
    const roomy = geometry({ lineages: [["a", "b2"]] })!;
    const b2 = laidOut().boxes.find(({ nodeId }) => nodeId === "b2")!;
    expect(b2.y - roomy.targets[0]!.y).toBeCloseTo(PX.lift, 1);
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

  it("turns with one corner radius of 8 screen px at every zoom, and a short leg never overshoots", () => {
    for (const zoom of [0.6, 1, 2]) {
      const trail = geometry({ lineages: [["a", "b", "c2"]], zoom })!;
      const arcs = commands(trail.up.line).filter(([letter]) => letter === "A");
      expect(arcs.length).toBeGreaterThan(0);
      for (const [, numbers] of arcs) expect(numbers[0]! * zoom).toBeLessThanOrEqual(PX.corner + 0.01);
    }
    const layout = laidOut();
    const shallow = { ...layout, boxes: layout.boxes.map((box) => box.nodeId === "b" ? { ...box, y: box.y + 7 } : box) };
    const trail = operationTrailGeometry({
      layout: shallow, currentLayoutEpoch: 5, lineages: [["a", "b"]], zoom: 1, window: WIDE,
    })!;
    const arcs = commands(trail.up.line).filter(([letter]) => letter === "A");
    expect(arcs).toHaveLength(1);
    expect(arcs[0]![1][0]).toBeCloseTo(7, 0);
  });

  it("joins two all-but-level passages with one level leg instead of a stair-step", () => {
    const layout = laidOut();
    const near = { ...layout, boxes: layout.boxes.map((box) => box.nodeId === "b" ? { ...box, y: box.y + 4 } : box) };
    const trail = operationTrailGeometry({
      layout: near, currentLayoutEpoch: 5, lineages: [["a", "b"]], zoom: 1, window: WIDE,
    })!;
    expect(commands(trail.up.line).filter(([letter]) => letter === "A")).toHaveLength(0);
    expect(trail.up.line).toMatch(/^M-?[\d.]+ (-?[\d.]+)L-?[\d.]+ \1$/u);
  });

  it("ends every edge in a solid arrowhead pointing into the passage it reaches", () => {
    const trail = geometry({ lineages: [["a", "b", "c2"]] })!;
    const arrows = commands(trail.up.arrows);
    // One closed triangle per edge: two edges.
    expect(arrows.filter(([letter]) => letter === "Z")).toHaveLength(2);
    expect(arrows.filter(([letter]) => letter === "M")).toHaveLength(2);
    expect(arrows.filter(([letter]) => letter === "L")).toHaveLength(4);
    // Level step: rightward, tip toward the bead. Drop: downward into the bead from above.
    const [first, second] = trail.up.arrows.split("M").filter(Boolean).map((part) => commands(`M${part}`));
    const [tip1, left1, right1] = first!.slice(0, 3).map(([, numbers]) => numbers as [number, number]);
    expect(left1![0]).toBeLessThan(tip1![0]);
    expect(left1![0]).toBe(right1![0]);
    expect(Math.abs(left1![1] - right1![1])).toBeCloseTo(PX.arrowWidth, 0);
    const [tip2, left2] = second!.slice(0, 3).map(([, numbers]) => numbers as [number, number]);
    expect(left2![1]).toBeLessThan(tip2![1]);
    expect(Math.abs(tip2![0] - trail.targets[0]!.x)).toBeLessThan(0.02);
    expect(trail.targets[0]!.y - tip2![1]).toBeCloseTo(PX.target / 2 + PX.arrowGap, 0);
  });

  it("keeps the arrowhead the same screen size at every zoom", () => {
    for (const zoom of [0.6, 1, 2]) {
      const trail = geometry({ lineages: [["a", "b"]], zoom })!;
      const [tip, left, right] = commands(trail.up.arrows).slice(0, 3).map(([, numbers]) => numbers as [number, number]);
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
    expect(commands(trail.down.dots).filter(([letter]) => letter === "M")).toHaveLength(3);
    expect(commands(trail.down.arrows).filter(([letter]) => letter === "Z")).toHaveLength(3);
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
    expect(commands(trail.up.dots).filter(([letter]) => letter === "M")).toHaveLength(2);
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
    const target = full.targets[0]!;
    const clipped = geometry({ window: { x: target.x - 300, y: -3000, width: 9000, height: 9000 } })!;
    expect(clipped.chevron).not.toBeNull();
    expect(clipped.chevron!.angle).toBe(180);
    expect(clipped.chevron!.x).toBeCloseTo(clipped.window.x + PX.chevronInset, 1);
    expect(commands(clipped.up.dots).filter(([l]) => l === "M").length).toBeLessThan(commands(full.up.dots).filter(([l]) => l === "M").length);
    // The line itself is whole: the window clips it, and the fade softens the cut.
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

  it("keeps the lone target's bead on the edge it is past, with a short lead-in", () => {
    const full = geometry()!;
    const past: TrailRect = { x: full.targets[0]!.x + 200, y: -3000, width: 9000, height: 9000 };
    const trail = geometry({ window: past })!;
    expect(trail.targets[0]!.pinned).toBe(true);
    expect(trail.targets[0]!.nodeId).toBe("d");
    expect(trail.targets[0]!.x).toBeCloseTo(past.x + PX.pinInset, 1);
    expect(trail.up.dots).toBe("");
    expect(trail.down.line).toBe("");
    const [move, line] = commands(trail.up.line);
    expect(move![0]).toBe("M");
    expect(move![1][0]).toBeCloseTo(past.x, 1);
    expect(line![0]).toBe("L");
    expect(trail.chevron!.angle).toBe(180);
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
      // 1.75px is two device pixels at dpr 1 and four at dpr 2: both even.
      expect(snapStrokeCentre(screen, 1, PX.stroke) % 1).toBeCloseTo(0, 6);
      expect(snapStrokeCentre(screen, 2, PX.stroke) * 2 % 1).toBeCloseTo(0, 6);
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
        expect(Math.min(fraction, 1 - fraction)).toBeLessThan(0.05);
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

describe("the stylesheet's sizes are the constants", () => {
  const css = readFileSync(new URL("../components/OperationTrail.css", import.meta.url), "utf8");
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]]/gu, "\\$&")}\\s*\\{([^}]*)\\}`, "u").exec(css)?.[1] ?? "";

  it("draws the hairline, dots, target and ring at the declared screen sizes", () => {
    expect(rule(".operation-trail__path")).toContain(`stroke-width: ${PX.stroke}px`);
    expect(rule(".operation-trail__dots")).toContain(`stroke-width: ${PX.bead}px`);
    expect(rule(".operation-trail__more")).toContain(`stroke-width: ${PX.moreDot}px`);
    expect(rule(".operation-trail__bead")).toContain(`width: ${PX.target}px; height: ${PX.target}px`);
    expect(rule(".operation-trail__bead::before")).toContain(`inset: -${(PX.ring - PX.target) / 2}px`);
    expect(rule(".operation-trail__path")).toContain("vector-effect: non-scaling-stroke");
    expect(rule(".operation-trail__dots")).toContain("vector-effect: non-scaling-stroke");
  });
});
