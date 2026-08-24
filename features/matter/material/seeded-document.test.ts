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
  SEEDED_DOCUMENT_NODE_IDS,
  SEEDED_DOCUMENT_TEXT_VARIANTS,
  SEEDED_ROOT_ONLY_TREE_ID,
  createBranchChildCommand,
  createPerformanceThoughtTree,
  createSeededDocument,
} from "./seeded-document";

const TEST_HISTORY_LIMITS = {
  maxEntries: 16,
  maxRetainedInverseBytes: 256_000,
};

describe("rooted material fixture", () => {
  it("keeps the public root-only fixture free of prewritten descendants", () => {
    const fixture = createSeededDocument("root");

    expect(fixture.tree.id).toBe(SEEDED_ROOT_ONLY_TREE_ID);
    expect(fixture.tree.rootId).toBe(SEEDED_DOCUMENT_NODE_IDS.root);
    expect(Object.keys(fixture.tree.nodes)).toEqual([SEEDED_DOCUMENT_NODE_IDS.root]);
    expect(fixture.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root]?.children).toEqual([]);
    expect(fixture.history.entries).toEqual([]);
  });

  it("grows semantic fixture branches through the second and third levels", () => {
    const fixture = createSeededDocument("root");
    const rootId = fixture.tree.rootId;
    if (rootId === null) throw new Error("root-only fixture root missing");

    const first = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createBranchChildCommand(fixture.tree, rootId, branchValues()),
      TEST_HISTORY_LIMITS,
    );
    if (!first.ok) throw new Error(first.error.code);
    const secondLevelId = first.tree.nodes[rootId]?.children[0];
    if (secondLevelId === undefined) throw new Error("second-level fixture child missing");

    const second = commitTreeCommand(
      first.tree,
      first.history,
      createBranchChildCommand(first.tree, secondLevelId, branchValues()),
      TEST_HISTORY_LIMITS,
    );
    if (!second.ok) throw new Error(second.error.code);
    const thirdLevelId = second.tree.nodes[secondLevelId]?.children[0];
    if (thirdLevelId === undefined) throw new Error("third-level fixture child missing");

    expect(first.tree.nodes[secondLevelId]?.text).toContain("生活");
    expect(second.tree.nodes[thirdLevelId]?.parentId).toBe(secondLevelId);
    expect(second.tree.nodes[thirdLevelId]?.text).toContain("生活");
  });

  it("is deterministic, valid, and opens with a three-level source lineage", () => {
    const first = createSeededDocument();
    const second = createSeededDocument();

    expect(first).toEqual(second);
    expect(validateThoughtTree(first.tree)).toEqual({ ok: true });
    expect(first.tree.rootId).toBe(SEEDED_DOCUMENT_NODE_IDS.root);
    expect(first.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root]).toMatchObject({
      text: SEEDED_DOCUMENT_TEXT_VARIANTS[0].text,
      children: [
        SEEDED_DOCUMENT_NODE_IDS.imaginedLives,
        SEEDED_DOCUMENT_NODE_IDS.presentDistance,
        SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
      ],
    });
    expect(first.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedLives]).toMatchObject({
      parentId: SEEDED_DOCUMENT_NODE_IDS.root,
      children: [
        SEEDED_DOCUMENT_NODE_IDS.imaginedTime,
        SEEDED_DOCUMENT_NODE_IDS.imaginedRelations,
      ],
    });
    expect(first.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.bodilyReturn]).toMatchObject({
      parentId: SEEDED_DOCUMENT_NODE_IDS.bodilyMemory,
      children: [],
    });
    expect(Object.keys(first.tree.nodes)).toHaveLength(10);
    expect(first.tree.revision).toBe(10);
  });

  it("starts with empty history after real bootstrap commits", () => {
    const fixture = createSeededDocument();

    expect(fixture.history).toEqual(createTreeHistory());
  });

  it("carries the caller's identity and time into durable material", () => {
    const fixture = createSeededDocument();
    const firstCommand = createBranchChildCommand(
      fixture.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      branchValues(),
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
    const secondCommand = createBranchChildCommand(
      undone.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      branchValues(),
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
    // A node a person made carries the moment they made it. This used to be a
    // build constant, which reached exported Markdown frontmatter.
    expect(firstCommand.mutation.node.createdAt).toBe(firstCommand.createdAt);
    expect(firstCommand.mutation.node.updatedAt).toBe(firstCommand.createdAt);
    expect(firstCommand.createdAt).not.toBe(secondCommand.createdAt);
    expect(new Date(firstCommand.createdAt).toISOString()).toBe(firstCommand.createdAt);
  });

  it("leaves missing-parent and insertion-bound rejection to the tree engine", () => {
    const fixture = createSeededDocument();
    const missingParent = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createBranchChildCommand(fixture.tree, "missing_parent", branchValues()),
      TEST_HISTORY_LIMITS,
    );
    const badIndex = commitTreeCommand(
      fixture.tree,
      fixture.history,
      createBranchChildCommand(
        fixture.tree,
        SEEDED_DOCUMENT_NODE_IDS.root,
        branchValues(),
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

let branchSequence = 0;
function branchValues() {
  branchSequence += 1;
  return {
    nodeId: `thought_branch_${branchSequence}`,
    createdAt: `2026-08-09T00:00:${String(branchSequence).padStart(2, "0")}.000Z`,
  };
}
