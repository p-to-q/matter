import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import {
  commitTreeCommand,
  createTreeHistory,
  redoTreeHistory,
  undoTreeHistory,
} from "./history";
import { createEmptyTree } from "./invariants";
import type { CommandSuccess, ThoughtNode, TreeCommand } from "./model";

const T0 = "2026-08-03T00:00:00.000Z";
const T1 = "2026-08-03T00:01:00.000Z";
const T2 = "2026-08-03T00:02:00.000Z";
const LIMITS = { maxEntries: 8, maxRetainedInverseBytes: 10_000 };

function node(
  id: string,
  text: string,
  parentId: string | null,
): ThoughtNode {
  return {
    id,
    text,
    parentId,
    children: [],
    createdAt: T0,
    updatedAt: T0,
  };
}

function command(
  id: string,
  revision: number,
  mutation: TreeCommand["mutation"],
): TreeCommand {
  return {
    id,
    source: "human",
    expectedTreeId: "tree_1",
    expectedRevision: revision,
    mutation,
    createdAt: T0,
  };
}

function applyOrThrow(
  tree: Parameters<typeof applyTreeCommand>[0],
  nextCommand: TreeCommand,
): CommandSuccess {
  const result = applyTreeCommand(tree, nextCommand);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result;
}

describe("tree history", () => {
  it("rebases only expectedRevision for sequential exact undo", () => {
    const initialized = commitTreeCommand(
      createEmptyTree("tree_1"),
      createTreeHistory(),
      command("init", 0, { type: "initialize-root", root: node("root", "Root", null) }),
      LIMITS,
    );
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;
    const inserted = commitTreeCommand(
      initialized.tree,
      initialized.history,
      command("insert", 1, {
        type: "insert-node",
        node: node("child", "Child", "root"),
        parentId: "root",
        index: 0,
        expectedParentChildren: [],
      }),
      LIMITS,
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const firstUndo = undoTreeHistory(inserted.tree, inserted.history);
    expect(firstUndo.ok).toBe(true);
    if (!firstUndo.ok) return;
    expect(firstUndo.tree.rootId).toBe("root");
    expect(firstUndo.tree.nodes.child).toBeUndefined();
    expect(firstUndo.tree.revision).toBe(3);

    const secondUndo = undoTreeHistory(firstUndo.tree, firstUndo.history);
    expect(secondUndo.ok).toBe(true);
    if (!secondUndo.ok) return;
    expect(secondUndo.tree).toMatchObject({ rootId: null, nodes: {}, revision: 4 });
    expect(secondUndo.history.entries).toEqual([]);
    expect(secondUndo.history.redoEntries).toHaveLength(2);

    const firstRedo = redoTreeHistory(secondUndo.tree, secondUndo.history);
    expect(firstRedo.ok).toBe(true);
    if (!firstRedo.ok) return;
    const secondRedo = redoTreeHistory(firstRedo.tree, firstRedo.history);
    expect(secondRedo.ok).toBe(true);
    if (!secondRedo.ok) return;
    expect(secondRedo.tree.nodes.child?.text).toBe("Child");
    expect(secondRedo.history.redoEntries).toEqual([]);
  });

  it("preserves the exact tree and stack when an inverse memento no longer matches", () => {
    const initialized = commitTreeCommand(
      createEmptyTree("tree_1"),
      createTreeHistory(),
      command("init", 0, { type: "initialize-root", root: node("root", "Before", null) }),
      LIMITS,
    );
    if (!initialized.ok) throw new Error(initialized.error.code);
    const changed = commitTreeCommand(
      initialized.tree,
      initialized.history,
      command("change", 1, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "Before",
        expectedUpdatedAt: T0,
        text: "Expected current",
        updatedAt: T1,
      }),
      LIMITS,
    );
    if (!changed.ok) throw new Error(changed.error.code);

    const intervening = applyOrThrow(
      changed.tree,
      command("outside-history", 2, {
        type: "replace-text",
        nodeId: "root",
        expectedText: "Expected current",
        expectedUpdatedAt: T1,
        text: "Different current",
        updatedAt: T2,
      }),
    );
    const failed = undoTreeHistory(intervening.tree, changed.history);

    expect(failed.ok).toBe(false);
    expect(failed.tree).toBe(intervening.tree);
    expect(failed.history).toBe(changed.history);
    if (failed.ok) return;
    expect(failed.error.code).toBe("INVALID_COMMAND");
  });

  it("rejects an oversized inverse atomically", () => {
    const tree = createEmptyTree("tree_1");
    const history = createTreeHistory();
    const result = commitTreeCommand(
      tree,
      history,
      command("too-large", 0, {
        type: "initialize-root",
        root: node("root", "Root", null),
      }),
      { maxEntries: 8, maxRetainedInverseBytes: 10 },
      () => 11,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HISTORY_LIMIT_EXCEEDED" },
    });
    expect(result.tree).toBe(tree);
    expect(result.history).toBe(history);
  });

  it("owns an exact inverse clone after the caller mutates its command", () => {
    const root = node("root", "Root", null);
    const initialCommand = command("init", 0, {
      type: "initialize-root",
      root,
    });
    const committed = commitTreeCommand(
      createEmptyTree("tree_1"),
      createTreeHistory(),
      initialCommand,
      LIMITS,
    );
    if (!committed.ok) throw new Error(committed.error.code);

    root.text = "Caller mutation";
    root.children.push("poison");

    const undone = undoTreeHistory(committed.tree, committed.history);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.tree).toMatchObject({ rootId: null, nodes: {} });
  });

  it("evicts oldest entries by count and retained inverse bytes", () => {
    let result = commitTreeCommand(
      createEmptyTree("tree_1"),
      createTreeHistory(),
      command("init", 0, { type: "initialize-root", root: node("root", "0", null) }),
      { maxEntries: 2, maxRetainedInverseBytes: 20 },
      () => 9,
    );
    if (!result.ok) throw new Error(result.error.code);

    for (const [id, before, after, time] of [
      ["one", "0", "1", T1],
      ["two", "1", "2", T2],
    ] as const) {
      result = commitTreeCommand(
        result.tree,
        result.history,
        command(id, result.tree.revision, {
          type: "replace-text",
          nodeId: "root",
          expectedText: before,
          expectedUpdatedAt: before === "0" ? T0 : T1,
          text: after,
          updatedAt: time,
        }),
        { maxEntries: 2, maxRetainedInverseBytes: 20 },
        () => 9,
      );
      if (!result.ok) throw new Error(result.error.code);
    }

    expect(result.history.entries.map(({ commandId }) => commandId)).toEqual(["one", "two"]);
    expect(result.history.retainedInverseBytes).toBe(18);
  });

  it("reports empty undo without changing either input", () => {
    const tree = createEmptyTree("tree_1");
    const history = createTreeHistory();
    const result = undoTreeHistory(tree, history);

    expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_HISTORY" } });
    expect(result.tree).toBe(tree);
    expect(result.history).toBe(history);
  });

  it("drops the compatibility alternate future when a new material commit branches", () => {
    const initialized = commitTreeCommand(
      createEmptyTree("tree_1"),
      createTreeHistory(),
      command("init", 0, { type: "initialize-root", root: node("root", "Root", null) }),
      LIMITS,
    );
    if (!initialized.ok) throw new Error(initialized.error.code);
    const undone = undoTreeHistory(initialized.tree, initialized.history);
    if (!undone.ok) throw new Error(undone.error.code);

    const branched = commitTreeCommand(
      undone.tree,
      undone.history,
      command("other-init", undone.tree.revision, { type: "initialize-root", root: node("other", "Other", null) }),
      LIMITS,
    );
    if (!branched.ok) throw new Error(branched.error.code);
    expect(branched.history.redoEntries).toEqual([]);
  });
});
