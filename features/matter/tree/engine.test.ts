import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import { createEmptyTree, validateThoughtTree } from "./invariants";
import type { DetachedSubtree, ThoughtNode, ThoughtTree, TreeCommand, TreeMutation } from "./model";

const T0 = "2026-08-03T00:00:00.000Z";
const T1 = "2026-08-03T00:01:00.000Z";
const T2 = "2026-08-03T00:02:00.000Z";

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
  text = id,
  updatedAt = T0,
): ThoughtNode {
  return { id, text, parentId, children, createdAt: T0, updatedAt };
}

function command(
  tree: ThoughtTree,
  mutation: TreeMutation,
  id = `command-${tree.revision}`,
): TreeCommand {
  return {
    id,
    source: "human",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation,
    createdAt: T1,
  };
}

function rootedTree(): ThoughtTree {
  return {
    ...createEmptyTree("tree-1", 4),
    rootId: "root",
    nodes: { root: node("root", null) },
  };
}

function branchedTree(): ThoughtTree {
  return {
    ...createEmptyTree("tree-1", 8),
    rootId: "root",
    nodes: {
      root: node("root", null, ["a", "b"]),
      a: node("a", "root", ["a1"]),
      a1: node("a1", "a", [], "leaf", T1),
      b: node("b", "root"),
    },
  };
}

function detachedA(): DetachedSubtree {
  return {
    rootId: "a",
    nodes: {
      a: node("a", "root", ["a1"]),
      a1: node("a1", "a", [], "leaf", T1),
    },
    parentId: "root",
    index: 0,
    parentChildrenBeforeDetach: ["a", "b"],
  };
}

function expectFailure(result: ReturnType<typeof applyTreeCommand>, code: string) {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("thought-tree invariants", () => {
  it("accepts empty and valid rooted trees", () => {
    expect(validateThoughtTree(createEmptyTree("tree-empty"))).toEqual({ ok: true });
    expect(validateThoughtTree(branchedTree())).toEqual({ ok: true });
  });

  it("accepts only exact empty text on the document root and positive text on passages", () => {
    const documentRoot: ThoughtNode = {
      ...node("document", null, ["passage"], ""),
      role: "document-root",
    };
    const tree: ThoughtTree = {
      ...createEmptyTree("tree-document"),
      rootId: documentRoot.id,
      nodes: {
        [documentRoot.id]: documentRoot,
        passage: node("passage", documentRoot.id, [], "怀念 stays material"),
      },
    };

    expect(validateThoughtTree(tree)).toEqual({ ok: true });
    expect(validateThoughtTree({
      ...tree,
      nodes: { ...tree.nodes, document: { ...documentRoot, text: "\u3000" } },
    })).toMatchObject({ ok: false, error: { code: "TREE_INVARIANT_VIOLATION" } });
  });

  it.each([
    ["empty", ""],
    ["ASCII whitespace", " \t\r\n"],
    ["Unicode whitespace", "\u00a0\u1680\u2003\u2028\u2029\u202f\u205f\u3000"],
  ])("rejects a passage containing only $0", (_name, text) => {
    const invalid = rootedTree();
    invalid.nodes = { root: node("root", null, [], text) };
    expect(validateThoughtTree(invalid)).toMatchObject({
      ok: false,
      error: { code: "TREE_INVARIANT_VIOLATION" },
    });
  });

  it("rejects malformed node records without throwing", () => {
    const malformed = {
      ...rootedTree(),
      nodes: { root: node("root", null, ["bad"]), bad: null },
    } as unknown as ThoughtTree;

    expect(validateThoughtTree(malformed)).toMatchObject({
      ok: false,
      error: { code: "TREE_INVARIANT_VIOLATION" },
    });
  });

  it.each(["node\nfrontmatter", "node with space", `node_${"x".repeat(124)}`])(
    "rejects a non-canonical or oversized material id: %s",
    (id) => {
      const invalid = rootedTree();
      invalid.rootId = id;
      invalid.nodes = { [id]: node(id, null) };
      expect(validateThoughtTree(invalid)).toMatchObject({
        ok: false,
        error: { code: "TREE_INVARIANT_VIOLATION" },
      });
    },
  );

  it.each([
    {
      name: "record key mismatch",
      change: (tree: ThoughtTree) => ({ ...tree, nodes: { wrong: tree.nodes.root } }),
    },
    {
      name: "unknown child",
      change: (tree: ThoughtTree) => ({
        ...tree,
        nodes: { root: { ...tree.nodes.root, children: ["missing"] } },
      }),
    },
    {
      name: "parent disagreement",
      change: (tree: ThoughtTree) => ({
        ...tree,
        nodes: { ...tree.nodes, a: { ...tree.nodes.a, parentId: "b" } },
      }),
    },
    {
      name: "unreachable second root",
      change: (tree: ThoughtTree) => ({
        ...tree,
        nodes: { ...tree.nodes, orphan: node("orphan", null) },
      }),
    },
    {
      name: "unsafe revision",
      change: (tree: ThoughtTree) => ({ ...tree, revision: Number.MAX_SAFE_INTEGER + 1 }),
    },
    {
      name: "non-canonical timestamp",
      change: (tree: ThoughtTree) => ({
        ...tree,
        nodes: { ...tree.nodes, root: { ...tree.nodes.root, updatedAt: "2026-08-03" } },
      }),
    },
  ])("rejects $name without repair", ({ change }) => {
    const invalid = change(branchedTree());
    expect(validateThoughtTree(invalid)).toMatchObject({ ok: false });
  });
});

describe("tree command engine", () => {
  it("initializes and clears the root through exact inverses while revision grows", () => {
    const empty = createEmptyTree("tree-1", 6);
    const root = node("root", null, [], "first material");
    const initialized = applyTreeCommand(
      empty,
      command(empty, { type: "initialize-root", root }, "initialize"),
    );
    expect(initialized).toMatchObject({
      ok: true,
      tree: { id: "tree-1", rootId: "root", revision: 7 },
      affectedNodeIds: ["root"],
    });
    if (!initialized.ok) return;

    const cleared = applyTreeCommand(initialized.tree, initialized.inverse);
    expect(cleared).toMatchObject({
      ok: true,
      tree: { id: "tree-1", rootId: null, nodes: {}, revision: 8 },
    });
    expect(empty).toEqual(createEmptyTree("tree-1", 6));
  });

  it("owns initialized material independently from its command and inverse", () => {
    const empty = createEmptyTree("tree-1");
    const root = node("root", null, [], "original");
    const input = command(empty, { type: "initialize-root", root });
    const result = applyTreeCommand(empty, input);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok || result.inverse.mutation.type !== "clear-root") return;

    root.text = "mutated command";
    root.children.push("intruder");
    expect(result.tree.nodes.root).toMatchObject({ text: "original", children: [] });
    expect(result.inverse.mutation.expectedRoot).toMatchObject({ text: "original", children: [] });

    result.tree.nodes.root.text = "mutated result";
    result.tree.nodes.root.children.push("other");
    expect(result.inverse.mutation.expectedRoot).toMatchObject({ text: "original", children: [] });
  });

  it("inserts at a strict authored index and its inverse removes exactly that leaf", () => {
    const tree = {
      ...rootedTree(),
      nodes: { root: node("root", null, ["a"]), a: node("a", "root") },
    };
    const insertedNode = node("b", "root", [], "second");
    const inserted = applyTreeCommand(
      tree,
      command(tree, {
        type: "insert-node",
        node: insertedNode,
        parentId: "root",
        index: 0,
        expectedParentChildren: ["a"],
      }),
    );
    expect(inserted).toMatchObject({
      ok: true,
      tree: { revision: 5, nodes: { root: { children: ["b", "a"] }, b: insertedNode } },
      affectedNodeIds: ["b", "root"],
    });
    if (!inserted.ok) return;

    const undone = applyTreeCommand(inserted.tree, inserted.inverse);
    expect(undone).toMatchObject({ ok: true, tree: { revision: 6 } });
    if (!undone.ok) return;
    expect({ ...undone.tree, revision: tree.revision }).toEqual(tree);
  });

  it("rejects a whitespace-only inserted passage before publishing a candidate", () => {
    const tree = rootedTree();
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "insert-node",
        node: node("blank", "root", [], "\u3000\n"),
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
    );

    expectFailure(result, "TREE_INVARIANT_VIOLATION");
    expect(result).not.toHaveProperty("inverse");
    expect(tree).toEqual(before);
    expect(tree.revision).toBe(before.revision);
  });

  it("owns inserted material independently from its command and inverse memento", () => {
    const tree = rootedTree();
    const insertedNode = node("child", "root", [], "original child");
    const expectedParentChildren: string[] = [];
    const input = command(tree, {
      type: "insert-node",
      node: insertedNode,
      parentId: "root",
      index: 0,
      expectedParentChildren,
    });
    const result = applyTreeCommand(tree, input);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok || result.inverse.mutation.type !== "remove-subtree") return;

    insertedNode.text = "mutated command";
    insertedNode.children.push("intruder");
    expectedParentChildren.push("intruder");
    expect(result.tree.nodes.child).toMatchObject({ text: "original child", children: [] });
    expect(result.inverse.mutation.detached.nodes.child).toMatchObject({
      text: "original child",
      children: [],
    });
    expect(result.inverse.mutation.detached.parentChildrenBeforeDetach).toEqual(["child"]);

    result.tree.nodes.child.text = "mutated result";
    result.tree.nodes.child.children.push("other");
    result.tree.nodes.root.children.push("other");
    expect(result.inverse.mutation.detached.nodes.child).toMatchObject({
      text: "original child",
      children: [],
    });
    expect(result.inverse.mutation.detached.parentChildrenBeforeDetach).toEqual(["child"]);
  });

  it("removes and restores a complete subtree, order, text, and timestamps exactly", () => {
    const tree = branchedTree();
    const removed = applyTreeCommand(
      tree,
      command(tree, { type: "remove-subtree", detached: detachedA() }, "remove-a"),
    );
    expect(removed).toMatchObject({
      ok: true,
      tree: { revision: 9, nodes: { root: { children: ["b"] } } },
      affectedNodeIds: ["a", "a1", "root"],
    });
    if (!removed.ok) return;
    expect(removed.tree.nodes.a).toBeUndefined();
    expect(removed.tree.nodes.a1).toBeUndefined();

    const restored = applyTreeCommand(removed.tree, removed.inverse);
    expect(restored).toMatchObject({ ok: true, tree: { revision: 10 } });
    if (!restored.ok) return;
    expect({ ...restored.tree, revision: tree.revision }).toEqual(tree);
  });

  it("owns removed and restored mementos independently in both directions", () => {
    const tree = branchedTree();
    const removeMemento = detachedA();
    const removed = applyTreeCommand(
      tree,
      command(tree, { type: "remove-subtree", detached: removeMemento }),
    );
    expect(removed).toMatchObject({ ok: true });
    if (!removed.ok || removed.inverse.mutation.type !== "restore-subtree") return;

    removeMemento.nodes.a.text = "mutated remove command";
    removeMemento.nodes.a.children.push("intruder");
    removeMemento.parentChildrenBeforeDetach.push("intruder");
    expect(removed.inverse.mutation.detached.nodes.a).toMatchObject({
      text: "a",
      children: ["a1"],
    });
    expect(removed.inverse.mutation.detached.parentChildrenBeforeDetach).toEqual(["a", "b"]);

    const restoreCommand = removed.inverse;
    if (restoreCommand.mutation.type !== "restore-subtree") return;
    const restoreMemento = restoreCommand.mutation.detached;
    const restored = applyTreeCommand(removed.tree, restoreCommand);
    expect(restored).toMatchObject({ ok: true });
    if (!restored.ok || restored.inverse.mutation.type !== "remove-subtree") return;

    restoreMemento.nodes.a.text = "mutated restore command";
    restoreMemento.nodes.a.children.push("intruder");
    restoreMemento.parentChildrenBeforeDetach.push("intruder");
    expect(restored.tree.nodes.a).toMatchObject({ text: "a", children: ["a1"] });
    expect(restored.inverse.mutation.detached.nodes.a).toMatchObject({
      text: "a",
      children: ["a1"],
    });
    expect(restored.inverse.mutation.detached.parentChildrenBeforeDetach).toEqual(["a", "b"]);

    restored.tree.nodes.a.text = "mutated result";
    restored.tree.nodes.a.children.push("other");
    restored.tree.nodes.a1.text = "mutated result leaf";
    restored.tree.nodes.root.children.push("other");
    expect(restored.inverse.mutation.detached.nodes.a).toMatchObject({
      text: "a",
      children: ["a1"],
    });
    expect(restored.inverse.mutation.detached.nodes.a1.text).toBe("leaf");
    expect(restored.inverse.mutation.detached.parentChildrenBeforeDetach).toEqual(["a", "b"]);
  });

  it("replaces text and restores the exact prior text and timestamp", () => {
    const tree = rootedTree();
    const replaced = applyTreeCommand(
      tree,
      command(tree, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "root",
        expectedUpdatedAt: T0,
        text: "changed",
        updatedAt: T2,
      }),
    );
    expect(replaced).toMatchObject({
      ok: true,
      tree: { revision: 5, nodes: { root: { text: "changed", updatedAt: T2 } } },
    });
    if (!replaced.ok) return;

    const undone = applyTreeCommand(replaced.tree, replaced.inverse);
    expect(undone).toMatchObject({
      ok: true,
      tree: { revision: 6, nodes: { root: { text: "root", updatedAt: T0 } } },
    });
  });

  it("rejects replacement with whitespace without changing material, revision, or inverse authority", () => {
    const tree = rootedTree();
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "root",
        expectedUpdatedAt: T0,
        text: "\u00a0\u3000\n",
        updatedAt: T2,
      }),
    );

    expectFailure(result, "TREE_INVARIANT_VIOLATION");
    expect(result).not.toHaveProperty("inverse");
    expect(tree).toEqual(before);
    expect(tree.revision).toBe(before.revision);
  });

  it("does not mutate deeply frozen tree or command inputs on success", () => {
    const tree = deepFreeze(rootedTree());
    const nextNode = deepFreeze(node("child", "root", [], "new material"));
    const input = deepFreeze(
      command(tree, {
        type: "insert-node",
        node: nextNode,
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
    );

    const result = applyTreeCommand(tree, input);
    expect(result).toMatchObject({ ok: true, tree: { nodes: { root: { children: ["child"] } } } });
    expect(tree.nodes.root.children).toEqual([]);
    expect(input.mutation).toMatchObject({ expectedParentChildren: [] });
  });

  it("allows a full-node replacement over 800 units when the final node remains within 2,000", () => {
    const currentText = "a".repeat(900);
    const tree: ThoughtTree = {
      ...rootedTree(),
      nodes: { root: node("root", null, [], currentText) },
    };
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "replace-text",
        nodeId: "root",
        expectedText: currentText,
        expectedUpdatedAt: T0,
        text: `${currentText.slice(0, 899)}b`,
        updatedAt: T2,
      }),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it.each([
    {
      name: "wrong tree id",
      expectedCode: "INVALID_COMMAND",
      make: (tree: ThoughtTree) => ({ ...command(tree, { type: "clear-root", expectedRoot: tree.nodes.root }), expectedTreeId: "other" }),
    },
    {
      name: "stale revision",
      expectedCode: "REVISION_CONFLICT",
      make: (tree: ThoughtTree) => ({ ...command(tree, { type: "clear-root", expectedRoot: tree.nodes.root }), expectedRevision: tree.revision - 1 }),
    },
    {
      name: "root memento drift",
      expectedCode: "INVALID_COMMAND",
      make: (tree: ThoughtTree) => command(tree, { type: "clear-root", expectedRoot: { ...tree.nodes.root, text: "wrong" } }),
    },
    {
      name: "replacement memento drift",
      expectedCode: "INVALID_COMMAND",
      make: (tree: ThoughtTree) => command(tree, { type: "replace-text", nodeId: "root", expectedText: "wrong", expectedUpdatedAt: T0, text: "next", updatedAt: T2 }),
    },
    {
      name: "no-op replacement",
      expectedCode: "INVALID_COMMAND",
      make: (tree: ThoughtTree) => command(tree, { type: "replace-text", nodeId: "root", expectedText: "root", expectedUpdatedAt: T0, text: "root", updatedAt: T2 }),
    },
  ])("rejects $name atomically", ({ make, expectedCode }) => {
    const tree = rootedTree();
    const before = structuredClone(tree);
    expectFailure(applyTreeCommand(tree, make(tree)), expectedCode);
    expect(tree).toEqual(before);
  });

  it.each([
    {
      name: "incomplete subtree",
      alter: (detached: DetachedSubtree) => ({ ...detached, nodes: { a: detached.nodes.a } }),
    },
    {
      name: "wrong parent order",
      alter: (detached: DetachedSubtree) => ({ ...detached, parentChildrenBeforeDetach: ["b", "a"] }),
    },
    {
      name: "clamped index",
      alter: (detached: DetachedSubtree) => ({ ...detached, index: 9 }),
    },
    {
      name: "node timestamp drift",
      alter: (detached: DetachedSubtree) => ({
        ...detached,
        nodes: { ...detached.nodes, a1: { ...detached.nodes.a1, updatedAt: T2 } },
      }),
    },
  ])("rejects an invalid remove memento: $name", ({ alter }) => {
    const tree = branchedTree();
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, { type: "remove-subtree", detached: alter(detachedA()) }),
    );
    expectFailure(result, "INVALID_COMMAND");
    expect(tree).toEqual(before);
  });

  it("rejects an invalid final structure and publishes no partial candidate", () => {
    const tree = rootedTree();
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "insert-node",
        node: node("child", "root", [], "x".repeat(2_001)),
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
    );
    expectFailure(result, "BOUND_EXCEEDED");
    expect(tree).toEqual(before);
  });

  it("rejects a text replacement whose timestamp precedes its node creation", () => {
    const tree = rootedTree();
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "root",
        expectedUpdatedAt: T0,
        text: "next",
        updatedAt: "2026-08-02T23:59:59.999Z",
      }),
    );
    expectFailure(result, "INVALID_COMMAND");
    expect(tree).toEqual(before);
  });

  it("orders canonical extended-year timestamps chronologically", () => {
    const createdAt = "+010000-01-01T00:00:00.000Z";
    const updatedAt = "-000001-01-01T00:00:00.000Z";
    const tree = rootedTree();
    tree.nodes.root = { ...tree.nodes.root, createdAt, updatedAt: createdAt };
    const before = structuredClone(tree);
    const result = applyTreeCommand(
      tree,
      command(tree, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "root",
        expectedUpdatedAt: createdAt,
        text: "next",
        updatedAt,
      }),
    );
    expectFailure(result, "INVALID_COMMAND");
    expect(tree).toEqual(before);
    expect(validateThoughtTree({
      ...tree,
      nodes: { root: { ...tree.nodes.root, updatedAt } },
    })).toMatchObject({ ok: false });
  });

  it("returns a stable failure for a malformed runtime memento", () => {
    const tree = branchedTree();
    for (const mutation of [
      { type: "remove-subtree" },
      { type: "remove-subtree", detached: null },
      { type: "restore-subtree", detached: null },
    ]) {
      const malformed = {
        ...command(tree, { type: "remove-subtree", detached: detachedA() }),
        mutation,
      } as TreeCommand;
      expectFailure(applyTreeCommand(tree, malformed), "INVALID_COMMAND");
    }
  });

  it("rejects an over-deep detached memento without overflowing the stack", () => {
    const tree = branchedTree();
    const nodes: Record<string, ThoughtNode> = {};
    const chain: string[] = [];
    for (let i = 0; i < 50_000; i++) chain.push(`deep_${i}`);
    for (let i = 0; i < chain.length; i++) {
      nodes[chain[i]] = {
        id: chain[i],
        text: chain[i],
        parentId: i === 0 ? "root" : chain[i - 1],
        children: i === chain.length - 1 ? [] : [chain[i + 1]],
        createdAt: T0,
        updatedAt: T0,
      };
    }
    const detached: DetachedSubtree = {
      rootId: chain[0],
      nodes,
      parentId: "root",
      index: 0,
      parentChildrenBeforeDetach: [chain[0], "a", "b"],
    };
    const result = applyTreeCommand(
      tree,
      command(tree, { type: "restore-subtree", detached }),
    );
    expectFailure(result, "INVALID_COMMAND");
    expect(tree.nodes.root.children).toEqual(["a", "b"]);
  });

  it("rejects the 2,001st node in a shallow detached memento", () => {
    const tree = branchedTree();
    const nodes: Record<string, ThoughtNode> = {};
    const detachedRootId = "wide_root";
    const branchIds = Array.from({ length: 32 }, (_, index) => `wide_branch_${index}`);
    nodes[detachedRootId] = node(detachedRootId, "root", branchIds);
    for (const branchId of branchIds) {
      nodes[branchId] = node(branchId, detachedRootId);
    }
    let nodeCount = 1 + branchIds.length;
    for (const branchId of branchIds) {
      const leafIds: string[] = [];
      while (leafIds.length < 64 && nodeCount < 2_001) {
        const leafId = `wide_leaf_${nodeCount}`;
        leafIds.push(leafId);
        nodes[leafId] = node(leafId, branchId);
        nodeCount += 1;
      }
      nodes[branchId] = node(branchId, detachedRootId, leafIds);
    }
    expect(Object.keys(nodes)).toHaveLength(2_001);
    const detached: DetachedSubtree = {
      rootId: detachedRootId,
      nodes,
      parentId: "root",
      index: 0,
      parentChildrenBeforeDetach: [detachedRootId, "a", "b"],
    };
    const result = applyTreeCommand(
      tree,
      command(tree, { type: "restore-subtree", detached }),
    );
    expectFailure(result, "INVALID_COMMAND");
    expect(tree.nodes.root.children).toEqual(["a", "b"]);
  });
});
