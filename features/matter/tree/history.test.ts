import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTreeCommand } from "./engine";
import {
  boundTreeHistory,
  canReplayTreeHistory,
  commitTreeCommand,
  createTreeHistory,
  estimateSerializedInverseBytes,
  MATTER_HISTORY_LIMITS,
  redoTreeHistory,
  undoTreeHistory,
  verifyHistoryTops,
  type TreeHistory,
  type TreeHistoryEntry,
} from "./history";
import {
  createEmptyTree,
  MAX_CHILDREN_PER_NODE,
  MAX_MATERIAL_ID_BYTES,
  MAX_NODE_TEXT_CODE_UNITS,
  MAX_NODES_PER_TREE,
  validateThoughtTree,
} from "./invariants";
import type { CommandSuccess, ThoughtNode, ThoughtTree, TreeCommand } from "./model";
import { PROTOCOL_VERSION } from "./model";

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

/** A root followed by `count` sequential text replacements, each one step. */
function textHistory(count: number, limits = LIMITS) {
  let result = commitTreeCommand(
    createEmptyTree("tree_1"),
    createTreeHistory(),
    command("init", 0, { type: "initialize-root", root: node("root", "0", null) }),
    limits,
  );
  if (!result.ok) throw new Error(result.error.code);
  for (let step = 1; step <= count; step += 1) {
    const current = result.tree.nodes.root!;
    result = commitTreeCommand(
      result.tree,
      result.history,
      command(`step_${step}`, result.tree.revision, {
        type: "replace-text",
        nodeId: "root",
        expectedText: current.text,
        expectedUpdatedAt: current.updatedAt,
        text: String(step),
        updatedAt: current.updatedAt,
      }),
      limits,
    );
    if (!result.ok) throw new Error(result.error.code);
  }
  return result;
}

function exactBytes(history: TreeHistory): number {
  return [...history.entries, ...history.redoEntries]
    .reduce((total, entry) => total + estimateSerializedInverseBytes(entry.inverse), 0);
}

describe("tree history", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    const firstUndo = undoTreeHistory(inserted.tree, inserted.history, LIMITS);
    expect(firstUndo.ok).toBe(true);
    if (!firstUndo.ok) return;
    expect(firstUndo.tree.rootId).toBe("root");
    expect(firstUndo.tree.nodes.child).toBeUndefined();
    expect(firstUndo.tree.revision).toBe(3);

    const secondUndo = undoTreeHistory(firstUndo.tree, firstUndo.history, LIMITS);
    expect(secondUndo.ok).toBe(true);
    if (!secondUndo.ok) return;
    expect(secondUndo.tree).toMatchObject({ rootId: null, nodes: {}, revision: 4 });
    expect(secondUndo.history.entries).toEqual([]);
    expect(secondUndo.history.redoEntries).toHaveLength(2);
    expect(secondUndo.history.retainedInverseBytes).toBe(exactBytes(secondUndo.history));

    const firstRedo = redoTreeHistory(secondUndo.tree, secondUndo.history, LIMITS);
    expect(firstRedo.ok).toBe(true);
    if (!firstRedo.ok) return;
    const secondRedo = redoTreeHistory(firstRedo.tree, firstRedo.history, LIMITS);
    expect(secondRedo.ok).toBe(true);
    if (!secondRedo.ok) return;
    expect(secondRedo.tree.nodes.child?.text).toBe("Child");
    expect(secondRedo.history.redoEntries).toEqual([]);
    expect(secondRedo.history.retainedInverseBytes).toBe(exactBytes(secondRedo.history));
  });

  it("releases the undo stack when its top inverse no longer applies, leaving material unchanged", () => {
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
    const failed = undoTreeHistory(intervening.tree, changed.history, LIMITS);

    expect(failed.ok).toBe(false);
    expect(failed.tree).toBe(intervening.tree);
    if (failed.ok) return;
    expect(failed.error.code).toBe("HISTORY_UNAVAILABLE");
    // The older initialize step could only be reached through the failed one.
    expect(failed.history).toEqual(createTreeHistory());
    expect(changed.history.entries).toHaveLength(2);
  });

  it("releases only the redo stack when the next redo no longer applies", () => {
    const history = textHistory(2);
    const undone = undoTreeHistory(history.tree, history.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    const root = undone.tree.nodes.root!;
    const moved = applyOrThrow(undone.tree, command("outside", undone.tree.revision, {
      type: "replace-text",
      nodeId: "root",
      expectedText: root.text,
      expectedUpdatedAt: root.updatedAt,
      text: "elsewhere",
      updatedAt: T2,
    }));

    const failed = redoTreeHistory(moved.tree, undone.history, LIMITS);
    expect(failed).toMatchObject({ ok: false, error: { code: "HISTORY_UNAVAILABLE" } });
    expect(failed.tree).toBe(moved.tree);
    expect(failed.history.redoEntries).toEqual([]);
    expect(failed.history.entries).toBe(undone.history.entries);
    expect(failed.history.retainedInverseBytes).toBe(exactBytes(failed.history));
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

  it("admits the largest legal inverse within the product byte bound", () => {
    const tree = maximalTree();
    expect(validateThoughtTree(tree)).toEqual({ ok: true });
    const subtreeIds = Object.keys(tree.nodes).filter((id) => id !== tree.rootId);
    const removal: TreeCommand = {
      id: "remove-everything-but-root",
      source: "human",
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: T1,
      mutation: {
        type: "remove-subtree",
        detached: {
          rootId: SUBTREE_ROOT,
          nodes: Object.fromEntries(subtreeIds.map((id) => [id, tree.nodes[id]!])),
          parentId: tree.rootId!,
          index: 0,
          parentChildrenBeforeDetach: [SUBTREE_ROOT],
        },
      },
    };

    const committed = commitTreeCommand(tree, createTreeHistory(), removal, MATTER_HISTORY_LIMITS);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const bytes = committed.history.retainedInverseBytes;
    // The profile must actually approach the bound for the proof to mean anything.
    expect(bytes).toBeGreaterThan(20 * 1_024 * 1_024);
    expect(bytes).toBeLessThan(MATTER_HISTORY_LIMITS.maxRetainedInverseBytes);

    const undone = undoTreeHistory(committed.tree, committed.history, MATTER_HISTORY_LIMITS);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(Object.keys(undone.tree.nodes)).toHaveLength(MAX_NODES_PER_TREE);
    expect(undone.history.redoEntries).toHaveLength(1);
  }, 60_000);

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

    const undone = undoTreeHistory(committed.tree, committed.history, LIMITS);
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

  it("keeps the newest 1,000 steps and releases the oldest one per commit beyond it", () => {
    const limits = { ...MATTER_HISTORY_LIMITS };
    const result = textHistory(1_050, limits);

    expect(result.history.entries).toHaveLength(1_000);
    expect(result.history.entries[0]?.commandId).toBe("step_51");
    expect(result.history.entries.at(-1)?.commandId).toBe("step_1050");
    expect(result.history.retainedInverseBytes).toBe(exactBytes(result.history));
  });

  it("clears redo bytes when a new commit branches the timeline", () => {
    const history = textHistory(3);
    let undone = undoTreeHistory(history.tree, history.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    undone = undoTreeHistory(undone.tree, undone.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    const root = undone.tree.nodes.root!;

    const branched = commitTreeCommand(
      undone.tree,
      undone.history,
      command("branch", undone.tree.revision, {
        type: "replace-text",
        nodeId: "root",
        expectedText: root.text,
        expectedUpdatedAt: root.updatedAt,
        text: "branch",
        updatedAt: T2,
      }),
      LIMITS,
    );
    if (!branched.ok) throw new Error(branched.error.code);
    expect(branched.history.redoEntries).toEqual([]);
    expect(branched.history.retainedInverseBytes).toBe(exactBytes(branched.history));
  });

  it("serializes a moved inverse once per Undo and Redo", () => {
    const history = textHistory(1);
    const stringify = vi.spyOn(JSON, "stringify");

    const undone = undoTreeHistory(history.tree, history.history, LIMITS);
    expect(undone.ok).toBe(true);
    expect(stringify).toHaveBeenCalledTimes(1);
    if (!undone.ok) return;
    redoTreeHistory(undone.tree, undone.history, LIMITS);
    expect(stringify).toHaveBeenCalledTimes(2);
  });

  it("releases oldest undo when Undo grows the total, but tolerates overage once undo is empty", () => {
    const history = textHistory(3);
    const entryBytes = history.history.entries.map(({ retainedInverseBytes }) => retainedInverseBytes);
    const tight = {
      maxEntries: 8,
      maxRetainedInverseBytes: history.history.retainedInverseBytes,
    };

    // Each undo appends ":inverse" to the moved command id, so it grows.
    const undone = undoTreeHistory(history.tree, history.history, tight);
    if (!undone.ok) throw new Error(undone.error.code);
    expect(undone.history.retainedInverseBytes).toBeLessThanOrEqual(tight.maxRetainedInverseBytes);
    expect(undone.history.entries.length).toBeLessThan(history.history.entries.length - 1);
    expect(undone.history.redoEntries).toHaveLength(1);
    expect(undone.history.retainedInverseBytes).toBe(exactBytes(undone.history));

    const redoOnly = {
      maxEntries: 8,
      maxRetainedInverseBytes: Math.min(...entryBytes),
    };
    let cursor = { tree: history.tree, history: history.history };
    for (let step = 0; step < history.history.entries.length; step += 1) {
      const next = undoTreeHistory(cursor.tree, cursor.history, redoOnly);
      if (!next.ok) break;
      cursor = next;
    }
    expect(cursor.history.entries).toEqual([]);
    expect(cursor.history.redoEntries.length).toBeGreaterThan(0);
    expect(cursor.history.retainedInverseBytes).toBe(exactBytes(cursor.history));
  });

  it("reports empty undo without changing either input", () => {
    const tree = createEmptyTree("tree_1");
    const history = createTreeHistory();
    const result = undoTreeHistory(tree, history, LIMITS);

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
    const undone = undoTreeHistory(initialized.tree, initialized.history, LIMITS);
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

  it("bounds a journal from another policy by releasing oldest undo, then the furthest redo", () => {
    const history = textHistory(6);
    let undone = undoTreeHistory(history.tree, history.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    undone = undoTreeHistory(undone.tree, undone.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    const { entries, redoEntries } = undone.history;

    expect(boundTreeHistory(undone.history, LIMITS)).toBe(undone.history);
    const fewer = boundTreeHistory(undone.history, { ...LIMITS, maxEntries: 3 });
    expect(fewer.entries).toEqual(entries.slice(-1));
    expect(fewer.redoEntries).toEqual(redoEntries);
    const redoOnly = boundTreeHistory(undone.history, { ...LIMITS, maxEntries: 1 });
    expect(redoOnly.entries).toEqual([]);
    expect(redoOnly.redoEntries).toEqual(redoEntries.slice(-1));
    expect(redoOnly.retainedInverseBytes).toBe(exactBytes(redoOnly));
  });

  it("dry-runs only the next Undo and Redo, releasing a stack whose top no longer applies", () => {
    const history = textHistory(3);
    const undone = undoTreeHistory(history.tree, history.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);

    expect(verifyHistoryTops(undone.tree, undone.history)).toEqual({
      history: undone.history,
      released: false,
    });
    // A deeper broken entry is left for the engine to refuse at use.
    const deepBroken = withBrokenUndo(undone.history, 1);
    expect(verifyHistoryTops(undone.tree, deepBroken).released).toBe(false);

    const topBroken = withBrokenUndo(undone.history, undone.history.entries.length - 1);
    const verified = verifyHistoryTops(undone.tree, topBroken);
    expect(verified.released).toBe(true);
    expect(verified.history.entries).toEqual([]);
    expect(verified.history.redoEntries).toBe(undone.history.redoEntries);
  });

  it("replays both stacks for callers that migrate a whole journal", () => {
    const history = textHistory(3);
    const undone = undoTreeHistory(history.tree, history.history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);

    expect(canReplayTreeHistory(undone.tree, undone.history)).toBe(true);
    expect(canReplayTreeHistory(undone.tree, withBrokenUndo(undone.history, 1))).toBe(false);
  });
});

function withBrokenUndo(history: TreeHistory, index: number): TreeHistory {
  const entries = [...history.entries];
  entries[index] = brokenEntry(entries[index]!);
  return { ...history, entries };
}

function brokenEntry(entry: TreeHistoryEntry): TreeHistoryEntry {
  if (entry.inverse.mutation.type !== "replace-text") throw new Error("fixture expects text steps");
  return {
    ...entry,
    inverse: {
      ...entry.inverse,
      mutation: { ...entry.inverse.mutation, expectedText: "not the current text" },
    },
  };
}

const SUBTREE_ROOT = materialId("s", 0);

function materialId(prefix: string, index: number): string {
  const stem = `${prefix}${index}_`;
  return stem.padEnd(MAX_MATERIAL_ID_BYTES, "x");
}

/**
 * Every bound at once: the node count, 2,000 code units that each need a
 * six-byte JSON escape, and maximum-length ids, with every node but the root
 * inside one removable subtree.
 */
function maximalTree(): ThoughtTree {
  const text = "\u0001".repeat(MAX_NODE_TEXT_CODE_UNITS);
  const rootId = materialId("r", 0);
  const nodes: Record<string, ThoughtNode> = {
    [rootId]: { ...node(rootId, "root", null), children: [SUBTREE_ROOT] },
    [SUBTREE_ROOT]: { ...node(SUBTREE_ROOT, text, rootId) },
  };
  const parents = [SUBTREE_ROOT];
  let created = 2;
  for (let parentIndex = 0; created < MAX_NODES_PER_TREE; parentIndex += 1) {
    const parentId = parents[parentIndex]!;
    for (let child = 0; child < MAX_CHILDREN_PER_NODE && created < MAX_NODES_PER_TREE; child += 1) {
      const id = materialId("n", created);
      nodes[id] = node(id, text, parentId);
      nodes[parentId]!.children.push(id);
      parents.push(id);
      created += 1;
    }
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_1",
    rootId,
    nodes,
    revision: 1,
  };
}
