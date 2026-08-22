import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "./columnar-layout";
import type { ColumnarLayout, LayoutNode } from "./model";
import { projectVerticalPresentationBand } from "./vertical-presentation-band";

const nodes: LayoutNode[] = [
  node("root", null, 0, 40),
  node("first", "root", 1, 40),
  node("first-child", "first", 2, 30),
  node("second", "root", 1, 40),
  node("second-child", "second", 2, 30),
  node("third", "root", 1, 40),
  node("third-child", "third", 2, 30),
];

describe("vertical presentation band", () => {
  it("pushes every lower material row down while the source layout row stays fixed", () => {
    const base = layout(nodes);
    const projected = projectVerticalPresentationBand(base, {
      nodeId: "root",
      bottomExtent: 36,
    });

    expect(projected?.boxes.map(({ nodeId, y }) => ({ nodeId, y }))).toEqual([
      { nodeId: "root", y: 0 },
      { nodeId: "first", y: 0 },
      { nodeId: "first-child", y: 0 },
      { nodeId: "second", y: 96 },
      { nodeId: "second-child", y: 96 },
      { nodeId: "third", y: 156 },
      { nodeId: "third-child", y: 156 },
    ]);
    expect(projected?.bounds.height).toBe(base.bounds.height + 36);
  });

  it("keeps upper material and every same-row branch fixed while pushing lower rows down", () => {
    const base = layout(nodes);
    const projected = projectVerticalPresentationBand(base, {
      nodeId: "second",
      bottomExtent: 24,
    });

    expect(projected?.boxes.map(({ nodeId, y }) => ({ nodeId, y }))).toEqual([
      { nodeId: "root", y: 0 },
      { nodeId: "first", y: 0 },
      { nodeId: "first-child", y: 0 },
      { nodeId: "second", y: 60 },
      { nodeId: "second-child", y: 60 },
      { nodeId: "third", y: 144 },
      { nodeId: "third-child", y: 144 },
    ]);
    expect(projected?.bounds.height).toBe(base.bounds.height + 24);
    expect(projected?.boxes.find((box) => box.nodeId === "second-child")?.y)
      .toBe(projected?.boxes.find((box) => box.nodeId === "second")?.y);
  });

  it("rejects a stale or malformed band without partial geometry", () => {
    const base = layout(nodes);
    expect(projectVerticalPresentationBand(base, {
      nodeId: "missing",
      bottomExtent: 20,
    })).toBeNull();
    expect(projectVerticalPresentationBand(base, {
      nodeId: "root",
      bottomExtent: -1,
    })).toBeNull();
  });
});

function node(
  id: string,
  parentId: string | null,
  depth: number,
  height: number,
): LayoutNode {
  return { id, parentId, depth, size: { width: 200, height } };
}

function layout(inputNodes: readonly LayoutNode[]): ColumnarLayout {
  const result = layoutColumnarTree({
    nodes: inputNodes,
    origin: { x: 0, y: 0 },
    layoutEpoch: 1,
    columnWidth: 200,
    columnGap: 40,
    siblingGap: 20,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.layout;
}
