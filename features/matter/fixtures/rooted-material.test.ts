import { describe, expect, it } from "vitest";
import {
  commitTreeCommand,
  createTreeHistory,
  undoTreeHistory,
} from "../tree/history";
import {
  MAX_CHILDREN_PER_NODE,
  MAX_NODES_PER_TREE,
  MAX_TREE_DEPTH,
  validateThoughtTree,
} from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import {
  ROOTED_FIXTURE_NODE_IDS,
  ROOTED_FIXTURE_TEXT_VARIANTS,
  createFixtureInsertChildCommand,
  createFixtureReplaceTextCommand,
  createPerformanceThoughtTree,
  createRootedMaterialFixture,
} from "./rooted-material";

const TEST_HISTORY_LIMITS = {
  maxEntries: 16,
  maxRetainedInverseBytes: 256_000,
};

describe("rooted material fixture", () => {
  it("is deterministic, valid, and opens with a three-level source lineage", () => {
    const first = createRootedMaterialFixture();
    const second = createRootedMaterialFixture();

    expect(first).toEqual(second);
    expect(validateThoughtTree(first.tree)).toEqual({ ok: true });
    expect(first.tree.rootId).toBe(ROOTED_FIXTURE_NODE_IDS.root);
    expect(first.tree.nodes[ROOTED_FIXTURE_NODE_IDS.root]).toMatchObject({
      text: ROOTED_FIXTURE_TEXT_VARIANTS[0].text,
      children: [
        ROOTED_FIXTURE_NODE_IDS.imaginedLives,
        ROOTED_FIXTURE_NODE_IDS.presentDistance,
        ROOTED_FIXTURE_NODE_IDS.bodilyMemory,
      ],
    });
    expect(first.tree.nodes[ROOTED_FIXTURE_NODE_IDS.imaginedLives]).toMatchObject({
      parentId: ROOTED_FIXTURE_NODE_IDS.root,
      children: [
        ROOTED_FIXTURE_NODE_IDS.imaginedTime,
        ROOTED_FIXTURE_NODE_IDS.imaginedRelations,
      ],
    });
    expect(first.tree.nodes[ROOTED_FIXTURE_NODE_IDS.bodilyReturn]).toMatchObject({
      parentId: ROOTED_FIXTURE_NODE_IDS.bodilyMemory,
      children: [],
    });
    expect(Object.keys(first.tree.nodes)).toHaveLength(10);
    expect(first.tree.revision).toBe(10);
  });

  it("starts with empty history after real bootstrap commits", () => {
    const fixture = createRootedMaterialFixture();

    expect(fixture.history).toEqual(createTreeHistory());
  });

  it("uses monotonic revisions to avoid an id collision after undo", () => {
    const fixture = createRootedMaterialFixture();
    const firstCommand = createFixtureInsertChildCommand(
      fixture.tree,
      ROOTED_FIXTURE_NODE_IDS.root,
    );
    const firstCommit = commitTreeCommand(
      fixture.tree,
      fixture.history,
      firstCommand,
      TEST_HISTORY_LIMITS,
    );
    if (!firstCommit.ok) throw new Error(firstCommit.error.code);

    const undone = undoTreeHistory(firstCommit.tree, firstCommit.history);
    if (!undone.ok) throw new Error(undone.error.code);
    const secondCommand = createFixtureInsertChildCommand(
      undone.tree,
      ROOTED_FIXTURE_NODE_IDS.root,
    );
    const secondCommit = commitTreeCommand(
      undone.tree,
      undone.history,
      secondCommand,
      TEST_HISTORY_LIMITS,
    );

    expect(secondCommand.mutation.type).toBe("insert-node");
    if (firstCommand.mutation.type !== "insert-node" || secondCommand.mutation.type !== "insert-node") {
      return;
    }
    expect(secondCommand.mutation.node.id).not.toBe(firstCommand.mutation.node.id);
    expect(secondCommit.ok).toBe(true);
  });

  it("builds a closed fixture text replacement with exact stale guards", () => {
    const fixture = createRootedMaterialFixture();
    const root = fixture.tree.nodes[ROOTED_FIXTURE_NODE_IDS.root];
    const command = createFixtureReplaceTextCommand(
      fixture.tree,
      root.id,
      ROOTED_FIXTURE_TEXT_VARIANTS[1].text,
    );

    expect(command.mutation).toMatchObject({
      type: "replace-text",
      nodeId: root.id,
      expectedText: root.text,
      expectedUpdatedAt: root.updatedAt,
      text: ROOTED_FIXTURE_TEXT_VARIANTS[1].text,
    });
  });

  it("leaves missing-parent and insertion-bound rejection to the tree engine", () => {
    const fixture = createRootedMaterialFixture();
    const missingParent = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(fixture.tree, "missing_parent"),
      TEST_HISTORY_LIMITS,
    );
    const badIndex = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createFixtureInsertChildCommand(
        fixture.tree,
        ROOTED_FIXTURE_NODE_IDS.root,
        999,
      ),
      TEST_HISTORY_LIMITS,
    );

    expect(missingParent).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    expect(badIndex).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    expect(missingParent.tree).toBe(fixture.tree);
    expect(badIndex.tree).toBe(fixture.tree);
  });
});

describe("performance thought tree", () => {
  it("repeats exactly and meets the realistic 2,000-node shape bounds", () => {
    const first = createPerformanceThoughtTree();
    const second = createPerformanceThoughtTree();
    const shape = inspectShape(first);

    expect(first).toEqual(second);
    expect(validateThoughtTree(first)).toEqual({ ok: true });
    expect(Object.keys(first.nodes)).toHaveLength(MAX_NODES_PER_TREE);
    expect(shape.maxDepth).toBeGreaterThanOrEqual(8);
    expect(shape.maxDepth).toBeLessThanOrEqual(12);
    expect(shape.maxDepth).toBeLessThanOrEqual(MAX_TREE_DEPTH);
    expect(shape.maxChildren).toBeLessThanOrEqual(6);
    expect(shape.maxChildren).toBeLessThanOrEqual(MAX_CHILDREN_PER_NODE);
    expect(shape.textLengths.size).toBeGreaterThan(8);
    expect(Object.values(first.nodes).some((node) => /[\u3400-\u9fff]/u.test(node.text))).toBe(true);
  });
});

function inspectShape(tree: ThoughtTree): {
  maxDepth: number;
  maxChildren: number;
  textLengths: Set<number>;
} {
  if (tree.rootId === null) throw new Error("Expected a rooted performance tree.");
  let maxDepth = 0;
  let maxChildren = 0;
  const textLengths = new Set<number>();
  const stack = [{ id: tree.rootId, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const node = tree.nodes[current.id];
    maxDepth = Math.max(maxDepth, current.depth);
    maxChildren = Math.max(maxChildren, node.children.length);
    textLengths.add(node.text.length);
    for (const childId of node.children) {
      stack.push({ id: childId, depth: current.depth + 1 });
    }
  }

  return { maxDepth, maxChildren, textLengths };
}
