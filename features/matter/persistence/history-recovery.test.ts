import { describe, expect, it } from "vitest";
import {
  commitTreeCommand,
  createTreeHistory,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
} from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { attachRecoveredHistory, parseHistoryEntry, parseLegacyHistory } from "./history-recovery";

const LIMITS = { maxEntries: 100, maxRetainedInverseBytes: 100_000 };
const TIME = "2026-08-08T00:00:00.000Z";

describe("persisted undo history", () => {
  it("restores a complete inverse chain against its saved material", () => {
    const { tree, history } = twoSteps();

    expect(attachRecoveredHistory(tree, { history: structuredClone(history), released: false }, LIMITS))
      .toEqual({ history, released: false });
  });

  it("recovers both stacks so a keyboard redo remains exact after reload", () => {
    const { tree, history } = twoSteps();
    const undone = undoTreeHistory(tree, history, LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);

    const recovered = attachRecoveredHistory(
      undone.tree,
      { history: structuredClone(undone.history), released: false },
      LIMITS,
    );
    expect(recovered.history.entries).toHaveLength(1);
    expect(recovered.history.redoEntries).toHaveLength(1);
    const redone = redoTreeHistory(undone.tree, recovered.history, LIMITS);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.tree.nodes.child?.text).toBe("second");
  });

  it("dry-runs only the stack tops, so recovery cost does not grow with the journal", () => {
    const { tree, history } = twoSteps();
    const [oldest, newest] = history.entries;
    if (oldest === undefined || newest === undefined) throw new Error("two steps expected");
    const deepDamage: TreeHistory = {
      ...history,
      entries: [{ ...oldest, inverse: { ...oldest.inverse, expectedTreeId: "elsewhere" } }, newest],
    };

    const recovered = attachRecoveredHistory(tree, { history: deepDamage, released: false }, LIMITS);
    expect(recovered.released).toBe(false);
    expect(recovered.history.entries).toHaveLength(2);
    // The engine refuses the damaged step when it is reached.
    const first = undoTreeHistory(tree, recovered.history, LIMITS);
    if (!first.ok) throw new Error(first.error.code);
    expect(undoTreeHistory(first.tree, first.history, LIMITS)).toMatchObject({
      ok: false,
      error: { code: "HISTORY_UNAVAILABLE" },
      history: { entries: [] },
    });
  });

  it("releases a stack whose top step no longer matches the material and says so", () => {
    const { tree, history } = twoSteps();
    const moved: ThoughtTree = { ...tree, revision: tree.revision + 1, nodes: {
      ...tree.nodes,
      child: { ...tree.nodes.child!, text: "edited elsewhere" },
    } };

    expect(attachRecoveredHistory(moved, { history, released: false }, LIMITS)).toEqual({
      history: createTreeHistory(),
      released: true,
    });
  });

  it("applies the product bound without announcing an ordinary release", () => {
    const { tree, history } = twoSteps();
    const recovered = attachRecoveredHistory(tree, { history, released: false }, {
      maxEntries: 1,
      maxRetainedInverseBytes: LIMITS.maxRetainedInverseBytes,
    });

    expect(recovered.released).toBe(false);
    expect(recovered.history.entries).toEqual(history.entries.slice(-1));
  });

  it("parses only a known envelope and mutation kind for this tree", () => {
    const { history } = twoSteps();
    const entry = history.entries[0]!;

    expect(parseHistoryEntry(structuredClone(entry), "tree", LIMITS)).toEqual(entry);
    expect(parseHistoryEntry({ ...entry, source: "model" }, "tree", LIMITS)).toBeNull();
    expect(parseHistoryEntry(entry, "another-tree", LIMITS)).toBeNull();
    expect(parseHistoryEntry({
      ...entry,
      inverse: { ...entry.inverse, mutation: { type: "rewrite-everything" } },
    }, "tree", LIMITS)).toBeNull();
    expect(parseHistoryEntry({
      ...entry,
      retainedInverseBytes: LIMITS.maxRetainedInverseBytes + 1,
    }, "tree", LIMITS)).toBeNull();
    expect(parseHistoryEntry([], "tree", LIMITS)).toBeNull();
  });

  it("migrates a pre-v6 inline journal, keeping the steps above the newest unreadable one", () => {
    const { history } = twoSteps();
    const [oldest, newest] = history.entries;

    expect(parseLegacyHistory(structuredClone(history), "tree", LIMITS)).toEqual({
      history,
      released: false,
    });
    // Journals written before redo existed carry no redo stack.
    expect(parseLegacyHistory({
      entries: structuredClone(history.entries),
      retainedInverseBytes: history.retainedInverseBytes,
    }, "tree", LIMITS)).toEqual({ history, released: false });
    expect(parseLegacyHistory({
      entries: [{ bad: true }, newest],
      retainedInverseBytes: history.retainedInverseBytes,
    }, "tree", LIMITS)).toEqual({
      history: {
        entries: [newest],
        redoEntries: [],
        retainedInverseBytes: newest!.retainedInverseBytes,
      },
      released: true,
    });
    expect(parseLegacyHistory({ entries: [oldest, { bad: true }] }, "tree", LIMITS)).toEqual({
      history: createTreeHistory(),
      released: true,
    });
  });

  it("distinguishes a row that never had a journal from one whose journal is unreadable", () => {
    expect(parseLegacyHistory(undefined, "tree", LIMITS)).toEqual({
      history: createTreeHistory(),
      released: false,
    });
    expect(parseLegacyHistory({ entries: "not a stack" }, "tree", LIMITS)).toEqual({
      history: createTreeHistory(),
      released: true,
    });
  });

  it("examines only the newest steps a bound can keep from a very long legacy journal", () => {
    const { history } = twoSteps();
    const newest = history.entries.at(-1)!;
    const long = { entries: [{ corrupt: "far below the bound" }, ...Array.from({ length: 3 }, () => newest)] };

    expect(parseLegacyHistory(long, "tree", { ...LIMITS, maxEntries: 3 })).toMatchObject({
      history: { entries: [newest, newest, newest] },
      released: false,
    });
  });
});

function twoSteps() {
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
  return inserted;
}

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
