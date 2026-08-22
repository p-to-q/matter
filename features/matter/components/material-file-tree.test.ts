import { describe, expect, it } from "vitest";
import type { MaterialFileRow } from "../material/material-files";
import {
  projectMaterialFileTreeSemantics,
  pruneMaterialFileNodeIds,
  resolveMaterialFileTreeKey,
} from "./material-file-tree";

const rows = [
  row("first", "root", 2, true),
  row("first-a", "first", 3),
  row("first-b", "first", 3),
  row("second", "root", 2, true),
  row("second-a", "second", 3),
] as const;

describe("material file accessible tree", () => {
  it("publishes authored level and sibling positions for a flat virtual DOM", () => {
    expect(projectMaterialFileTreeSemantics(rows)).toEqual([
      { level: 1, positionInSet: 1, setSize: 2 },
      { level: 2, positionInSet: 1, setSize: 2 },
      { level: 2, positionInSet: 2, setSize: 2 },
      { level: 1, positionInSet: 2, setSize: 2 },
      { level: 2, positionInSet: 1, setSize: 1 },
    ]);
  });

  it("moves without wrapping and uses left/right for authored parentage", () => {
    expect(resolveMaterialFileTreeKey(rows, 0, "ArrowRight", false)).toEqual({ kind: "expand" });
    expect(resolveMaterialFileTreeKey(rows, 0, "ArrowRight", true)).toEqual({ kind: "focus", index: 1 });
    expect(resolveMaterialFileTreeKey(rows, 2, "ArrowLeft", false)).toEqual({ kind: "focus", index: 0 });
    expect(resolveMaterialFileTreeKey(rows, 3, "ArrowLeft", true)).toEqual({ kind: "collapse" });
    expect(resolveMaterialFileTreeKey(rows, 0, "ArrowUp", true)).toBeNull();
    expect(resolveMaterialFileTreeKey(rows, rows.length - 1, "ArrowDown", false)).toBeNull();
    expect(resolveMaterialFileTreeKey(rows, 2, "Home", false)).toEqual({ kind: "focus", index: 0 });
    expect(resolveMaterialFileTreeKey(rows, 2, "End", false)).toEqual({ kind: "focus", index: 4 });
  });

  it("targets the complete 2,000-row projection rather than only mounted rows", () => {
    const large = Array.from({ length: 2_000 }, (_, index) => row(`node-${index}`, "root", 0));
    expect(resolveMaterialFileTreeKey(large, 0, "End", false)).toEqual({ kind: "focus", index: 1_999 });
    expect(projectMaterialFileTreeSemantics(large).at(-1)).toEqual({
      level: 1,
      positionInSet: 2_000,
      setSize: 2_000,
    });
  });

  it("forgets deleted transient ids before a durable Undo can restore them", () => {
    const existing = new Set(["kept", "deleted"]);
    const pruned = pruneMaterialFileNodeIds(existing, { kept: {} });
    expect(pruned).toEqual(new Set(["kept"]));
    expect(pruneMaterialFileNodeIds(pruned, { kept: {}, deleted: {} })).toEqual(new Set(["kept"]));
    expect(pruneMaterialFileNodeIds(pruned, { kept: {} })).toBe(pruned);
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
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    authoredIndex: 0,
    hasChildren,
    folded: false,
    directMatch: true,
  };
}
