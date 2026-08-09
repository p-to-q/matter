import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { createBranchChildCommand } from "../material/seeded-document";
import { commitTreeCommand } from "../tree/history";
import { allocateSnapshotPath, allocateSnapshotPaths, materialSlug } from "./snapshot-paths";

describe("snapshot paths", () => {
  it("allocates one index.md per node in authored order", () => {
    const fixture = createSeededDocument();
    const first = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createBranchChildCommand(fixture.tree, fixture.tree.rootId!, branchValues()),
      { maxEntries: 10, maxRetainedInverseBytes: 100_000 },
    );
    if (!first.ok) throw new Error(first.error.message);
    const second = commitTreeCommand(
      first.tree,
      first.history,
      createBranchChildCommand(first.tree, first.tree.rootId!, branchValues()),
      { maxEntries: 10, maxRetainedInverseBytes: 100_000 },
    );
    if (!second.ok) throw new Error(second.error.message);

    const paths = allocateSnapshotPaths(second.tree);
    expect(paths).toHaveLength(Object.keys(second.tree.nodes).length);
    expect(paths[0].path).toBe("matter/index.md");
    expect(paths[1].path).toMatch(/^matter\/001-.+\/index\.md$/u);
    expect(new Set(paths.map((entry) => entry.path))).toHaveLength(paths.length);
    expect(paths.map((entry) => entry.authoredIndex))
      .toEqual(paths.map((_, index) => index));
    expect(paths.map((entry) => allocateSnapshotPath(second.tree, entry.nodeId)))
      .toEqual(paths.map((entry) => entry.path));
    expect(allocateSnapshotPath(second.tree, "missing")).toBeNull();
  });

  it("normalizes and bounds readable slugs without making them identity", () => {
    expect(materialSlug("  Hello, 世界 / again  ")).toBe("hello-世界-again");
    expect(Array.from(materialSlug("字".repeat(80)))).toHaveLength(16);
    expect(new TextEncoder().encode(materialSlug("界".repeat(80))).byteLength).toBeLessThanOrEqual(48);
    expect(materialSlug("!!!")).toBe("thought");
  });
});

let branchSequence = 0;
function branchValues() {
  branchSequence += 1;
  return {
    nodeId: `thought_branch_${branchSequence}`,
    createdAt: `2026-08-09T00:00:${String(branchSequence).padStart(2, "0")}.000Z`,
  };
}
