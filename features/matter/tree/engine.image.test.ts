import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import {
  MAX_IMAGE_POINTER_BYTES,
  MAX_TREE_IMAGE_BYTES,
  MAX_TREE_IMAGE_NODES,
  type ImagePointer,
} from "./image-pointer";
import { createEmptyTree, validateThoughtNode, validateThoughtTree } from "./invariants";
import type { CommandSuccess, ThoughtNode, ThoughtTree, TreeCommand, TreeMutation } from "./model";

const T0 = "2026-10-12T00:00:00.000Z";
const T1 = "2026-10-12T00:01:00.000Z";
const T2 = "2026-10-12T00:02:00.000Z";

const PNG: ImagePointer = {
  mediaType: "image/png",
  byteLength: 120_000,
  width: 1024,
  height: 768,
  contentHash: "ab".repeat(32),
};
const WEBP: ImagePointer = {
  mediaType: "image/webp",
  byteLength: 80_000,
  width: 512,
  height: 512,
  contentHash: "cd".repeat(32),
};

function node(id: string, parentId: string | null, children: string[] = [], text = id): ThoughtNode {
  return { id, text, parentId, children, createdAt: T0, updatedAt: T1 };
}

function command(tree: ThoughtTree, mutation: TreeMutation, id = `c${tree.revision}`): TreeCommand {
  return {
    id,
    source: "human",
    expectedTreeId: tree.id,
    expectedRevision: tree.revision,
    mutation,
    createdAt: T2,
  };
}

function baseTree(): ThoughtTree {
  return {
    ...createEmptyTree("tree-1", 3),
    rootId: "root",
    nodes: {
      root: node("root", null, ["a", "b"]),
      a: node("a", "root", ["a1"]),
      a1: node("a1", "a"),
      b: node("b", "root"),
    },
  };
}

function documentTree(): ThoughtTree {
  return {
    ...createEmptyTree("tree-1", 3),
    rootId: "doc",
    nodes: {
      doc: { ...node("doc", null, ["a"], ""), role: "document-root" },
      a: node("a", "doc"),
    },
  };
}

function attach(nodeId: string, image: ImagePointer, updatedAt = T1): TreeMutation {
  return { type: "replace-image", nodeId, expectedUpdatedAt: updatedAt, expectedImage: null, image };
}

function ok(tree: ThoughtTree, mutation: TreeMutation, id?: string): CommandSuccess {
  const result = applyTreeCommand(tree, command(tree, mutation, id));
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

function expectFailure(result: ReturnType<typeof applyTreeCommand>, code = "INVALID_COMMAND") {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

/** Applies a success's inverse the way history does: only the revision is rebased. */
function revert(tree: ThoughtTree, applied: CommandSuccess) {
  return applyTreeCommand(tree, { ...applied.inverse, expectedRevision: tree.revision });
}

function withImage(tree: ThoughtTree, nodeId: string, image: ImagePointer): ThoughtTree {
  return ok(tree, attach(nodeId, image)).tree;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A tree whose leaf children each carry one pointer built by `pointer(index)`. */
function crowdedTree(count: number, pointer: (index: number) => ImagePointer): ThoughtTree {
  const ids = Array.from({ length: count + 1 }, (_, index) => `leaf_${index}`);
  const nodes: Record<string, ThoughtNode> = {
    root: node("root", null, ids),
  };
  ids.forEach((id, index) => {
    nodes[id] = index < count ? { ...node(id, "root"), image: pointer(index) } : node(id, "root");
  });
  return { ...createEmptyTree("crowded", 1), rootId: "root", nodes };
}

const hashOf = (index: number) => index.toString(16).padStart(64, "0");
const distinct = (index: number): ImagePointer => ({ ...PNG, byteLength: 1_000, contentHash: hashOf(index) });

describe("replace-image", () => {
  it("attaches, replaces, and detaches with exact inverses and no text-clock change", () => {
    const initial = baseTree();

    const attached = ok(initial, attach("a", PNG));
    expect(attached.tree.nodes.a.image).toEqual(PNG);
    expect(attached.tree.nodes.a.updatedAt).toBe(T1);
    expect(attached.tree.revision).toBe(initial.revision + 1);
    expect(attached.affectedNodeIds).toEqual(["a"]);

    const replaced = ok(attached.tree, {
      type: "replace-image",
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: PNG,
      image: WEBP,
    });
    expect(replaced.tree.nodes.a.image).toEqual(WEBP);
    expect(replaced.tree.nodes.a.updatedAt).toBe(T1);

    const detached = ok(replaced.tree, {
      type: "replace-image",
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: WEBP,
      image: null,
    });
    expect(Object.hasOwn(detached.tree.nodes.a, "image")).toBe(false);
    expect(detached.tree.nodes.a).toEqual(initial.nodes.a);

    // Walking the inverses back restores each earlier state exactly.
    const undoDetach = revert(detached.tree, detached);
    expect(undoDetach).toMatchObject({ ok: true, tree: { nodes: replaced.tree.nodes } });
    if (!undoDetach.ok) return;
    const undoReplace = revert(undoDetach.tree, replaced);
    expect(undoReplace).toMatchObject({ ok: true, tree: { nodes: attached.tree.nodes } });
    if (!undoReplace.ok) return;
    const undoAttach = revert(undoReplace.tree, attached);
    if (!undoAttach.ok) throw new Error(undoAttach.error.message);
    expect(undoAttach.tree.nodes).toEqual(initial.nodes);
    expect(Object.hasOwn(undoAttach.tree.nodes.a, "image")).toBe(false);
  });

  it("builds its inverse by swapping image and expectedImage exactly", () => {
    const attached = ok(baseTree(), attach("a", PNG), "attach");
    expect(attached.inverse).toMatchObject({
      id: "attach:inverse",
      expectedRevision: attached.tree.revision,
      mutation: {
        type: "replace-image",
        nodeId: "a",
        expectedUpdatedAt: T1,
        expectedImage: PNG,
        image: null,
      },
    });
    // Replaying the inverse's own inverse is the original command.
    const undone = revert(attached.tree, attached);
    if (!undone.ok) throw new Error(undone.error.message);
    const redone = revert(undone.tree, undone);
    expect(redone).toMatchObject({ ok: true, tree: { nodes: attached.tree.nodes } });
  });

  it("accepts a structurally equal expectedImage and works on frozen input", () => {
    const tree = deepFreeze(withImage(baseTree(), "a", PNG));
    const mutation = deepFreeze({
      type: "replace-image" as const,
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: { ...PNG },
      image: { ...WEBP },
    });
    const result = ok(tree, mutation);
    expect(result.tree.nodes.a.image).toEqual(WEBP);
    expect(tree.nodes.a.image).toEqual(PNG);
  });

  it("owns the pointer: later caller mutation changes neither the tree nor the inverse", () => {
    const image = { ...PNG };
    const attached = ok(baseTree(), attach("a", image));
    image.contentHash = "ff".repeat(32);
    expect(attached.tree.nodes.a.image).toEqual(PNG);
    expect(attached.inverse.mutation).toMatchObject({ expectedImage: PNG });
  });

  it("refuses a stale expectedUpdatedAt", () => {
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), attach("a", PNG, T0))));
    const missing = { ...attach("a", PNG) } as Record<string, unknown>;
    delete missing.expectedUpdatedAt;
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), missing as unknown as TreeMutation)));
  });

  it("refuses a stale expectedImage in every direction", () => {
    const tree = withImage(baseTree(), "a", PNG);
    // Claims no image, but one is attached.
    expectFailure(applyTreeCommand(tree, command(tree, attach("a", WEBP))));
    // Claims an image, but the node has none.
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), {
      type: "replace-image",
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: PNG,
      image: WEBP,
    })));
    // Claims the wrong image.
    for (const wrong of [WEBP, { ...PNG, byteLength: PNG.byteLength + 1 }, { ...PNG, contentHash: "ee".repeat(32) }]) {
      expectFailure(applyTreeCommand(tree, command(tree, {
        type: "replace-image",
        nodeId: "a",
        expectedUpdatedAt: T1,
        expectedImage: wrong,
        image: null,
      })));
    }
  });

  it("refuses a replacement that does not change the image", () => {
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), {
      type: "replace-image",
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: null,
      image: null,
    })));
    const tree = withImage(baseTree(), "a", PNG);
    expectFailure(applyTreeCommand(tree, command(tree, {
      type: "replace-image",
      nodeId: "a",
      expectedUpdatedAt: T1,
      expectedImage: PNG,
      image: { ...PNG },
    })));
  });

  it("refuses a missing node, a prototype key, and the document root", () => {
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), attach("ghost", PNG))));
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), attach("constructor", PNG))));
    expectFailure(applyTreeCommand(baseTree(), command(baseTree(), attach(undefined as unknown as string, PNG))));
    const tree = documentTree();
    expectFailure(applyTreeCommand(tree, command(tree, attach("doc", PNG))));
    expect(applyTreeCommand(tree, command(tree, attach("a", PNG))).ok).toBe(true);
  });

  it("refuses a malformed pointer on either side", () => {
    const tree = withImage(baseTree(), "a", PNG);
    const bad = [
      { ...PNG, extra: 1 },
      { ...PNG, width: 100 },
      { ...PNG, contentHash: "AB".repeat(32) },
      "image",
      undefined,
    ] as unknown as ImagePointer[];
    for (const pointer of bad) {
      expectFailure(applyTreeCommand(baseTree(), command(baseTree(), attach("a", pointer))));
      expectFailure(applyTreeCommand(tree, command(tree, {
        type: "replace-image",
        nodeId: "a",
        expectedUpdatedAt: T1,
        expectedImage: pointer,
        image: null,
      })));
    }
  });

  it("is a pure value: a refused command leaves the tree untouched", () => {
    const tree = deepFreeze(baseTree());
    expectFailure(applyTreeCommand(tree, command(tree, attach("a", PNG, T0))));
    expect(tree).toEqual(baseTree());
  });
});

describe("images and the other mutations", () => {
  it("rejects insert-node carrying an image, even an invalid-looking one", () => {
    const tree = baseTree();
    const insert = (candidate: ThoughtNode): TreeMutation => ({
      type: "insert-node",
      node: candidate,
      parentId: "b",
      index: 0,
      expectedParentChildren: [],
    });
    expectFailure(applyTreeCommand(tree, command(tree, insert({ ...node("c", "b"), image: PNG }))));
    expectFailure(applyTreeCommand(tree, command(tree, insert({
      ...node("c", "b"),
      image: undefined,
    }))), "TREE_INVARIANT_VIOLATION");
    expect(applyTreeCommand(tree, command(tree, insert(node("c", "b")))).ok).toBe(true);
  });

  it("keeps the image when replace-text rewrites the passage", () => {
    const tree = withImage(baseTree(), "a", PNG);
    const replaced = ok(tree, {
      type: "replace-text",
      nodeId: "a",
      expectedText: "a",
      expectedUpdatedAt: T1,
      text: "a, rewritten",
      updatedAt: T2,
    });
    expect(replaced.tree.nodes.a).toMatchObject({ text: "a, rewritten", updatedAt: T2, image: PNG });
    const undone = revert(replaced.tree, replaced);
    expect(undone).toMatchObject({ ok: true, tree: { nodes: { a: { text: "a", updatedAt: T1, image: PNG } } } });
  });

  it("keeps the image when the node moves", () => {
    const tree = withImage(baseTree(), "a1", PNG);
    const moved = ok(tree, {
      type: "move-node",
      nodeId: "a1",
      expectedNode: tree.nodes.a1,
      fromParentId: "a",
      fromIndex: 0,
      fromParentChildrenBefore: ["a1"],
      toParentId: "b",
      toIndex: 0,
      toParentChildrenBefore: [],
    });
    expect(moved.tree.nodes.a1).toMatchObject({ parentId: "b", image: PNG });
    const bare = { ...tree.nodes.a1 };
    delete bare.image;
    expectFailure(applyTreeCommand(tree, command(tree, {
      type: "move-node",
      nodeId: "a1",
      expectedNode: bare,
      fromParentId: "a",
      fromIndex: 0,
      fromParentChildrenBefore: ["a1"],
      toParentId: "b",
      toIndex: 0,
      toParentChildrenBefore: [],
    })));
    const undone = revert(moved.tree, moved);
    expect(undone).toMatchObject({ ok: true, tree: { nodes: tree.nodes } });
  });

  it("carries the pointer through remove then restore of a subtree", () => {
    const tree = withImage(withImage(baseTree(), "a", PNG), "a1", WEBP);
    const detached = {
      rootId: "a",
      nodes: { a: tree.nodes.a, a1: tree.nodes.a1 },
      parentId: "root",
      index: 0,
      parentChildrenBeforeDetach: ["a", "b"],
    };
    const removed = ok(tree, { type: "remove-subtree", detached });
    expect(removed.inverse.mutation).toMatchObject({
      type: "restore-subtree",
      detached: { nodes: { a: { image: PNG }, a1: { image: WEBP } } },
    });
    // The memento owns its pointers rather than aliasing the tree's.
    const mementoNodes = (removed.inverse.mutation as { detached: { nodes: Record<string, ThoughtNode> } })
      .detached.nodes;
    expect(mementoNodes.a.image).not.toBe(tree.nodes.a.image);
    expect(mementoNodes.a1.image).not.toBe(tree.nodes.a1.image);
    const restored = revert(removed.tree, removed);
    expect(restored).toMatchObject({ ok: true, tree: { nodes: tree.nodes } });

    // The memento must name the image: a memento without it is a different node.
    const bareA = { ...tree.nodes.a };
    delete bareA.image;
    const forgotten = { ...detached, nodes: { a: bareA, a1: tree.nodes.a1 } };
    expectFailure(applyTreeCommand(tree, command(tree, { type: "remove-subtree", detached: forgotten })));
  });

  it("does not let a restore-subtree memento smuggle an invalid pointer", () => {
    const tree = baseTree();
    const removed = ok(tree, {
      type: "remove-subtree",
      detached: {
        rootId: "b",
        nodes: { b: tree.nodes.b },
        parentId: "root",
        index: 1,
        parentChildrenBeforeDetach: ["a", "b"],
      },
    });
    expect(removed.tree.nodes.b).toBeUndefined();
    const hostile = {
      ...removed.inverse,
      expectedRevision: removed.tree.revision,
      mutation: {
        type: "restore-subtree" as const,
        detached: {
          rootId: "b",
          nodes: { b: { ...tree.nodes.b, image: { ...PNG, width: 5 } } },
          parentId: "root",
          index: 1,
          parentChildrenBeforeDetach: ["a", "b"],
        },
      },
    };
    expectFailure(applyTreeCommand(removed.tree, hostile));
  });

  it("clears a lone root that carries an image, and restores it", () => {
    const lone: ThoughtTree = {
      ...createEmptyTree("lone", 1),
      rootId: "root",
      nodes: { root: node("root", null) },
    };
    const tree = withImage(lone, "root", PNG);
    const cleared = ok(tree, { type: "clear-root", expectedRoot: tree.nodes.root });
    expect(cleared.inverse.mutation).toMatchObject({ type: "initialize-root", root: { image: PNG } });
    expect(revert(cleared.tree, cleared)).toMatchObject({
      ok: true,
      tree: { nodes: tree.nodes },
    });
    const withoutImage = { ...tree.nodes.root };
    delete withoutImage.image;
    expectFailure(applyTreeCommand(tree, command(tree, { type: "clear-root", expectedRoot: withoutImage })));
  });
});

describe("image invariants", () => {
  it("rejects a pointer on the document root and any malformed pointer on a node", () => {
    const root = { ...node("doc", null, [], ""), role: "document-root" as const };
    expect(validateThoughtNode({ ...root, image: PNG })).toMatchObject({ ok: false });
    expect(validateThoughtNode({ ...node("a", null), image: PNG })).toEqual({ ok: true });
    for (const image of [{ ...PNG, extra: 1 }, { ...PNG, byteLength: 0 }, null, undefined, "x"]) {
      expect(validateThoughtNode({ ...node("a", null), image })).toMatchObject({
        ok: false,
        error: { code: "TREE_INVARIANT_VIOLATION" },
      });
    }
    const tree = documentTree();
    expect(validateThoughtTree({
      ...tree,
      nodes: { ...tree.nodes, doc: { ...tree.nodes.doc, image: PNG } },
    })).toMatchObject({ ok: false, error: { code: "TREE_INVARIANT_VIOLATION" } });
  });

  it("admits 32 pointer nodes and refuses the 33rd, by validation and by command", () => {
    const full = crowdedTree(MAX_TREE_IMAGE_NODES, distinct);
    expect(validateThoughtTree(full)).toEqual({ ok: true });
    const over = crowdedTree(MAX_TREE_IMAGE_NODES + 1, distinct);
    expect(validateThoughtTree(over)).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });

    const lastId = `leaf_${MAX_TREE_IMAGE_NODES}`;
    const refused = applyTreeCommand(full, command(full, attach(lastId, distinct(99))));
    expectFailure(refused, "BOUND_EXCEEDED");
    expect(applyTreeCommand(full, command(full, {
      type: "replace-image",
      nodeId: "leaf_0",
      expectedUpdatedAt: T1,
      expectedImage: distinct(0),
      image: null,
    })).ok).toBe(true);
  });

  it("caps the sum of distinct-hash bytes at 32 MiB and counts a shared hash once", () => {
    const big = (index: number): ImagePointer => ({
      ...PNG,
      byteLength: MAX_IMAGE_POINTER_BYTES,
      contentHash: hashOf(index),
    });
    const fits = MAX_TREE_IMAGE_BYTES / MAX_IMAGE_POINTER_BYTES;
    expect(validateThoughtTree(crowdedTree(fits, big))).toEqual({ ok: true });
    expect(validateThoughtTree(crowdedTree(fits + 1, big))).toMatchObject({
      ok: false,
      error: { code: "BOUND_EXCEEDED" },
    });

    // Thirty-two nodes showing one 2 MiB picture are 2 MiB, not 64.
    expect(validateThoughtTree(crowdedTree(MAX_TREE_IMAGE_NODES, () => big(1)))).toEqual({ ok: true });

    const full = crowdedTree(fits, big);
    expectFailure(
      applyTreeCommand(full, command(full, attach(`leaf_${fits}`, big(500)))),
      "BOUND_EXCEEDED",
    );
    expect(applyTreeCommand(full, command(full, attach(`leaf_${fits}`, big(0)))).ok).toBe(true);
  });

  it("refuses one hash claiming two sizes, which would hide bytes from the cap", () => {
    const tree = crowdedTree(2, (index) => ({ ...PNG, byteLength: index === 0 ? 1_000 : 2_000 }));
    expect(validateThoughtTree(tree)).toMatchObject({
      ok: false,
      error: { code: "TREE_INVARIANT_VIOLATION" },
    });
  });
});
