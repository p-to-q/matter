import {
  applyTreeCommand,
} from "../tree/engine";
import {
  createTreeHistory,
  undoTreeHistory,
  type TreeHistory,
  type TreeHistoryLimits,
} from "../tree/history";
import type { ThoughtTree } from "../tree/model";

/**
 * Owns the storage boundary for reversible history. A malformed journal never
 * corrupts material: it is discarded as a recoverable local convenience while
 * the independently validated tree remains available.
 */
export function recoverPersistedHistory(
  tree: ThoughtTree,
  candidate: unknown,
  limits: TreeHistoryLimits,
): TreeHistory {
  if (!isHistoryShape(candidate, limits)) return createTreeHistory();
  // Snapshots from before redo existed remain valid documents. Normalize that
  // journal at the persistence boundary so the running state has one shape.
  const stored = candidate as TreeHistory;
  const history: TreeHistory = {
    entries: stored.entries,
    redoEntries: stored.redoEntries ?? [],
    retainedInverseBytes: stored.retainedInverseBytes,
  };
  let cursorTree = tree;
  let cursorHistory = history;
  while (cursorHistory.entries.length > 0) {
    const undone = undoTreeHistory(cursorTree, cursorHistory);
    if (!undone.ok) return createTreeHistory();
    cursorTree = undone.tree;
    cursorHistory = undone.history;
  }

  // Redo entries are ordered as a stack: the last undone command must be the
  // first one that can be reapplied. Check that sequence too, otherwise a
  // malformed cache could look reversible until a person uses the shortcut.
  cursorTree = tree;
  const redoEntries = history.redoEntries ?? [];
  for (let index = redoEntries.length - 1; index >= 0; index -= 1) {
    const entry = redoEntries[index];
    if (entry === undefined) return createTreeHistory();
    const redone = applyTreeCommand(cursorTree, {
      ...entry.inverse,
      expectedRevision: cursorTree.revision,
    });
    if (!redone.ok) return createTreeHistory();
    cursorTree = redone.tree;
  }
  return history;
}

function isHistoryShape(value: unknown, limits: TreeHistoryLimits): boolean {
  if (!isPlainRecord(value) || !Array.isArray(value.entries) ||
    (value.redoEntries !== undefined && !Array.isArray(value.redoEntries)) ||
    !isNonNegativeSafeInteger(value.retainedInverseBytes) ||
    value.entries.length > limits.maxEntries) return false;
  const redoEntries = value.redoEntries ?? [];
  if (redoEntries.length > limits.maxEntries) return false;
  let total = 0;
  for (const entry of [...value.entries, ...redoEntries]) {
    if (!isPlainRecord(entry) ||
      typeof entry.commandId !== "string" || entry.commandId.length === 0 ||
      (entry.source !== "human" && entry.source !== "repair" && entry.source !== "agent" && entry.source !== "fixture") ||
      !isPlainRecord(entry.inverse) ||
      !isNonNegativeSafeInteger(entry.retainedInverseBytes)
    ) return false;
    total += entry.retainedInverseBytes;
    if (!Number.isSafeInteger(total) || total > limits.maxRetainedInverseBytes) return false;
  }
  return total === value.retainedInverseBytes;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
