import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commitDeliveredTreeCommand,
  commitTreeCommand,
  createTreeHistory,
  estimateSerializedInverseBytes,
  MATTER_HISTORY_LIMITS,
  redoTreeHistory,
  retainedInverseBytes,
  undoTreeHistory,
  type TreeHistory,
  type TreeHistoryLimits,
} from "./history";
import { canReplayTreeHistory } from "./history-replay-oracle";
import type { ImagePointer } from "./image-pointer";
import { createEmptyTree } from "./invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand, TreeMutation } from "./model";

const T0 = "2026-10-12T00:00:00.000Z";
const T1 = "2026-10-12T00:01:00.000Z";
const T2 = "2026-10-12T00:02:00.000Z";
const LIMITS: TreeHistoryLimits = { maxEntries: 64, maxRetainedInverseBytes: 100_000 };

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

type Session = { tree: ThoughtTree; history: TreeHistory };

afterEach(() => {
  vi.unstubAllGlobals();
});

function node(id: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: T0, updatedAt: T1 };
}

function session(): Session {
  return {
    tree: {
      ...createEmptyTree("tree-1", 0),
      rootId: "root",
      nodes: {
        root: node("root", null, ["x", "y"]),
        x: node("x", "root", ["x1"]),
        x1: node("x1", "x"),
        y: node("y", "root"),
      },
    },
    history: createTreeHistory(),
  };
}

function commit(
  state: Session,
  mutation: TreeMutation,
  limits = LIMITS,
  { delivered = false }: { delivered?: boolean } = {},
): Session {
  const command: TreeCommand = {
    id: `command-${state.tree.revision}`,
    source: delivered ? "agent" : "human",
    expectedTreeId: state.tree.id,
    expectedRevision: state.tree.revision,
    mutation,
    createdAt: T2,
  };
  const result = (delivered ? commitDeliveredTreeCommand : commitTreeCommand)(
    state.tree,
    state.history,
    command,
    limits,
  );
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return { tree: result.tree, history: result.history };
}

function attach(nodeId: string, image: ImagePointer, updatedAt = T1): TreeMutation {
  return { type: "replace-image", nodeId, expectedUpdatedAt: updatedAt, expectedImage: null, image };
}

function detach(nodeId: string, image: ImagePointer, updatedAt = T1): TreeMutation {
  return { type: "replace-image", nodeId, expectedUpdatedAt: updatedAt, expectedImage: image, image: null };
}

function undo(state: Session, limits = LIMITS): Session {
  const result = undoTreeHistory(state.tree, state.history, limits);
  if (!result.ok) throw new Error(result.error.code);
  return { tree: result.tree, history: result.history };
}

function redo(state: Session, limits = LIMITS): Session {
  const result = redoTreeHistory(state.tree, state.history, limits);
  if (!result.ok) throw new Error(result.error.code);
  return { tree: result.tree, history: result.history };
}

describe("image steps in history", () => {
  it("undoes and redoes attach, replace, and detach with no I/O available", () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("fetch", () => {
      throw new Error("history must not perform I/O");
    });
    expect(globalThis.indexedDB).toBeUndefined();

    const start = session();
    const attached = commit(start, attach("x", PNG));
    const replaced = commit(attached, {
      type: "replace-image",
      nodeId: "x",
      expectedUpdatedAt: T1,
      expectedImage: PNG,
      image: WEBP,
    });
    const detached = commit(replaced, detach("x", WEBP));
    expect(Object.hasOwn(detached.tree.nodes.x, "image")).toBe(false);

    const back1 = undo(detached);
    expect(back1.tree.nodes.x.image).toEqual(WEBP);
    const back2 = undo(back1);
    expect(back2.tree.nodes.x.image).toEqual(PNG);
    const back3 = undo(back2);
    expect(back3.tree.nodes).toEqual(start.tree.nodes);
    expect(Object.hasOwn(back3.tree.nodes.x, "image")).toBe(false);
    expect(back3.history.entries).toEqual([]);

    const forward1 = redo(back3);
    expect(forward1.tree.nodes.x.image).toEqual(PNG);
    const forward2 = redo(forward1);
    expect(forward2.tree.nodes.x.image).toEqual(WEBP);
    const forward3 = redo(forward2);
    expect(forward3.tree.nodes).toEqual(detached.tree.nodes);
    expect(canReplayTreeHistory(forward3.tree, forward3.history)).toBe(true);
  });

  it("measures an image step exactly and never lets the journal exceed its bound", () => {
    const limits: TreeHistoryLimits = { maxEntries: 1_000, maxRetainedInverseBytes: 2_500 };
    let state = session();
    // Alternating attach and detach: every step's inverse embeds a pointer.
    for (let step = 0; step < 40; step += 1) {
      state = commit(state, step % 2 === 0 ? attach("x", PNG) : detach("x", PNG), limits);
      const total = retainedInverseBytes(state.history.entries);
      expect(total).toBeLessThanOrEqual(limits.maxRetainedInverseBytes);
      for (const entry of state.history.entries) {
        expect(entry.retainedInverseBytes).toBe(estimateSerializedInverseBytes(entry.inverse));
      }
    }
    // The bound released whole oldest steps rather than keeping every one.
    expect(state.history.entries.length).toBeGreaterThan(0);
    expect(state.history.entries.length).toBeLessThan(40);
    expect(canReplayTreeHistory(state.tree, state.history)).toBe(true);
  });

  it("keeps a subtree restore carrying thirty-two pointers inside the product bound", () => {
    const ids = Array.from({ length: 32 }, (_, index) => `leaf_${index}`);
    const leafImage = (index: number): ImagePointer => ({
      ...PNG,
      byteLength: 1_000,
      contentHash: index.toString(16).padStart(64, "0"),
    });
    const nodes: Record<string, ThoughtNode> = {
      root: node("root", null, ["branch"]),
      branch: node("branch", "root", ids),
    };
    ids.forEach((id, index) => {
      nodes[id] = { ...node(id, "branch"), image: leafImage(index) };
    });
    const tree: ThoughtTree = { ...createEmptyTree("tree-1", 0), rootId: "root", nodes };
    const removed = commit({ tree, history: createTreeHistory() }, {
      type: "remove-subtree",
      detached: {
        rootId: "branch",
        nodes: Object.fromEntries(Object.entries(nodes).filter(([id]) => id !== "root")),
        parentId: "root",
        index: 0,
        parentChildrenBeforeDetach: ["branch"],
      },
    }, MATTER_HISTORY_LIMITS);
    const bytes = retainedInverseBytes(removed.history.entries);
    expect(bytes).toBe(estimateSerializedInverseBytes(removed.history.entries[0]!.inverse));
    expect(bytes).toBeLessThan(MATTER_HISTORY_LIMITS.maxRetainedInverseBytes);
    expect(undo(removed, MATTER_HISTORY_LIMITS).tree.nodes).toEqual(nodes);
  });

  it("carries the pointer through remove then restore, undone and redone", () => {
    const attached = commit(session(), attach("x1", PNG));
    const removed = commit(attached, {
      type: "remove-subtree",
      detached: {
        rootId: "x",
        nodes: { x: attached.tree.nodes.x, x1: attached.tree.nodes.x1 },
        parentId: "root",
        index: 0,
        parentChildrenBeforeDetach: ["x", "y"],
      },
    });
    expect(removed.tree.nodes.x1).toBeUndefined();

    const restored = undo(removed);
    expect(restored.tree.nodes.x1.image).toEqual(PNG);
    expect(restored.tree.nodes).toEqual(attached.tree.nodes);
    const again = redo(restored);
    expect(again.tree.nodes.x1).toBeUndefined();
    expect(undo(again).tree.nodes.x1.image).toEqual(PNG);
  });

  it("owns its memento: the retained pointer is not the caller's object", () => {
    const attached = commit(session(), attach("x1", PNG));
    const removed = commit(attached, {
      type: "remove-subtree",
      detached: {
        rootId: "x",
        nodes: { x: attached.tree.nodes.x, x1: attached.tree.nodes.x1 },
        parentId: "root",
        index: 0,
        parentChildrenBeforeDetach: ["x", "y"],
      },
    });
    const mutation = removed.history.entries.at(-1)!.inverse.mutation;
    if (mutation.type !== "restore-subtree") throw new Error("restore-subtree expected");
    const retained = mutation.detached.nodes.x1.image;
    expect(retained).toEqual(PNG);
    expect(retained).not.toBe(attached.tree.nodes.x1.image);
  });

  it("releases a redo step that carries a node whose text a delivery just replaced", () => {
    // Attach on x, undo it: Redo now holds the re-attach, which names x's clock.
    const undone = undo(commit(session(), attach("x", PNG)));
    expect(undone.history.redoEntries).toHaveLength(1);

    const sibling = commit(undone, {
      type: "replace-text",
      nodeId: "y",
      expectedText: "y",
      expectedUpdatedAt: T1,
      text: "y grown",
      updatedAt: T2,
    }, LIMITS, { delivered: true });
    // A delivery on an unrelated node leaves the future replayable.
    expect(sibling.history.redoEntries).toHaveLength(1);
    expect(canReplayTreeHistory(sibling.tree, sibling.history)).toBe(true);
    expect(redo(sibling).tree.nodes.x.image).toEqual(PNG);

    const same = commit(undone, {
      type: "replace-text",
      nodeId: "x",
      expectedText: "x",
      expectedUpdatedAt: T1,
      text: "x grown",
      updatedAt: T2,
    }, LIMITS, { delivered: true });
    // The delivery moved x's clock, so the re-attach could never replay.
    expect(same.history.redoEntries).toEqual([]);
    expect(canReplayTreeHistory(same.tree, same.history)).toBe(true);
  });

  it("does not let a text delivery strand an image step that is still undoable", () => {
    const attached = commit(session(), attach("x", PNG));
    const delivered = commit(attached, {
      type: "replace-text",
      nodeId: "x",
      expectedText: "x",
      expectedUpdatedAt: T1,
      text: "x grown",
      updatedAt: T2,
    }, LIMITS, { delivered: true });
    // Text first, image second: Undo peels the text, then the picture, in order.
    const peeled = undo(delivered);
    expect(peeled.tree.nodes.x).toMatchObject({ text: "x", image: PNG });
    expect(undo(peeled).tree.nodes.x.image).toBeUndefined();
  });
});
