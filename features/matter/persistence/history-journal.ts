import {
  HISTORY_JOURNAL_FORMAT_VERSION,
  type HistoryStackName,
  type StoredHistoryEntry,
  type StoredHistoryJournal,
  type StoredHistoryRange,
} from "./matter-database";
import { parseHistoryEntry, type RecoveredHistory } from "./history-recovery";
import { isNonNegativeSafeInteger, isPlainRecord } from "./stored-value";
import {
  createTreeHistory,
  retainedInverseBytes,
  type TreeHistory,
  type TreeHistoryEntry,
  type TreeHistoryLimits,
} from "../tree/history";

/**
 * Owns the per-entry undo journal layout: which positions of which epoch hold
 * which in-memory entries, how the next save differs from the last one, and
 * how a stored manifest and its records become a history again.
 *
 * Each stack is a run of consecutive positions `[first, first + length)`.
 * Undo, redo, commit, and eviction only push, pop, or release the oldest end,
 * so an unchanged entry keeps its position and a save writes only entries that
 * reached a stack since the last save. Entries are matched by identity: the
 * runtime freezes history, so an entry object never changes while it waits.
 *
 * This module is pure. The repository executes a plan inside the one
 * transaction that also compares and writes the snapshot row.
 */

export type PersistedHistoryStack = Readonly<{
  first: number;
  entries: readonly TreeHistoryEntry[];
}>;

/** Exactly what the basis row's manifest and records describe. */
export type PersistedHistoryJournal = Readonly<{
  epoch: number;
  undo: PersistedHistoryStack;
  redo: PersistedHistoryStack;
}>;

/**
 * How much of the in-memory history a save keeps durable. Storage pressure may
 * shed the oldest undo steps, then all of them, then redo, before material.
 */
export type HistoryRetention = Readonly<{
  maxUndoBytes: number;
  keepRedo: boolean;
}>;

export const FULL_HISTORY_RETENTION: HistoryRetention = Object.freeze({
  maxUndoBytes: Number.MAX_SAFE_INTEGER,
  keepRedo: true,
});

export type HistoryJournalWrite = Readonly<{
  journal: PersistedHistoryJournal;
  records: readonly StoredHistoryEntry[];
}>;

export function emptyHistoryJournal(epoch: number): PersistedHistoryJournal {
  const empty = Object.freeze({ first: 0, entries: Object.freeze([]) });
  return Object.freeze({ epoch, undo: empty, redo: empty });
}

/**
 * The next, smaller retention after storage refused a write, or `null` when
 * only material is left. Half of the retained undo bytes, then no undo, then
 * no redo.
 */
export function shedHistoryRetention(
  history: TreeHistory,
  retention: HistoryRetention,
): HistoryRetention | null {
  const undoBytes = retainedInverseBytes(retainedUndo(history.entries, retention.maxUndoBytes));
  if (undoBytes > 0 && retention.maxUndoBytes === FULL_HISTORY_RETENTION.maxUndoBytes) {
    return Object.freeze({ maxUndoBytes: Math.floor(undoBytes / 2), keepRedo: retention.keepRedo });
  }
  if (undoBytes > 0) return Object.freeze({ maxUndoBytes: 0, keepRedo: retention.keepRedo });
  if (retention.keepRedo && history.redoEntries.length > 0) {
    return Object.freeze({ maxUndoBytes: 0, keepRedo: false });
  }
  return null;
}

export function planHistoryJournalWrite(
  treeId: string,
  previous: PersistedHistoryJournal,
  history: TreeHistory,
  retention: HistoryRetention,
): HistoryJournalWrite {
  const undo = planStack(previous.undo, retainedUndo(history.entries, retention.maxUndoBytes));
  const redo = planStack(previous.redo, retention.keepRedo ? history.redoEntries : []);
  const records = [
    ...undo.writes.map((write) => storedEntry(treeId, previous.epoch, "undo", write)),
    ...redo.writes.map((write) => storedEntry(treeId, previous.epoch, "redo", write)),
  ];
  return Object.freeze({
    journal: Object.freeze({ epoch: previous.epoch, undo: undo.stack, redo: redo.stack }),
    records: Object.freeze(records),
  });
}

export function historyJournalManifest(
  journal: PersistedHistoryJournal,
  writeGeneration: number,
  treeRevision: number,
): StoredHistoryJournal {
  return Object.freeze({
    formatVersion: HISTORY_JOURNAL_FORMAT_VERSION,
    epoch: journal.epoch,
    writeGeneration,
    treeRevision,
    undo: stackRange(journal.undo),
    redo: stackRange(journal.redo),
    count: journal.undo.entries.length + journal.redo.entries.length,
    bytes: retainedInverseBytes(journal.undo.entries) + retainedInverseBytes(journal.redo.entries),
  });
}

export type StoredHistoryManifestRead =
  | Readonly<{ status: "journal"; manifest: StoredHistoryJournal }>
  | Readonly<{ status: "absent" }>
  /** Present but written in another format, or not describing this row. */
  | Readonly<{ status: "unusable" }>;

export function readHistoryManifest(
  row: Readonly<{ historyJournal?: unknown; writeGeneration: number; treeRevision: number }>,
): StoredHistoryManifestRead {
  const value = row.historyJournal;
  if (value === undefined) return Object.freeze({ status: "absent" });
  if (
    !isPlainRecord(value) ||
    value.formatVersion !== HISTORY_JOURNAL_FORMAT_VERSION ||
    !isNonNegativeSafeInteger(value.epoch) ||
    value.writeGeneration !== row.writeGeneration ||
    value.treeRevision !== row.treeRevision ||
    !isStoredRange(value.undo) ||
    !isStoredRange(value.redo) ||
    !isNonNegativeSafeInteger(value.count) ||
    !isNonNegativeSafeInteger(value.bytes) ||
    value.count !== rangeLength(value.undo) + rangeLength(value.redo)
  ) return Object.freeze({ status: "unusable" });
  return Object.freeze({ status: "journal", manifest: value as StoredHistoryJournal });
}

/** Only the newest `maxEntries` positions of a stack can survive the bound. */
export function historyReadRange(
  range: StoredHistoryRange,
  limits: TreeHistoryLimits,
): StoredHistoryRange {
  return [Math.max(range[0], range[1] - limits.maxEntries), range[1]];
}

/**
 * Rebuilds a history from the records read for `readHistoryManifest`'s ranges.
 * Each stack keeps the entries above its newest missing or unreadable record.
 * When both stacks were read whole, the manifest totals must match exactly.
 */
export function assembleHistoryJournal(
  treeId: string,
  manifest: StoredHistoryJournal,
  undoRecords: readonly unknown[],
  redoRecords: readonly unknown[],
  limits: TreeHistoryLimits,
): Readonly<{ recovered: RecoveredHistory; journal: PersistedHistoryJournal }> {
  const undo = assembleStack(treeId, manifest, "undo", undoRecords, limits);
  const redo = assembleStack(treeId, manifest, "redo", redoRecords, limits);
  const bytes = retainedInverseBytes(undo.stack.entries) + retainedInverseBytes(redo.stack.entries);
  const readWhole = !undo.released && !redo.released &&
    undo.stack.first === manifest.undo[0] && redo.stack.first === manifest.redo[0];
  if (readWhole && bytes !== manifest.bytes) {
    return Object.freeze({
      recovered: Object.freeze({ history: createTreeHistory(), released: true }),
      journal: emptyHistoryJournal(manifest.epoch),
    });
  }
  return Object.freeze({
    recovered: Object.freeze({
      history: { entries: [...undo.stack.entries], redoEntries: [...redo.stack.entries] },
      released: undo.released || redo.released,
    }),
    journal: Object.freeze({ epoch: manifest.epoch, undo: undo.stack, redo: redo.stack }),
  });
}

/**
 * The epoch a document boundary writes next. A boundary never deletes the
 * records of the row it replaces: a rolled-back import restores that row, and
 * the next ordinary save compacts every other epoch.
 */
export function nextHistoryEpoch(row: unknown): number {
  if (!isPlainRecord(row) || !isPlainRecord(row.historyJournal)) return 0;
  const epoch = row.historyJournal.epoch;
  return isNonNegativeSafeInteger(epoch) && epoch < Number.MAX_SAFE_INTEGER ? epoch + 1 : 0;
}

function assembleStack(
  treeId: string,
  manifest: StoredHistoryJournal,
  stack: HistoryStackName,
  records: readonly unknown[],
  limits: TreeHistoryLimits,
): Readonly<{ stack: PersistedHistoryStack; released: boolean }> {
  const [readFirst, end] = historyReadRange(manifest[stack], limits);
  const entries: TreeHistoryEntry[] = [];
  let expected = end - 1;
  for (let index = records.length - 1; index >= 0 && expected >= readFirst; index -= 1) {
    const record = records[index];
    if (
      !isPlainRecord(record) ||
      record.formatVersion !== manifest.formatVersion ||
      record.treeId !== treeId ||
      record.epoch !== manifest.epoch ||
      record.stack !== stack ||
      record.position !== expected
    ) break;
    const entry = parseHistoryEntry(record, treeId, limits);
    if (entry === null) break;
    entries.push(entry);
    expected -= 1;
  }
  entries.reverse();
  return Object.freeze({
    stack: Object.freeze({ first: end - entries.length, entries: Object.freeze(entries) }),
    released: entries.length !== end - readFirst,
  });
}

function planStack(
  previous: PersistedHistoryStack,
  next: readonly TreeHistoryEntry[],
): Readonly<{
  stack: PersistedHistoryStack;
  writes: readonly Readonly<{ position: number; entry: TreeHistoryEntry }>[];
}> {
  const offset = next.length === 0 ? -1 : previous.entries.indexOf(next[0]!);
  // Without an overlap, positions continue past everything the stack held, so
  // a new run never shares a position with an older record it replaces.
  const first = offset < 0 ? previous.first + previous.entries.length : previous.first + offset;
  let reused = 0;
  if (offset >= 0) {
    while (
      reused < next.length &&
      offset + reused < previous.entries.length &&
      previous.entries[offset + reused] === next[reused]
    ) reused += 1;
  }
  const writes = [];
  for (let index = reused; index < next.length; index += 1) {
    writes.push(Object.freeze({ position: first + index, entry: next[index]! }));
  }
  return Object.freeze({
    stack: Object.freeze({ first, entries: next }),
    writes,
  });
}

function retainedUndo(
  entries: readonly TreeHistoryEntry[],
  maxUndoBytes: number,
): readonly TreeHistoryEntry[] {
  let first = entries.length;
  let bytes = 0;
  while (first > 0 && bytes + entries[first - 1]!.retainedInverseBytes <= maxUndoBytes) {
    first -= 1;
    bytes += entries[first]!.retainedInverseBytes;
  }
  return first === 0 ? entries : entries.slice(first);
}

function storedEntry(
  treeId: string,
  epoch: number,
  stack: HistoryStackName,
  write: Readonly<{ position: number; entry: TreeHistoryEntry }>,
): StoredHistoryEntry {
  return Object.freeze({
    formatVersion: HISTORY_JOURNAL_FORMAT_VERSION,
    treeId,
    epoch,
    stack,
    position: write.position,
    commandId: write.entry.commandId,
    source: write.entry.source,
    inverse: write.entry.inverse,
    retainedInverseBytes: write.entry.retainedInverseBytes,
  });
}

function stackRange(stack: PersistedHistoryStack): StoredHistoryRange {
  return Object.freeze([stack.first, stack.first + stack.entries.length]) as StoredHistoryRange;
}

function isStoredRange(value: unknown): value is StoredHistoryRange {
  return Array.isArray(value) &&
    value.length === 2 &&
    isNonNegativeSafeInteger(value[0]) &&
    isNonNegativeSafeInteger(value[1]) &&
    value[0] <= value[1];
}

function rangeLength(range: StoredHistoryRange): number {
  return range[1] - range[0];
}
