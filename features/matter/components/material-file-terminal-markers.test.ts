import { describe, expect, it } from "vitest";
import type { MaterialFileRow } from "../material/material-files";
import { projectMaterialFileTerminalMarkerIds } from "./material-file-terminal-markers";

function row(nodeId: string, depth: number, hasChildren = false): MaterialFileRow {
  return {
    nodeId,
    parentId: null,
    depth,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    authoredIndex: 0,
    hasChildren,
    folded: false,
    directMatch: true,
  };
}

describe("material file terminal markers", () => {
  it("marks only leaves that stop above the authored outline's deepest level", () => {
    expect(projectMaterialFileTerminalMarkerIds([
      row("branch", 0, true),
      row("deepest-leaf", 2),
      row("shallower-terminal", 1),
      row("another-branch", 1, true),
    ])).toEqual(new Set(["shallower-terminal"]));
  });

  it("keeps a uniform final level quiet", () => {
    expect(projectMaterialFileTerminalMarkerIds([
      row("first", 2),
      row("second", 2),
    ])).toEqual(new Set());
  });
});
