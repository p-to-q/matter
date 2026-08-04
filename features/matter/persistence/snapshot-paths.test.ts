import { describe, expect, it } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { createFixtureInsertChildCommand } from "../fixtures/rooted-material";
import { commitTreeCommand } from "../tree/history";
import { allocateSnapshotPaths, materialSlug } from "./snapshot-paths";

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
    expect(paths).toHaveLength(3);
    expect(paths[0].path).toBe("matter/index.md");
    expect(paths[1].path).toMatch(/^matter\/001-.+\/index\.md$/u);
    expect(paths[2].path).toMatch(/^matter\/002-.+\/index\.md$/u);
    expect(paths.map((entry) => entry.authoredIndex)).toEqual([0, 1, 2]);
  });

  it("normalizes and bounds readable slugs without making them identity", () => {
    expect(materialSlug("  Hello, 世界 / again  ")).toBe("hello-世界-again");
    expect(Array.from(materialSlug("字".repeat(80)))).toHaveLength(16);
    expect(new TextEncoder().encode(materialSlug("界".repeat(80))).byteLength).toBeLessThanOrEqual(48);
    expect(materialSlug("!!!")).toBe("thought");
  });
});
