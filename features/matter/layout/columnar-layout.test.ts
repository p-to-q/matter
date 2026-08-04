import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "./columnar-layout";
import type { ColumnarLayoutInput, LayoutNode } from "./model";

const CONFIG = {
  origin: { x: 10, y: 20 },
  layoutEpoch: 7,
  columnWidth: 200,
  columnGap: 40,
  siblingGap: 20,
};

function node(
  id: string,
  parentId: string | null,
  depth: number,
  height: number,
  width = 200,
): LayoutNode {
  return { id, parentId, depth, size: { width, height } };
}

function input(nodes: LayoutNode[]): ColumnarLayoutInput {
  return { nodes, ...CONFIG };
}

function expectLayout(value: ReturnType<typeof layoutColumnarTree>) {
  expect(value.ok).toBe(true);
  if (!value.ok) {
    throw new Error(value.error.code);
  }
  return value.layout;
}

describe("layoutColumnarTree", () => {
  it("top-aligns first children and packs later siblings after full subtrees", () => {
    const layout = expectLayout(
      layoutColumnarTree(
        input([
          node("root", null, 0, 100),
          node("a", "root", 1, 40),
          node("a1", "a", 2, 30),
          node("a2", "a", 2, 50),
          node("b", "root", 1, 60),
        ]),
      ),
    );

    expect(
      layout.boxes.map(({ nodeId, x, y, subtreeHeight }) => ({
        nodeId,
        x,
        y,
        subtreeHeight,
      })),
    ).toEqual([
      { nodeId: "root", x: 10, y: 20, subtreeHeight: 180 },
      { nodeId: "a", x: 250, y: 20, subtreeHeight: 100 },
      { nodeId: "a1", x: 490, y: 20, subtreeHeight: 30 },
      { nodeId: "a2", x: 490, y: 70, subtreeHeight: 50 },
      { nodeId: "b", x: 250, y: 140, subtreeHeight: 60 },
    ]);
    expect(layout.bounds).toEqual({ x: 10, y: 20, width: 680, height: 180 });
    expect(layout.layoutEpoch).toBe(7);
  });

  it("uses the parent's own height when it is taller than its descendants", () => {
    const layout = expectLayout(
      layoutColumnarTree(
        input([
          node("root", null, 0, 30),
          node("tall", "root", 1, 120),
          node("short-child", "tall", 2, 20),
          node("next", "root", 1, 30),
        ]),
      ),
    );

    expect(layout.boxes.find(({ nodeId }) => nodeId === "next")?.y).toBe(160);
  });

  it("packs transient top and bottom presentation extents without moving the source root", () => {
    const a = { ...node("a", "root", 1, 40), presentation: { topExtent: 0, bottomExtent: 30 } };
    const b = { ...node("b", "root", 1, 40), presentation: { topExtent: 25, bottomExtent: 0 } };
    const layout = expectLayout(layoutColumnarTree(input([
      node("root", null, 0, 30),
      a,
      b,
    ])));

    expect(layout.boxes.find(({ nodeId }) => nodeId === "root")?.y).toBe(20);
    expect(layout.boxes.find(({ nodeId }) => nodeId === "a")?.y).toBe(20);
    expect(layout.boxes.find(({ nodeId }) => nodeId === "b")?.y).toBe(135);
    expect(layout.boxes.find(({ nodeId }) => nodeId === "root")?.subtreeHeight).toBe(155);
  });

  it("keeps every depth on one left edge and preserves authored preorder", () => {
    const layout = expectLayout(
      layoutColumnarTree(
        input([
          node("root", null, 0, 20, 150),
          node("a", "root", 1, 30, 160),
          node("a1", "a", 2, 20, 100),
          node("b", "root", 1, 40, 180),
          node("b1", "b", 2, 20, 120),
        ]),
      ),
    );

    expect(layout.boxes.map(({ nodeId }) => nodeId)).toEqual([
      "root",
      "a",
      "a1",
      "b",
      "b1",
    ]);
    expect(layout.boxes.filter(({ depth }) => depth === 1).map(({ x }) => x)).toEqual([
      250,
      250,
    ]);
    expect(layout.boxes.filter(({ depth }) => depth === 2).map(({ x }) => x)).toEqual([
      490,
      490,
    ]);
  });

  it("returns serializable orthogonal edges derived from box geometry", () => {
    const layout = expectLayout(
      layoutColumnarTree(
        input([node("root", null, 0, 40, 160), node("child", "root", 1, 20, 100)]),
      ),
    );

    expect(layout.edges).toEqual([
      {
        parentId: "root",
        childId: "child",
        points: [
          { x: 170, y: 40 },
          { x: 210, y: 40 },
          { x: 210, y: 30 },
          { x: 250, y: 30 },
        ],
      },
    ]);
    expect(() => JSON.parse(JSON.stringify(layout))).not.toThrow();
  });

  it("accepts an empty material projection", () => {
    expect(layoutColumnarTree(input([]))).toEqual({
      ok: true,
      layout: {
        layoutEpoch: 7,
        boxes: [],
        edges: [],
        bounds: { x: 10, y: 20, width: 0, height: 0 },
      },
    });
  });

  it("does not mutate frozen input and is deterministic", () => {
    const value = input([
      node("root", null, 0, 20),
      node("a", "root", 1, 20),
      node("b", "root", 1, 20),
    ]);
    const before = JSON.stringify(value);
    Object.freeze(value.nodes);
    Object.freeze(value.origin);
    Object.freeze(value);

    const first = layoutColumnarTree(value);
    const second = layoutColumnarTree(value);

    expect(first).toEqual(second);
    expect(JSON.stringify(value)).toBe(before);
  });

  it("publishes a deeply frozen layout snapshot", () => {
    const result = layoutColumnarTree(
      input([node("root", null, 0, 40), node("child", "root", 1, 20)]),
    );
    const layout = expectLayout(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.boxes)).toBe(true);
    expect(Object.isFrozen(layout.boxes[0])).toBe(true);
    expect(Object.isFrozen(layout.edges)).toBe(true);
    expect(Object.isFrozen(layout.edges[0])).toBe(true);
    expect(Object.isFrozen(layout.edges[0]?.points)).toBe(true);
    expect(Object.isFrozen(layout.edges[0]?.points[0])).toBe(true);
    expect(Object.isFrozen(layout.bounds)).toBe(true);

    expect(() => {
      (layout.boxes as unknown as LayoutNode[]).push(
        node("escape", null, 0, 10),
      );
    }).toThrow(TypeError);
    expect(() => {
      (layout.edges[0]?.points[0] as { x: number }).x = 999;
    }).toThrow(TypeError);
  });

  it.each([
    [{ ...input([]), layoutEpoch: -1 }, "INVALID_LAYOUT_EPOCH"],
    [{ ...input([]), layoutEpoch: Number.MAX_SAFE_INTEGER + 1 }, "INVALID_LAYOUT_EPOCH"],
    [{ ...input([]), origin: { x: Number.NaN, y: 0 } }, "INVALID_ORIGIN"],
    [{ ...input([]), columnWidth: 0 }, "INVALID_COLUMN_WIDTH"],
    [{ ...input([]), columnGap: -1 }, "INVALID_COLUMN_GAP"],
    [{ ...input([]), siblingGap: Number.POSITIVE_INFINITY }, "INVALID_SIBLING_GAP"],
    [input([node("", null, 0, 20)]), "INVALID_NODE_ID"],
    [input([node("root", null, 0, 20), node("root", "root", 1, 20)]), "DUPLICATE_NODE_ID"],
    [input([node("root", "parent", 0, 20)]), "INVALID_ROOT"],
    [input([node("root", null, 0, 20), node("second", null, 0, 20)]), "INVALID_ROOT"],
    [input([node("root", null, 0, 20), node("child", "missing", 1, 20)]), "MISSING_PARENT"],
    [input([node("root", null, 0, 20), node("child", "root", 2, 20)]), "INVALID_DEPTH"],
    [
      input([
        node("root", null, 0, 20),
        node("a", "root", 1, 20),
        node("b", "root", 1, 20),
        node("late-a-child", "a", 2, 20),
      ]),
      "INVALID_PREORDER",
    ],
    [input([node("root", null, 0, 0)]), "INVALID_NODE_SIZE"],
    [input([{ ...node("root", null, 0, 20), presentation: { topExtent: -1, bottomExtent: 0 } }]), "INVALID_PRESENTATION_EXTENT"],
    [input([node("root", null, 0, 20, 201)]), "NODE_WIDTH_EXCEEDS_COLUMN"],
  ] as const)("rejects invalid input atomically with %s", (value, code) => {
    expect(layoutColumnarTree(value)).toMatchObject({ ok: false, error: { code } });
  });

  it("rejects arithmetic overflow instead of publishing partial geometry", () => {
    expect(
      layoutColumnarTree({
        nodes: [node("root", null, 0, Number.MAX_VALUE)],
        origin: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
        layoutEpoch: 7,
        columnWidth: 200,
        columnGap: 40,
        siblingGap: 20,
      }),
    ).toEqual({
      ok: false,
      error: { code: "LAYOUT_OVERFLOW", nodeId: "root" },
    });
  });

  it("rejects finite boxes whose aggregate bounds overflow", () => {
    expect(
      layoutColumnarTree({
        nodes: [
          node("root", null, 0, 20, Number.MAX_VALUE),
          node("child", "root", 1, 20, Number.MAX_VALUE),
        ],
        origin: { x: -Number.MAX_VALUE, y: 0 },
        layoutEpoch: 1,
        columnWidth: Number.MAX_VALUE,
        columnGap: 0,
        siblingGap: 0,
      }),
    ).toEqual({ ok: false, error: { code: "LAYOUT_OVERFLOW" } });
  });

  it("handles a 2,000-node lineage without recursive stack growth", () => {
    const nodes: LayoutNode[] = [];
    for (let index = 0; index < 2_000; index += 1) {
      nodes.push(node(`node-${index}`, index === 0 ? null : `node-${index - 1}`, index, 20, 100));
    }

    const layout = expectLayout(layoutColumnarTree(input(nodes)));
    expect(layout.boxes).toHaveLength(2_000);
    expect(layout.boxes.at(-1)).toMatchObject({
      nodeId: "node-1999",
      x: 10 + 1_999 * 240,
      y: 20,
    });
  });

  it("does not overlap boxes that occupy the same depth", () => {
    let seed = 0x12345678;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const nodes: LayoutNode[] = [node("root", null, 0, 20 + random() * 80)];
    const candidates = [nodes[0]!];
    for (let index = 1; index < 250; index += 1) {
      const parent = candidates[Math.floor(random() * candidates.length)]!;
      const next = node(`node-${index}`, parent.id, parent.depth + 1, 20 + random() * 100);
      const parentPosition = nodes.indexOf(parent);
      let insertionPosition = parentPosition + 1;
      while (
        insertionPosition < nodes.length &&
        (nodes[insertionPosition]?.depth ?? 0) > parent.depth
      ) {
        insertionPosition += 1;
      }
      nodes.splice(insertionPosition, 0, next);
      candidates.push(next);
    }

    const layout = expectLayout(layoutColumnarTree(input(nodes)));
    for (let first = 0; first < layout.boxes.length; first += 1) {
      for (let second = first + 1; second < layout.boxes.length; second += 1) {
        const a = layout.boxes[first]!;
        const b = layout.boxes[second]!;
        if (a.depth !== b.depth) {
          continue;
        }
        expect(a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
    }
  });
});
