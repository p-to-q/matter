import { describe, expect, it } from "vitest";
import type { LayoutProjectionItem } from "../components/layout-projection";
import type { ColumnarLayout } from "../layout/model";
import {
  projectStructuralMaterialGeometryBasis,
  rebaseStructuralMaterialMeasurement,
  sameStructuralMaterialGeometryBasis,
} from "./structural-material-geometry";
import {
  createProjectedLayoutReceipt,
  type ProjectedLayoutBasis,
} from "./projected-layout-receipt";

const node = {
  id: "root",
  text: "Material",
  parentId: null,
  children: [],
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};
const projection: readonly LayoutProjectionItem[] = Object.freeze([
  Object.freeze({ node, depth: 0, parentId: null }),
]);
const layout = (layoutEpoch: number, x = 20): ColumnarLayout => ({
  layoutEpoch,
  boxes: Object.freeze([{
    nodeId: "root",
    parentId: null,
    x,
    y: 30,
    width: 300,
    height: 80,
    subtreeHeight: 80,
    depth: 0,
  }]),
  edges: Object.freeze([]),
  bounds: { x: 20, y: 30, width: 300, height: 80 },
});

const receiptBasis = (layoutEpoch: number): ProjectedLayoutBasis => ({
  addressKey: "root:whole-node",
  documentEpoch: 4,
  layoutEpoch,
  nodeId: "root",
  partitionKey: "structural-selection",
  treeId: "tree",
  viewportKey: "0:0:1:full:false",
});

const receipt = createProjectedLayoutReceipt({
  basis: receiptBasis(4),
  column: { left: 20, top: 30, right: 320, bottom: 110 },
  rects: [{ x: 30, y: 40, width: 120, height: 20 }],
  textDirection: "ltr",
  writingMode: "horizontal-tb",
})!;

describe("structural material geometry authority", () => {
  it("stays equal across a whole-tree epoch when the selected material did not move", () => {
    const before = projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", 2, "label", "structural")!;
    const after = projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "en-US", 2, "label", "structural")!;
    expect(sameStructuralMaterialGeometryBasis(before, after)).toBe(true);
  });

  it("rejects movement, text, root-style, locale, and measurement revision changes", () => {
    const before = projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", 2, "label", "structural")!;
    const cases = [
      projectStructuralMaterialGeometryBasis(layout(5, 21), projection, "root", "en-US", 2, "label", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), [{ ...projection[0]!, node: { ...node, text: "Changed" } }], "root", "en-US", 2, "label", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), [{ ...projection[0]!, parentId: "parent" }], "root", "en-US", 2, "label", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "ja-JP", 2, "label", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "en-US", 3, "label", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "en-US", 2, "root", "structural")!,
      projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "en-US", 2, "label", "point-talk:2")!,
    ];
    expect(cases.map((candidate) => sameStructuralMaterialGeometryBasis(before, candidate)))
      .toEqual([false, false, false, false, false, false, false]);
  });

  it("fails closed without both a rendered item and its published box", () => {
    expect(projectStructuralMaterialGeometryBasis(layout(4), [], "root", "en-US", 2, "label", "structural")).toBeNull();
    expect(projectStructuralMaterialGeometryBasis(layout(4), projection, "missing", "en-US", 2, "label", "structural")).toBeNull();
    expect(projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", -1, "label", "structural")).toBeNull();
    expect(projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", 2, "label", "")).toBeNull();
  });

  it("rebases an unchanged receipt without carrying an obsolete publication epoch", () => {
    const before = projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", 2, "label", "structural")!;
    const after = projectStructuralMaterialGeometryBasis(layout(5), projection, "root", "en-US", 2, "label", "structural")!;
    const rebased = rebaseStructuralMaterialMeasurement(
      { geometryBasis: before, receipt },
      after,
      receiptBasis(5),
    );
    expect(rebased?.basis).toEqual(receiptBasis(5));
    expect(rebased?.rows).toBe(receipt.rows);
  });

  it("rejects reuse when geometry or non-epoch ownership changes", () => {
    const before = projectStructuralMaterialGeometryBasis(layout(4), projection, "root", "en-US", 2, "label", "structural")!;
    const measurement = { geometryBasis: before, receipt };
    expect(rebaseStructuralMaterialMeasurement(
      measurement,
      projectStructuralMaterialGeometryBasis(layout(5, 21), projection, "root", "en-US", 2, "label", "structural"),
      receiptBasis(5),
    )).toBeNull();
    expect(rebaseStructuralMaterialMeasurement(
      measurement,
      before,
      { ...receiptBasis(5), viewportKey: "moved" },
    )).toBeNull();
  });
});
