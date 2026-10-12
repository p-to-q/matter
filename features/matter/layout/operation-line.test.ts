import { describe, expect, it } from "vitest";
import { layoutColumnarTree } from "./columnar-layout";
import type { ColumnarLayout, LayoutNode } from "./model";
import {
  operationLineData,
  operationLineGeometry,
  operationLinePath,
} from "./operation-line";

function node(id: string, parentId: string | null, depth: number, height = 40): LayoutNode {
  return { id, parentId, depth, size: { width: 200, height } };
}

function laidOut(epoch = 5, nodes: LayoutNode[] = TREE): ColumnarLayout {
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

// a -> b -> c -> d, with side branches that must never join the line.
const TREE: LayoutNode[] = [
  node("a", null, 0),
  node("b", "a", 1),
  node("c", "b", 2),
  node("d", "c", 3),
  node("c2", "b", 2),
  node("b2", "a", 1),
];

describe("operationLinePath", () => {
  const layout = laidOut();

  it("keeps only the edges whose child is on the lineage, in lineage order", () => {
    const path = operationLinePath(layout.edges, ["a", "b", "c", "d"]);
    expect(path?.map(({ parentId, childId }) => `${parentId}>${childId}`)).toEqual([
      "a>b",
      "b>c",
      "c>d",
    ]);
  });

  it("never includes a sibling branch or a descendant of the target", () => {
    const path = operationLinePath(layout.edges, ["a", "b", "c"]);
    expect(path?.map(({ childId }) => childId)).toEqual(["b", "c"]);
    expect(path?.some(({ childId }) => childId === "c2" || childId === "b2" || childId === "d"))
      .toBe(false);
  });

  it("returns the layout's own edge objects, so no endpoint is invented", () => {
    const path = operationLinePath(layout.edges, ["a", "b", "c"])!;
    expect(path[0]).toBe(layout.edges.find((edge) => edge.childId === "b"));
    expect(path[1]).toBe(layout.edges.find((edge) => edge.childId === "c"));
  });

  it("draws nothing for a root-level target: the document root is not a node", () => {
    expect(operationLinePath(layout.edges, ["a"])).toBeNull();
    expect(operationLinePath(layout.edges, [])).toBeNull();
  });

  it("draws nothing for an unknown target", () => {
    expect(operationLinePath(layout.edges, null)).toBeNull();
  });

  it("draws nothing for a target that is not laid out", () => {
    expect(operationLinePath(layout.edges, ["a", "b", "ghost"])).toBeNull();
    const withoutD = laidOut(5, TREE.filter(({ id }) => id !== "d"));
    expect(operationLinePath(withoutD.edges, ["a", "b", "c", "d"])).toBeNull();
  });

  it("draws nothing when an ancestor step is missing instead of a partial path", () => {
    const edges = layout.edges.filter(({ childId }) => childId !== "c");
    expect(operationLinePath(edges, ["a", "b", "c", "d"])).toBeNull();
  });

  it("draws nothing when the layout disagrees with the lineage about a parent", () => {
    expect(operationLinePath(layout.edges, ["a", "b2", "c"])).toBeNull();
    expect(operationLinePath(layout.edges, ["a", "b", "b", "c"])).toBeNull();
  });

  it("clips a segment outside the mounted window and never invents its endpoint", () => {
    const lineage = ["a", "b", "c", "d"];
    expect(
      operationLinePath(layout.edges, lineage, { mountedNodeIds: new Set(["c", "d"]) })
        ?.map(({ childId }) => childId),
    ).toEqual(["d"]);
    // A segment needs both of its passages mounted.
    expect(
      operationLinePath(layout.edges, lineage, { mountedNodeIds: new Set(["a", "b", "d"]) })
        ?.map(({ childId }) => childId),
    ).toEqual(["b"]);
    expect(
      operationLinePath(layout.edges, lineage, { mountedNodeIds: new Set(["a", "c"]) }),
    ).toBeNull();
    expect(
      operationLinePath(layout.edges, lineage, { mountedNodeIds: new Set(lineage) })
        ?.map(({ childId }) => childId),
    ).toEqual(["b", "c", "d"]);
  });

  it("does not change with the unmounted rest of the document", () => {
    const wide = [...TREE, node("far", "b2", 2), node("farther", "far", 3)];
    const widened = laidOut(5, wide);
    expect(operationLineData(operationLinePath(widened.edges, ["a", "b", "c"])!))
      .toBe(operationLineData(operationLinePath(layout.edges, ["a", "b", "c"])!));
  });
});

describe("operationLineData", () => {
  it("joins each edge as its own sub-path with the layout's elbow corners", () => {
    const layout = laidOut();
    const edge = layout.edges.find(({ childId }) => childId === "b")!;
    const [start, elbowA, elbowB, end] = edge.points;
    expect(operationLineData([edge])).toBe(
      `M${start.x} ${start.y}L${elbowA.x} ${elbowA.y}L${elbowB.x} ${elbowB.y}L${end.x} ${end.y}`,
    );
    const both = operationLineData(operationLinePath(layout.edges, ["a", "b", "c"])!);
    expect(both.match(/M/gu)).toHaveLength(2);
  });
});

describe("operationLineGeometry", () => {
  const layout = laidOut(5);
  const lineage = ["a", "b", "c"];

  it("draws the current publication", () => {
    const d = operationLineGeometry({ currentLayoutEpoch: 5, layout, lineageIds: lineage });
    expect(d).toBe(operationLineData(operationLinePath(layout.edges, lineage)!));
  });

  it("draws nothing before the layout is published", () => {
    expect(operationLineGeometry({ currentLayoutEpoch: 5, layout: null, lineageIds: lineage }))
      .toBeNull();
    expect(operationLineGeometry({ currentLayoutEpoch: null, layout, lineageIds: lineage }))
      .toBeNull();
  });

  it("draws nothing once the epoch has moved on, never a stale or interpolated line", () => {
    expect(operationLineGeometry({ currentLayoutEpoch: 6, layout, lineageIds: lineage }))
      .toBeNull();
    expect(operationLineGeometry({ currentLayoutEpoch: 4, layout, lineageIds: lineage }))
      .toBeNull();
  });

  it("draws nothing without a lineage, which is the no-operation case", () => {
    expect(operationLineGeometry({ currentLayoutEpoch: 5, layout, lineageIds: null })).toBeNull();
  });

  it("moves with the layout: the same lineage after a relayout has the new coordinates", () => {
    const taller = laidOut(6, TREE.map((entry) => entry.id === "b" ? node("b", "a", 1, 140) : entry));
    const before = operationLineGeometry({ currentLayoutEpoch: 5, layout, lineageIds: lineage });
    const after = operationLineGeometry({ currentLayoutEpoch: 6, layout: taller, lineageIds: lineage });
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});
