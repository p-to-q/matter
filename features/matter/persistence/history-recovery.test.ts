import { describe, expect, it } from "vitest";
import { commitTreeCommand, createTreeHistory, redoTreeHistory, undoTreeHistory } from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtNode } from "../tree/model";
import { recoverPersistedHistory } from "./history-recovery";

const LIMITS = { maxEntries: 100, maxRetainedInverseBytes: 100_000 };
const TIME = "2026-08-08T00:00:00.000Z";

describe("persisted undo history", () => {
  it("restores a complete inverse chain against its saved material", () => {
    const initialized = commitTreeCommand(
      createEmptyTree("tree"),
      createTreeHistory(),
      initializeRoot("initial", "root", "first"),
      LIMITS,
    );
    if (!initialized.ok) throw new Error(initialized.error.code);
    const inserted = commitTreeCommand(
      initialized.tree,
      initialized.history,
      insertChild("second", initialized.tree.revision, "root", "child", "second"),
      LIMITS,
    );
    if (!inserted.ok) throw new Error(inserted.error.code);

    expect(recoverPersistedHistory(inserted.tree, structuredClone(inserted.history), LIMITS))
      .toEqual(inserted.history);
  });

  it("drops a malformed journal while preserving the independently stored material", () => {
    const tree = createEmptyTree("tree");
    expect(recoverPersistedHistory(tree, {
      entries: [{ commandId: "bad", source: "human", inverse: {}, retainedInverseBytes: 0 }],
      retainedInverseBytes: 0,
    }, LIMITS)).toEqual(createTreeHistory());
  });

  it("recovers both stacks so a keyboard redo remains exact after reload", () => {
    const initialized = commitTreeCommand(
      createEmptyTree("tree"),
      createTreeHistory(),
      initializeRoot("initial", "root", "first"),
      LIMITS,
    );
    if (!initialized.ok) throw new Error(initialized.error.code);
    const inserted = commitTreeCommand(
      initialized.tree,
      initialized.history,
      insertChild("second", initialized.tree.revision, "root", "child", "second"),
      LIMITS,
    );
    if (!inserted.ok) throw new Error(inserted.error.code);
    const undone = undoTreeHistory(inserted.tree, inserted.history);
    if (!undone.ok) throw new Error(undone.error.code);

    const recovered = recoverPersistedHistory(undone.tree, structuredClone(undone.history), LIMITS);
    expect(recovered.entries).toHaveLength(1);
    expect(recovered.redoEntries).toHaveLength(1);
    const redone = redoTreeHistory(undone.tree, recovered);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.tree.nodes.child?.text).toBe("second");
  });
});

function initializeRoot(commandId: string, nodeId: string, text: string) {
  return {
    id: commandId,
    source: "human" as const,
    expectedTreeId: "tree",
    expectedRevision: 0,
    createdAt: TIME,
    mutation: { type: "initialize-root" as const, root: node(nodeId, null, text) },
  };
}

function insertChild(commandId: string, revision: number, parentId: string, nodeId: string, text: string) {
  return {
    id: commandId,
    source: "human" as const,
    expectedTreeId: "tree",
    expectedRevision: revision,
    createdAt: TIME,
    mutation: {
      type: "insert-node" as const,
      node: node(nodeId, parentId, text),
      parentId,
      index: 0,
      expectedParentChildren: [],
    },
  };
}

function node(id: string, parentId: string | null, text: string): ThoughtNode {
  return { id, parentId, text, children: [], createdAt: TIME, updatedAt: TIME };
}
