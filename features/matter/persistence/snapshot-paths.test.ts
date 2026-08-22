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

  it("keeps the persisted slug grammar exact while stopping after the bounded prefix", () => {
    const cases = [
      `${"!".repeat(2_000)}最后`,
      `开始${"界".repeat(2_000)}`,
      "A——B / C   D",
      "E\u0301cole İSTANBUL",
      `${"a".repeat(47)} ${"b".repeat(20)}`,
      `${"界".repeat(15)} a trailing value`,
      "\u0000\u0001 / : * ? thought",
    ];
    for (const value of cases) expect(materialSlug(value)).toBe(referenceMaterialSlug(value));

    const alphabet = ["a", "Z", "界", "é", "e\u0301", "İ", "9", " ", "\n", "/", "—", "💭", "_", "\ud800"];
    let state = 0x4d415454;
    for (let sample = 0; sample < 256; sample += 1) {
      const length = 1 + Math.floor(random() * 512);
      let value = "";
      for (let index = 0; index < length; index += 1) {
        value += alphabet[Math.floor(random() * alphabet.length)];
      }
      expect(materialSlug(value)).toBe(referenceMaterialSlug(value));
    }

    function random() {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    }
  });
});

function referenceMaterialSlug(text: string): string {
  const normalized = text
    .normalize("NFC")
    .toLocaleLowerCase("und")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/gu, "-")
    .replace(/[\s\p{P}\p{S}]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  const boundedScalars: string[] = [];
  let bytes = 0;
  for (const scalar of Array.from(normalized).slice(0, 48)) {
    const scalarBytes = new TextEncoder().encode(scalar).byteLength;
    if (bytes + scalarBytes > 48) break;
    boundedScalars.push(scalar);
    bytes += scalarBytes;
  }
  const bounded = boundedScalars.join("").replace(/-$/u, "");
  return bounded.length > 0 ? bounded : "thought";
}

let branchSequence = 0;
function branchValues() {
  branchSequence += 1;
  return {
    nodeId: `thought_branch_${branchSequence}`,
    createdAt: `2026-08-09T00:00:${String(branchSequence).padStart(2, "0")}.000Z`,
  };
}
