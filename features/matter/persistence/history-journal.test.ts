import { describe, expect, it } from "vitest";
import {
  commitTreeCommand,
  createTreeHistory,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
} from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import {
  assembleHistoryJournal,
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  historyJournalManifest,
  historyReadRange,
  nextHistoryEpoch,
  planHistoryJournalWrite,
  readHistoryManifest,
  shedHistoryRetention,
} from "./history-journal";

const LIMITS = { maxEntries: 100, maxRetainedInverseBytes: 1_000_000 };
const TIME = "2026-09-29T00:00:00.000Z";

describe("history journal layout", () => {
  it("writes a first journal at consecutive positions of both stacks", () => {
    const session = steps(3);
    const undone = undo(session);
    const plan = planHistoryJournalWrite("tree", emptyHistoryJournal(4), undone.history, FULL_HISTORY_RETENTION);

    expect(plan.journal).toMatchObject({
      epoch: 4,
      undo: { first: 0, entries: undone.history.entries },
      redo: { first: 0, entries: undone.history.redoEntries },
    });
    expect(plan.records.map(({ stack, position, commandId }) => [stack, position, commandId])).toEqual([
      ["undo", 0, "init"],
      ["undo", 1, "step_1"],
      ["undo", 2, "step_2"],
      ["redo", 0, "step_3"],
    ]);
    expect(plan.records.every((record) => record.treeId === "tree" && record.epoch === 4)).toBe(true);
  });

  it("writes only steps that reached a stack since the last save", () => {
    const first = steps(2);
    const saved = planHistoryJournalWrite("tree", emptyHistoryJournal(0), first.history, FULL_HISTORY_RETENTION);
    const next = commit(first, "step_3");

    const plan = planHistoryJournalWrite("tree", saved.journal, next.history, FULL_HISTORY_RETENTION);
    expect(plan.records.map(({ position, commandId }) => [position, commandId])).toEqual([[3, "step_3"]]);
    expect(historyJournalManifest(plan.journal, 2, next.tree.revision)).toMatchObject({
      undo: [0, 4],
      redo: [0, 0],
      count: 4,
    });
  });

  it("collapses several commits, undos, and redos between saves into their net change", () => {
    const first = steps(2);
    const saved = planHistoryJournalWrite("tree", emptyHistoryJournal(0), first.history, FULL_HISTORY_RETENTION);
    let session = commit(first, "transient");
    session = undo(session);
    session = commit(session, "kept");

    const plan = planHistoryJournalWrite("tree", saved.journal, session.history, FULL_HISTORY_RETENTION);
    expect(plan.records.map(({ stack, position, commandId }) => [stack, position, commandId])).toEqual([
      ["undo", 3, "kept"],
    ]);
    expect(plan.journal.redo.entries).toEqual([]);
  });

  it("moves an undone step to redo without rewriting the steps beneath it", () => {
    const session = steps(3);
    const saved = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, FULL_HISTORY_RETENTION);
    const undone = undo(session);

    const plan = planHistoryJournalWrite("tree", saved.journal, undone.history, FULL_HISTORY_RETENTION);
    expect(plan.records.map(({ stack, position }) => [stack, position])).toEqual([["redo", 0]]);
    expect(historyJournalManifest(plan.journal, 2, undone.tree.revision)).toMatchObject({
      undo: [0, 3],
      redo: [0, 1],
    });

    const redone = redo(undone);
    const replan = planHistoryJournalWrite("tree", plan.journal, redone.history, FULL_HISTORY_RETENTION);
    expect(replan.records.map(({ stack, position }) => [stack, position])).toEqual([["undo", 3]]);
    // Positions continue past the released run, so no old record is reused.
    expect(historyJournalManifest(replan.journal, 3, redone.tree.revision)).toMatchObject({
      undo: [0, 4],
      redo: [1, 1],
    });
  });

  it("advances the first position when the bound releases the oldest step", () => {
    const limits = { ...LIMITS, maxEntries: 3 };
    const session = steps(2, limits);
    const saved = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, FULL_HISTORY_RETENTION);
    const next = commit(session, "step_3", limits);

    const plan = planHistoryJournalWrite("tree", saved.journal, next.history, FULL_HISTORY_RETENTION);
    expect(plan.records.map(({ position }) => position)).toEqual([3]);
    expect(historyJournalManifest(plan.journal, 2, next.tree.revision)).toMatchObject({ undo: [1, 4] });
  });

  it("sheds half of the retained undo bytes, then all undo, then redo, and stops at material", () => {
    const session = undo(steps(4));
    const undoBytes = session.history.entries.reduce((total, entry) => total + entry.retainedInverseBytes, 0);

    const half = shedHistoryRetention(session.history, FULL_HISTORY_RETENTION);
    expect(half).toEqual({ maxUndoBytes: Math.floor(undoBytes / 2), keepRedo: true });
    const halfPlan = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, half!);
    const kept = halfPlan.journal.undo.entries;
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(session.history.entries.length);
    expect(kept).toEqual(session.history.entries.slice(-kept.length));
    expect(kept.reduce((total, entry) => total + entry.retainedInverseBytes, 0))
      .toBeLessThanOrEqual(half!.maxUndoBytes);
    expect(halfPlan.journal.redo.entries).toEqual(session.history.redoEntries);

    const noUndo = shedHistoryRetention(session.history, half!);
    expect(noUndo).toEqual({ maxUndoBytes: 0, keepRedo: true });
    const noHistory = shedHistoryRetention(session.history, noUndo!);
    expect(noHistory).toEqual({ maxUndoBytes: 0, keepRedo: false });
    expect(shedHistoryRetention(session.history, noHistory!)).toBeNull();
    const bare = planHistoryJournalWrite("tree", halfPlan.journal, session.history, noHistory!);
    expect(bare.records).toEqual([]);
    expect(historyJournalManifest(bare.journal, 1, 0)).toMatchObject({ count: 0, bytes: 0 });
    expect(shedHistoryRetention(createTreeHistory(), FULL_HISTORY_RETENTION)).toBeNull();
  });

  it("reads a manifest only when it describes exactly this row in this format", () => {
    const row = { writeGeneration: 7, treeRevision: 12 };
    const manifest = historyJournalManifest(emptyHistoryJournal(2), 7, 12);

    expect(readHistoryManifest(row)).toEqual({ status: "absent" });
    expect(readHistoryManifest({ ...row, historyJournal: manifest })).toEqual({ status: "journal", manifest });
    for (const historyJournal of [
      { ...manifest, formatVersion: 2 },
      { ...manifest, writeGeneration: 6 },
      { ...manifest, treeRevision: 11 },
      { ...manifest, undo: [3, 2] },
      { ...manifest, count: 1 },
      { ...manifest, epoch: -1 },
      "manifest",
    ]) {
      expect(readHistoryManifest({ ...row, historyJournal })).toEqual({ status: "unusable" });
    }
  });

  it("reassembles a stored journal with the same entries it was written from", () => {
    const session = undo(steps(3));
    const written = planHistoryJournalWrite("tree", emptyHistoryJournal(1), session.history, FULL_HISTORY_RETENTION);
    const manifest = historyJournalManifest(written.journal, 5, session.tree.revision);
    const records = storedCopy(written.records);

    const assembled = assembleHistoryJournal(
      "tree",
      manifest,
      records.filter(({ stack }) => stack === "undo"),
      records.filter(({ stack }) => stack === "redo"),
      LIMITS,
    );
    expect(assembled.recovered).toEqual({ history: session.history, released: false });
    expect(assembled.journal).toEqual(written.journal);
    // The layout refers to the recovered objects, so the next save reuses them.
    expect(assembled.journal.undo.entries[0]).toBe(assembled.recovered.history.entries[0]);
  });

  it("keeps the steps above a missing or unreadable record and reports the release", () => {
    const session = steps(4);
    const written = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, FULL_HISTORY_RETENTION);
    const manifest = historyJournalManifest(written.journal, 1, session.tree.revision);
    const undoRecords = storedCopy(written.records);

    const missing = assembleHistoryJournal(
      "tree",
      manifest,
      undoRecords.filter(({ position }) => position !== 2),
      [],
      LIMITS,
    );
    expect(missing.recovered.released).toBe(true);
    expect(missing.recovered.history.entries.map(({ commandId }) => commandId)).toEqual(["step_3", "step_4"]);
    expect(missing.journal.undo.first).toBe(3);

    const damaged = assembleHistoryJournal(
      "tree",
      manifest,
      undoRecords.map((record) => record.position === 4 ? { ...record, inverse: null } : record),
      [],
      LIMITS,
    );
    expect(damaged.recovered).toEqual({ history: createTreeHistory(), released: true });
    expect(damaged.journal.undo).toEqual({ first: 5, entries: [] });

    const foreignEpoch = assembleHistoryJournal(
      "tree",
      { ...manifest, epoch: 1 },
      undoRecords,
      [],
      LIMITS,
    );
    expect(foreignEpoch.recovered.released).toBe(true);
  });

  it("releases everything when whole stacks disagree with the manifest totals", () => {
    const session = steps(2);
    const written = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, FULL_HISTORY_RETENTION);
    const manifest = historyJournalManifest(written.journal, 1, session.tree.revision);
    const records = storedCopy(written.records).map((record) => ({ ...record, retainedInverseBytes: 1 }));

    expect(assembleHistoryJournal("tree", manifest, records, [], LIMITS)).toEqual({
      recovered: { history: createTreeHistory(), released: true },
      journal: emptyHistoryJournal(0),
    });
  });

  it("reads only the newest positions a bound can keep, without announcing the older ones", () => {
    const session = steps(4);
    const written = planHistoryJournalWrite("tree", emptyHistoryJournal(0), session.history, FULL_HISTORY_RETENTION);
    const manifest = historyJournalManifest(written.journal, 1, session.tree.revision);
    const limits = { ...LIMITS, maxEntries: 2 };

    expect(historyReadRange(manifest.undo, limits)).toEqual([3, 5]);
    const assembled = assembleHistoryJournal(
      "tree",
      manifest,
      storedCopy(written.records).filter(({ position }) => position >= 3),
      [],
      limits,
    );
    expect(assembled.recovered.released).toBe(false);
    expect(assembled.recovered.history.entries.map(({ commandId }) => commandId)).toEqual(["step_3", "step_4"]);
  });

  it("starts each document boundary in the next epoch", () => {
    expect(nextHistoryEpoch(undefined)).toBe(0);
    expect(nextHistoryEpoch({ history: { entries: [] } })).toBe(0);
    expect(nextHistoryEpoch({ historyJournal: historyJournalManifest(emptyHistoryJournal(4), 1, 0) })).toBe(5);
    expect(nextHistoryEpoch({ historyJournal: { epoch: Number.MAX_SAFE_INTEGER } })).toBe(0);
  });
});

type Session = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;

function steps(count: number, limits = LIMITS): Session {
  const initialized = commitTreeCommand(createEmptyTree("tree"), createTreeHistory(), {
    id: "init",
    source: "human",
    expectedTreeId: "tree",
    expectedRevision: 0,
    createdAt: TIME,
    mutation: {
      type: "initialize-root",
      root: { id: "root", text: "0", parentId: null, children: [], createdAt: TIME, updatedAt: TIME },
    },
  }, limits);
  if (!initialized.ok) throw new Error(initialized.error.code);
  let session: Session = initialized;
  for (let step = 1; step <= count; step += 1) session = commit(session, `step_${step}`, limits);
  return session;
}

function commit(session: Session, id: string, limits = LIMITS): Session {
  const root = session.tree.nodes.root!;
  const command: TreeCommand = {
    id,
    source: "human",
    expectedTreeId: "tree",
    expectedRevision: session.tree.revision,
    createdAt: TIME,
    mutation: {
      type: "replace-text",
      nodeId: "root",
      expectedText: root.text,
      expectedUpdatedAt: root.updatedAt,
      text: `${root.text}+${id}`,
      updatedAt: TIME,
    },
  };
  const result = commitTreeCommand(session.tree, session.history, command, limits);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function undo(session: Session): Session {
  const result = undoTreeHistory(session.tree, session.history, LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function redo(session: Session): Session {
  const result = redoTreeHistory(session.tree, session.history, LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

/** What IndexedDB hands back: a structured clone, never the written objects. */
function storedCopy(records: PersistedRecords) {
  return structuredClone([...records]);
}

type PersistedRecords = ReturnType<typeof planHistoryJournalWrite>["records"];
