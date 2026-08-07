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
  const history = candidate as TreeHistory;
  let cursorTree = tree;
  let cursorHistory = history;
  while (cursorHistory.entries.length > 0) {
    const undone = undoTreeHistory(cursorTree, cursorHistory);
    if (!undone.ok) return createTreeHistory();
    cursorTree = undone.tree;
    cursorHistory = undone.history;
  }
  return history;
}

function isHistoryShape(value: unknown, limits: TreeHistoryLimits): boolean {
  if (!isPlainRecord(value) || !Array.isArray(value.entries) ||
    !isNonNegativeSafeInteger(value.retainedInverseBytes) ||
    value.entries.length > limits.maxEntries) return false;
  let total = 0;
  for (const entry of value.entries) {
    if (!isPlainRecord(entry) ||
      typeof entry.commandId !== "string" || entry.commandId.length === 0 ||
      (entry.source !== "human" && entry.source !== "agent" && entry.source !== "fixture") ||
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
