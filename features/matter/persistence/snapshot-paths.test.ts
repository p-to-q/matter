import { describe, expect, it } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { createFixtureInsertChildCommand } from "../fixtures/rooted-material";
import { commitTreeCommand } from "../tree/history";
import { allocateSnapshotPath, allocateSnapshotPaths, materialSlug } from "./snapshot-paths";

describe("snapshot paths", () => {
  it("allocates one index.md per node in authored order", () => {
    const fixture = createRootedMaterialFixture();
    const first = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(fixture.tree, fixture.tree.rootId!),
      { maxEntries: 10, maxRetainedInverseBytes: 100_000 },
    );
    if (!first.ok) throw new Error(first.error.message);
    const second = commitTreeCommand(
      first.tree,
      first.history,
      createFixtureInsertChildCommand(first.tree, first.tree.rootId!),
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
