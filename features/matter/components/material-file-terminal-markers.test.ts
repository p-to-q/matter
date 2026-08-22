import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MaterialFileRow } from "../material/material-files";
import { projectMaterialFileTerminalMarkerIds } from "./material-file-terminal-markers";

describe("material file terminal markers", () => {
  it("marks local leaf endings only when their visible sibling group has a branch", () => {
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

    expect(projectMaterialFileTerminalMarkerIds(rows, new Set([0, 4, 6]))).toEqual(
      new Set(["b-early", "b-late"]),
    );
  });

  it("keeps an all-leaf local group blank even when another group is deeper", () => {
    expect(projectMaterialFileTerminalMarkerIds([
      row("leaf-1", "terminal-parent", 2),
      row("leaf-2", "terminal-parent", 2),
      row("other-branch", "other-parent", 1, true),
      row("other-deep-leaf", "other-branch", 3),
    ], new Set([2]))).toEqual(new Set());
  });

  it("uses one restrained 2.5px leaf point and no guide pseudo endpoint", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.material-file__terminal-marker::before\s*\{[^}]*(?:width:\s*2\.5px[^}]*height:\s*2\.5px|height:\s*2\.5px[^}]*width:\s*2\.5px)[^}]*opacity:\s*\.48/s);
    expect(css).not.toMatch(/\.material-files__tree-guide[^{}]*::after/u);
  });
});

function row(
  nodeId: string,
  parentId: string | null,
  depth: number,
  hasChildren = false,
): MaterialFileRow {
  return {
    nodeId,
    parentId,
    depth,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    authoredIndex: 0,
    hasChildren,
    folded: false,
    directMatch: true,
  };
}
