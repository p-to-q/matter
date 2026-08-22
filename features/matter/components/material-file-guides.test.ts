import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MaterialFileRow } from "../material/material-files";
import { projectMaterialFileGuideEdges, projectMaterialFileGuideSegments } from "./material-file-guides";

describe("material file indentation guides", () => {
  it("does not draw a short connector between immediately adjacent controls", () => {
    expect(projectMaterialFileGuideEdges([
      row("branch-a", "aa", 1, true),
      row("branch-b", "aa", 1, true),
      row("branch-c", "ab", 1, true),
      row("leaf-c", "ab", 1),
    ], {
      sourceRowIndexes: new Set([0, 1, 2]),
      structuralBranchRowIndexes: new Set([0, 1, 2]),
    })).toEqual([]);
  });

  it("implements the directed source matrix when visible interior rows create a span", () => {
    const rows = [
      row("branch-a", "aa", 1, true),
      row("branch-a-child", "branch-a", 2),
      row("branch-b", "aa", 1, true),
      row("branch-c", "ab", 1, true),
      row("branch-c-child", "branch-c", 2),
      row("leaf-c", "ab", 1),
      row("leaf-d", "ac", 1),
      row("branch-d", "ac", 1, true),
    ];
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set([0, 2, 3, 7]),
      structuralBranchRowIndexes: new Set([0, 2, 3, 7]),
    })).toEqual([
      { kind: "sibling", parentId: "aa", laneDepth: 0, fromIndex: 0, toIndex: 2, toKind: "branch" },
      { kind: "sibling", parentId: "ab", laneDepth: 0, fromIndex: 3, toIndex: 5, toKind: "terminal" },
    ]);
  });

  it("matches the combined product shape and lets a leaf interrupt the rail", () => {
    const rows = [
      row("a", "root", 0, true),
      row("a-1", "a", 1),
      row("a-2", "a", 1),
      row("a-3", "a", 1),
      row("b", "root", 0, true),
      row("b-early", "b", 1),
      row("c", "b", 1, true),
      row("c-deep", "c", 2),
      row("b-late", "b", 1),
    ];

    const structuralBranchRowIndexes = new Set([0, 4, 6]);
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: structuralBranchRowIndexes,
      structuralBranchRowIndexes,
    })).toEqual([
      { kind: "sibling", parentId: "root", laneDepth: -1, fromIndex: 0, toIndex: 4, toKind: "branch" },
      { kind: "branch-tail", parentId: "root", branchId: "b", laneDepth: -1, fromIndex: 4, toIndex: 8, targetDepth: 1, targetClearance: 4 },
      { kind: "sibling", parentId: "b", laneDepth: 0, fromIndex: 6, toIndex: 8, toKind: "terminal" },
    ]);
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set([4, 6]),
      structuralBranchRowIndexes,
    })).toEqual([
      { kind: "branch-tail", parentId: "root", branchId: "b", laneDepth: -1, fromIndex: 4, toIndex: 8, targetDepth: 1, targetClearance: 4 },
      { kind: "sibling", parentId: "b", laneDepth: 0, fromIndex: 6, toIndex: 8, toKind: "terminal" },
    ]);
  });

  it("closes only a multi-item group's final expanded branch around its visible scope", () => {
    const rows = [
      row("early-leaf", "root", 0),
      row("tail-branch", "root", 0, true),
      row("tail-child", "tail-branch", 1),
      row("tail-deep", "tail-branch", 1, true),
      row("tail-final", "tail-deep", 2),
    ];
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set([1, 3]),
      structuralBranchRowIndexes: new Set([1, 3]),
    })).toEqual([
      {
        kind: "branch-tail",
        parentId: "root",
        branchId: "tail-branch",
        laneDepth: -1,
        fromIndex: 1,
        toIndex: 4,
        targetDepth: 2,
        targetClearance: 2,
      },
      {
        kind: "branch-tail",
        parentId: "tail-branch",
        branchId: "tail-deep",
        laneDepth: 0,
        fromIndex: 3,
        toIndex: 4,
        targetDepth: 2,
        targetClearance: 2,
      },
    ]);

    // Collapsing the final branch removes its source authority. A one-item
    // group also stays quiet instead of becoming a conventional file tree.
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set(),
      structuralBranchRowIndexes: new Set([1, 3]),
    })).toEqual([]);
    expect(projectMaterialFileGuideEdges(rows, {
      protectedControlRowIndexes: new Set([4]),
      sourceRowIndexes: new Set([1]),
      structuralBranchRowIndexes: new Set([1, 3]),
    })).toEqual([expect.objectContaining({
      kind: "branch-tail",
      branchId: "tail-branch",
      targetClearance: 8,
    })]);
    expect(projectMaterialFileGuideEdges([
      row("only-branch", "root", 0, true),
      row("only-child", "only-branch", 1),
    ], {
      sourceRowIndexes: new Set([0]),
      structuralBranchRowIndexes: new Set([0]),
    })).toEqual([]);
  });

  it("leaves eight pixels around arrows and six above a terminal point", () => {
    expect(projectMaterialFileGuideSegments({
      edges: [
        { kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 2, toKind: "terminal" },
        { kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 3, toIndex: 5, toKind: "branch" },
      ],
      ranges: [{ start: 0, end: 6 }],
      rowHeight: 40,
    })).toEqual([
      { kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 0, toIndex: 2, top: 28, height: 66 },
      { kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 3, toIndex: 5, top: 148, height: 64 },
    ]);
  });

  it("clips a branch tail but turns only where its structural endpoint is mounted", () => {
    expect(projectMaterialFileGuideSegments({
      edges: [{
        kind: "branch-tail",
        parentId: "root",
        branchId: "tail",
        laneDepth: 0,
        fromIndex: 0,
        toIndex: 4,
        targetDepth: 3,
        targetClearance: 2,
      }],
      ranges: [{ start: 2, end: 4 }, { start: 4, end: 5 }],
      rowHeight: 40,
    })).toEqual([
      {
        kind: "branch-tail",
        parentId: "root",
        branchId: "tail",
        laneDepth: 0,
        fromIndex: 0,
        toIndex: 4,
        targetDepth: 3,
        targetClearance: 2,
        endsAtTarget: false,
        top: 80,
        height: 80,
      },
      {
        kind: "branch-tail",
        parentId: "root",
        branchId: "tail",
        laneDepth: 0,
        fromIndex: 0,
        toIndex: 4,
        targetDepth: 3,
        targetClearance: 2,
        endsAtTarget: true,
        top: 160,
        height: 20,
      },
    ]);
  });

  it("keeps the branch tail short and retracts it before compressed controls", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(
      /\[data-guide-kind="branch-tail"\]\[data-guide-tail-end="true"\][^{]*\{[^}]*--material-file-tail-run:\s*max\(0px,\s*min\(14px,[^}]*-\s*var\(--material-file-guide-target-clearance\)\)\)\)[^}]*border-bottom:[^}]*border-left:/s,
    );
  });

  it("clips a virtualized arrow-to-terminal edge without inventing endpoints", () => {
    expect(projectMaterialFileGuideSegments({
      edges: [{ kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 1, toIndex: 6, toKind: "terminal" }],
      ranges: [{ start: 2, end: 5 }],
      rowHeight: 40,
    })).toEqual([
      { kind: "sibling", parentId: "root", laneDepth: 0, fromIndex: 1, toIndex: 6, top: 80, height: 120 },
    ]);
  });

  it("filters restore-plus rows at the component boundary", () => {
    const rows = [
      row("held-branch", "root", 0, true),
      row("held-child", "held-branch", 1),
      row("next-branch", "root", 0, true),
    ];
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set([2]),
      structuralBranchRowIndexes: new Set([2]),
    })).toEqual([]);
    expect(projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: new Set([0, 2]),
      structuralBranchRowIndexes: new Set([0, 2]),
    })).toEqual([
      { kind: "sibling", parentId: "root", laneDepth: -1, fromIndex: 0, toIndex: 2, toKind: "branch" },
    ]);
  });

  it("projects a 2,000-row, 32-level outline without cross-parent edges", () => {
    const rows = buildDeepOutline({ branches: 63, levels: 32 });
    const structuralBranches = new Set(
      rows.flatMap((row, index) => row.hasChildren ? [index] : []),
    );
    const edges = projectMaterialFileGuideEdges(rows, {
      sourceRowIndexes: structuralBranches,
      structuralBranchRowIndexes: structuralBranches,
    });
    expect(rows).toHaveLength(2_016);
    expect(edges).toHaveLength(63);
    expect(edges[0]).toEqual({ kind: "sibling", parentId: "document", laneDepth: -1, fromIndex: 0, toIndex: 32, toKind: "branch" });
    expect(edges.at(-2)).toEqual({ kind: "sibling", parentId: "document", laneDepth: -1, fromIndex: 1_952, toIndex: 1_984, toKind: "branch" });
    expect(edges.at(-1)).toEqual({
      kind: "branch-tail",
      parentId: "document",
      branchId: "branch-62-depth-0",
      laneDepth: -1,
      fromIndex: 1_984,
      toIndex: 2_015,
      targetDepth: 31,
      targetClearance: 2,
    });
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

function buildDeepOutline(input: Readonly<{ branches: number; levels: number }>): readonly MaterialFileRow[] {
  const rows: MaterialFileRow[] = [];
  for (let branch = 0; branch < input.branches; branch += 1) {
    let parentId = "document";
    for (let depth = 0; depth < input.levels; depth += 1) {
      const nodeId = `branch-${branch}-depth-${depth}`;
      rows.push(row(nodeId, parentId, depth, depth < input.levels - 1));
      parentId = nodeId;
    }
  }
  return rows;
}
