import { describe, expect, it } from "vitest";
import {
  createFixtureInsertChildCommand,
  createPerformanceThoughtTree,
  createRootedMaterialFixture,
} from "../fixtures/rooted-material";
import { commitTreeCommand } from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import { MAX_TREE_DEPTH } from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import { moveNodeToParentCommand } from "../runtime/move";
import { applyTreeCommand } from "../tree/engine";
import { normalizeDocumentTree } from "../tree/document-root";
import { bundleToTree, treeToBundle, type SnapshotBundle } from "./snapshot-codec";

describe("Markdown snapshot codec", () => {
  it("round-trips empty and rooted trees with deterministic bytes", () => {
    const empty = createEmptyTree("tree_empty", 7);
    expect(bundleToTree(treeToBundle(empty))).toEqual({ ok: true, tree: empty });

    const fixture = createRootedMaterialFixture();
    const inserted = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(fixture.tree, fixture.tree.rootId!),
      { maxEntries: 4, maxRetainedInverseBytes: 100_000 },
    );
    if (!inserted.ok) throw new Error(inserted.error.message);
    const first = treeToBundle(inserted.tree);
    const second = treeToBundle(inserted.tree);
    expect(first).toEqual(second);
    expect(first.files["matter/index.md" as keyof typeof first.files]).toContain(
      "createdAt: 2026-08-03T08:00:00.000Z",
    );
    expect(bundleToTree(first)).toEqual({ ok: true, tree: inserted.tree });
  });

  it("round-trips a reparented tree through the same Markdown hierarchy", () => {
    const tree = createRootedMaterialFixture().tree;
    const root = tree.nodes[tree.rootId!];
    const source = tree.nodes[root.children[0]];
    const target = tree.nodes[root.children[1]];
    const command = moveNodeToParentCommand(tree, {
      commandId: "snapshot_move",
      nodeId: source.children[0],
      targetParentId: target.id,
      createdAt: "2026-08-07T00:00:00.000Z",
    });
    if (command === null) throw new Error("move fixture is invalid");
    const moved = applyTreeCommand(tree, command);
    if (!moved.ok) throw new Error(moved.error.message);
    expect(bundleToTree(treeToBundle(moved.tree))).toEqual({ ok: true, tree: moved.tree });
  });

  it("round-trips the independent canvas title and invisible document root", () => {
    const tree = {
      ...normalizeDocumentTree(createRootedMaterialFixture().tree),
      title: "Allowed other lives",
    };
    const bundle = treeToBundle(tree);
    expect(bundle.files["matter/matter.json" as keyof typeof bundle.files]).toContain(
      '"title":"Allowed other lives"',
    );
    expect(bundle.files["matter/index.md" as keyof typeof bundle.files]).toContain(
      "role: document-root",
    );
    expect(bundleToTree(bundle)).toEqual({ ok: true, tree });
  });

  it("allows readable slug renames without changing material identity", () => {
    const fixture = createRootedMaterialFixture();
    const inserted = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(fixture.tree, fixture.tree.rootId!),
      { maxEntries: 4, maxRetainedInverseBytes: 100_000 },
    );
    if (!inserted.ok) throw new Error(inserted.error.message);
    const bundle = treeToBundle(inserted.tree);
    const childPath = Object.keys(bundle.files).find((path) => /^matter\/001-.+\/index\.md$/u.test(path));
    if (childPath === undefined) throw new Error("child path missing");
    const childDirectory = childPath.slice(0, -"/index.md".length);
    const renamedDirectory = "matter/001-renamed-by-a-person";
    const files = { ...bundle.files } as Record<string, string>;
    for (const path of Object.keys(files)) {
      if (path !== childPath && !path.startsWith(`${childDirectory}/`)) continue;
      files[`${renamedDirectory}${path.slice(childDirectory.length)}`] = files[path];
      delete files[path];
    }
    expect(bundleToTree({ files })).toEqual({ ok: true, tree: inserted.tree });
  });

  it("rejects protocol, path, frontmatter, duplicate id, and order failures atomically", () => {
    const fixture = createRootedMaterialFixture();
    const inserted = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(fixture.tree, fixture.tree.rootId!),
      { maxEntries: 4, maxRetainedInverseBytes: 100_000 },
    );
    if (!inserted.ok) throw new Error(inserted.error.message);
    const canonical = treeToBundle(inserted.tree);

    expect(mutate(canonical, (files) => {
      files["matter/matter.json"] = '{"protocolVersion":"0.1","treeId":"x","revision":0}\n';
    })).toMatchObject({ ok: false, error: { code: "INVALID_METADATA" } });
    expect(mutate(canonical, (files) => {
      files["matter/../escape/index.md"] = files[Object.keys(files).find((path) => path.includes("/001-"))!];
    })).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
    expect(mutate(canonical, (files) => {
      files["matter/index.md"] = files["matter/index.md"].replace("updatedAt:", "extra:");
    })).toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutate(canonical, (files) => {
      const child = Object.keys(files).find((path) => path.includes("/001-"))!;
      files[child] = files[child].replace(/id: .+\n/u, "id: thought_fixture_root\n");
    })).toMatchObject({ ok: false, error: { code: "INVALID_TREE" } });
    expect(mutate(canonical, (files) => {
      const child = Object.keys(files).find((path) => path.includes("/001-"))!;
      files[child.replace("/001-", "/002-")] = files[child];
      delete files[child];
    })).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
  });

  it("round-trips the maximum depth when every readable slug uses high-byte text", () => {
    const nodes: ThoughtTree["nodes"] = {};
    for (let index = 0; index < MAX_TREE_DEPTH; index += 1) {
      const id = `deep_${index}`;
      const childId = index + 1 < MAX_TREE_DEPTH ? `deep_${index + 1}` : null;
      nodes[id] = {
        id,
        parentId: index === 0 ? null : `deep_${index - 1}`,
        children: childId === null ? [] : [childId],
        text: "界".repeat(80),
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
      };
    }
    const deep: ThoughtTree = {
      protocolVersion: PROTOCOL_VERSION,
      id: "tree_deep",
      rootId: "deep_0",
      nodes,
      revision: 0,
    };
    expect(bundleToTree(treeToBundle(deep))).toEqual({ ok: true, tree: deep });
  });

  it("round-trips maximum node and high-byte text bounds", () => {
    const fixture = createPerformanceThoughtTree();
    const bounded: ThoughtTree = {
      ...fixture,
      nodes: Object.fromEntries(Object.entries(fixture.nodes).map(([id, node]) => [
        id,
        { ...node, text: "界".repeat(2_000) },
      ])),
    };
    expect(bundleToTree(treeToBundle(bounded))).toEqual({ ok: true, tree: bounded });
  });
});

function mutate(
  bundle: SnapshotBundle,
  change: (files: Record<string, string>) => void,
) {
  const files = { ...bundle.files } as Record<string, string>;
  change(files);
  return bundleToTree({ files });
}
