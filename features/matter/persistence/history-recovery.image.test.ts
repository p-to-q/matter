import { describe, expect, it } from "vitest";
import {
  commitTreeCommand,
  createTreeHistory,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
} from "../tree/history";
import type { ImagePointer } from "../tree/image-pointer";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtTree, TreeMutation } from "../tree/model";
import { attachRecoveredHistory, parseHistoryEntry } from "./history-recovery";

const LIMITS = { maxEntries: 100, maxRetainedInverseBytes: 100_000 };
const TIME = "2026-10-12T00:00:00.000Z";
const PNG: ImagePointer = {
  mediaType: "image/png",
  byteLength: 120_000,
  width: 1024,
  height: 768,
  contentHash: "ab".repeat(32),
};

function pictured(): { tree: ThoughtTree; history: TreeHistory } {
  let tree: ThoughtTree = {
    ...createEmptyTree("tree", 0),
    rootId: "root",
    nodes: { root: { id: "root", text: "root", parentId: null, children: [], createdAt: TIME, updatedAt: TIME } },
  };
  let history = createTreeHistory();
  const mutation: TreeMutation = {
    type: "replace-image",
    nodeId: "root",
    expectedUpdatedAt: TIME,
    expectedImage: null,
    image: PNG,
  };
  const committed = commitTreeCommand(tree, history, {
    id: "attach",
    source: "human",
    expectedTreeId: "tree",
    expectedRevision: 0,
    createdAt: TIME,
    mutation,
  }, LIMITS);
  if (!committed.ok) throw new Error(committed.error.message);
  tree = committed.tree;
  history = committed.history;
  return { tree, history };
}

describe("persisted history and image steps", () => {
  it("accepts a stored replace-image inverse instead of releasing it", () => {
    const { history } = pictured();
    const entry = history.entries[0]!;
    expect(entry.inverse.mutation.type).toBe("replace-image");
    expect(parseHistoryEntry(structuredClone(entry), "tree", LIMITS)).toEqual({
      ...entry,
      bytesUnverified: true,
    });
  });

  it("recovers an image step and replays Undo then Redo exactly from a stored copy", () => {
    const { tree, history } = pictured();
    const stored = structuredClone(history);
    const parsed = parseHistoryEntry(stored.entries[0], "tree", LIMITS);
    if (parsed === null) throw new Error("the stored image step was not accepted");

    const recovered = attachRecoveredHistory(tree, {
      history: { entries: [parsed], redoEntries: [] },
      released: false,
    }, LIMITS);
    expect(recovered.released).toBe(false);
    expect(recovered.history.entries).toHaveLength(1);

    const undone = undoTreeHistory(tree, recovered.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    expect(Object.hasOwn(undone.tree.nodes.root, "image")).toBe(false);
    const redone = redoTreeHistory(undone.tree, undone.history, LIMITS);
    if (!redone.ok) throw new Error(redone.error.code);
    expect(redone.tree.nodes.root.image).toEqual(PNG);
  });
});
