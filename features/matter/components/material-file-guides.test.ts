import { describe, expect, it } from "vitest";
import type { MaterialFileRow } from "../material/material-files";
import { projectMaterialFileGuideEdges, projectMaterialFileGuideSegments } from "./material-file-guides";

const rows: readonly MaterialFileRow[] = [
  row("root", null, 0),
  row("first", "root", 1),
  row("first-child", "first", 2),
  row("second-child", "first", 2),
  row("second", "root", 1),
  row("second-only-child", "second", 2),
  row("third", "root", 1),
];

describe("material file indentation guides", () => {
  it("draws parent-owned edges only for a sibling group that continues deeper", () => {
    expect(projectMaterialFileGuideEdges(rows)).toEqual([
      { parentId: "root", laneDepth: 0, fromIndex: 1, toIndex: 4 },
      { parentId: "root", laneDepth: 0, fromIndex: 4, toIndex: 6 },
    ]);
  });

  it("clips distinct edges to virtualized mounted ranges without measuring the DOM", () => {
    const edges = projectMaterialFileGuideEdges(rows);
    expect(projectMaterialFileGuideSegments({
      edges,
      ranges: [{ start: 2, end: 5 }],
      rowHeight: 40,
    })).toEqual([
      { parentId: "root", laneDepth: 0, fromIndex: 1, toIndex: 4, top: 80, height: 94 },
      { parentId: "root", laneDepth: 0, fromIndex: 4, toIndex: 6, top: 186, height: 14 },
    ]);
  });

  it("leaves six pixels around a leaf endpoint", () => {
    expect(projectMaterialFileGuideSegments({
      edges: [{ parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 1 }],
      ranges: [{ start: 0, end: 2 }],
      rowHeight: 40,
    })).toEqual([
      { parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 1, top: 26, height: 28 },
    ]);
  });

  it("leaves eight pixels around a disclosure or recovery control", () => {
    expect(projectMaterialFileGuideSegments({
      edges: [{ parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 1 }],
      ranges: [{ start: 0, end: 2 }],
      controlRowIndexes: new Set([0, 1]),
      rowHeight: 40,
    })).toEqual([
      { parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 1, top: 28, height: 24 },
    ]);
  });

  it("does not draw a line for a singleton or terminal leaf group", () => {
    expect(projectMaterialFileGuideEdges([row("only", "parent", 2)])).toEqual([]);
    expect(projectMaterialFileGuideEdges([
      row("first", "parent", 2),
      row("second", "parent", 2),
    ])).toEqual([]);
    expect(projectMaterialFileGuideEdges([
      row("first", "parent", 2),
      row("first-child", "first", 3),
      row("second", "parent", 2),
    ])).toEqual([
      { parentId: "parent", laneDepth: 1, fromIndex: 0, toIndex: 2 },
    ]);
    // A durable branch that has been closed in this outline is a visible leaf.
    expect(projectMaterialFileGuideEdges([
      row("first", "parent", 2, true),
      row("second", "parent", 2, true),
    ])).toEqual([]);
  });

  it("projects a 2,000-row, 32-level outline and clips only mounted edges", () => {
    const deepRows = buildDeepOutline({ fullBranches: 62, finalBranchLevels: 16, levels: 32 });
    expect(deepRows).toHaveLength(2_000);

    const edges = projectMaterialFileGuideEdges(deepRows);
    // Each top-level branch has a visible descendant. Only those 63 direct
    // siblings form one readable group, so there are 62 adjacent relations.
    expect(edges).toHaveLength(62);
    expect(edges[0]).toEqual({ parentId: "document", laneDepth: -1, fromIndex: 0, toIndex: 32 });
    expect(edges.at(-1)).toEqual({ parentId: "document", laneDepth: -1, fromIndex: 1_952, toIndex: 1_984 });

    // Windowing retains only edges touching mounted rows; it must not make a
    // new relation across the 32-row gaps occupied by another open branch.
    expect(projectMaterialFileGuideSegments({
      edges,
      ranges: [{ start: 1_952, end: 1_985 }],
      rowHeight: 40,
    })).toEqual([
      { parentId: "document", laneDepth: -1, fromIndex: 1_920, toIndex: 1_952, top: 78_080, height: 14 },
      { parentId: "document", laneDepth: -1, fromIndex: 1_952, toIndex: 1_984, top: 78_106, height: 1_268 },
    ]);
  });

  it("does not emit guides for a 2,000-item terminal sibling group", () => {
    const terminalRows = Array.from(
      { length: 2_000 },
      (_, index) => row(`leaf-${index}`, "parent", 1),
    );

    expect(projectMaterialFileGuideEdges(terminalRows)).toEqual([]);
  });
});

function row(nodeId: string, parentId: string | null, depth: number, hasChildren = false): MaterialFileRow {
  return {
    nodeId,
    parentId,
    depth,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    authoredIndex: depth,
    hasChildren,
    folded: false,
    directMatch: true,
  };
}

function buildDeepOutline(input: Readonly<{
  fullBranches: number;
  finalBranchLevels: number;
  levels: number;
}>): readonly MaterialFileRow[] {
  const rows: MaterialFileRow[] = [];
  for (let branch = 0; branch <= input.fullBranches; branch += 1) {
    let parentId = "document";
    const levels = branch === input.fullBranches ? input.finalBranchLevels : input.levels;
    for (let depth = 0; depth < levels; depth += 1) {
      const nodeId = `branch-${branch}-depth-${depth}`;
      rows.push(row(nodeId, parentId, depth));
      parentId = nodeId;
    }
  }
  return Object.freeze(rows);
}
