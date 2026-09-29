import {
  boundTreeHistory,
  createTreeHistory,
  verifyHistoryTops,
  type TreeHistory,
  type TreeHistoryEntry,
  type TreeHistoryLimits,
} from "../tree/history";
import type { ThoughtTree, TreeCommand, TreeMutation } from "../tree/model";
import { isNonNegativeSafeInteger, isPlainRecord } from "./stored-value";

/**
 * A journal parsed at the storage boundary. `released` records that stored
 * steps existed but could not be recovered; policy bounds never set it.
 */
export type RecoveredHistory = Readonly<{
  history: TreeHistory;
  released: boolean;
}>;

const COMMAND_SOURCES: ReadonlySet<unknown> = new Set<TreeCommand["source"]>([
  "human",
  "repair",
  "agent",
  "fixture",
]);

const MUTATION_TYPES: ReadonlySet<unknown> = new Set<TreeMutation["type"]>([
  "initialize-root",
  "clear-root",
  "insert-node",
  "remove-subtree",
  "restore-subtree",
  "replace-text",
  "replace-title",
  "move-node",
]);

/**
 * Attaches a recovered journal to the tree it will reverse. Recovery stays
 * constant-cost in the journal length: the bounds are applied, then only the
 * next Undo and Redo are dry-run. Every deeper entry is validated by the tree
 * engine at use, which refuses any memento that no longer matches, so a stale
 * entry can release history but can never change material inexactly.
 */
export function attachRecoveredHistory(
  tree: ThoughtTree,
  candidate: RecoveredHistory | null | undefined,
  limits: TreeHistoryLimits,
): RecoveredHistory {
  if (candidate === null || candidate === undefined) {
    return Object.freeze({ history: createTreeHistory(), released: false });
  }
  const verified = verifyHistoryTops(tree, boundTreeHistory(candidate.history, limits));
  return Object.freeze({
    history: verified.history,
    released: candidate.released || verified.released,
  });
}

/**
 * The cheap shape check a stored inverse must pass before it may wait in a
 * stack: the envelope and a known mutation kind, never the memento payload.
 */
export function parseHistoryEntry(
  value: unknown,
  treeId: string,
  limits: TreeHistoryLimits,
): TreeHistoryEntry | null {
  if (!isPlainRecord(value)) return null;
  const { commandId, source, inverse, retainedInverseBytes } = value;
  if (
    typeof commandId !== "string" || commandId.length === 0 ||
    !COMMAND_SOURCES.has(source) ||
    !isNonNegativeSafeInteger(retainedInverseBytes) ||
    retainedInverseBytes > limits.maxRetainedInverseBytes ||
    !isPlainRecord(inverse) ||
    typeof inverse.id !== "string" || inverse.id.length === 0 ||
    inverse.source !== source ||
    inverse.expectedTreeId !== treeId ||
    !isNonNegativeSafeInteger(inverse.expectedRevision) ||
    typeof inverse.createdAt !== "string" ||
    !isPlainRecord(inverse.mutation) ||
    !MUTATION_TYPES.has(inverse.mutation.type)
  ) return null;
  // Left unfrozen: the store deep-freezes history it publishes, and a frozen
  // entry would stop that walk before its memento.
  return {
    commandId,
    source: source as TreeCommand["source"],
    inverse: inverse as unknown as TreeCommand,
    retainedInverseBytes,
    bytesUnverified: true,
  };
}

/**
 * Reads the inline journal written before v6. Each stack keeps the entries
 * above its newest unreadable one, because those are exactly the steps that
 * remain reachable. Only the newest `maxEntries` of a stack are examined: the
 * bound would release anything older without a notice anyway.
 */
export function parseLegacyHistory(
  value: unknown,
  treeId: string,
  limits: TreeHistoryLimits,
): RecoveredHistory {
  if (value === undefined || value === null) {
    return Object.freeze({ history: createTreeHistory(), released: false });
  }
  if (
    !isPlainRecord(value) ||
    !Array.isArray(value.entries) ||
    (value.redoEntries !== undefined && !Array.isArray(value.redoEntries))
  ) {
    return Object.freeze({ history: createTreeHistory(), released: true });
  }
  const undo = readableTop(value.entries, treeId, limits);
  const redo = readableTop((value.redoEntries as unknown[] | undefined) ?? [], treeId, limits);
  return Object.freeze({
    history: { entries: undo.entries, redoEntries: redo.entries },
    released: undo.released || redo.released,
  });
}

function readableTop(
  stack: readonly unknown[],
  treeId: string,
  limits: TreeHistoryLimits,
): Readonly<{ entries: TreeHistoryEntry[]; released: boolean }> {
  const floor = Math.max(0, stack.length - limits.maxEntries);
  const entries: TreeHistoryEntry[] = [];
  for (let index = stack.length - 1; index >= floor; index -= 1) {
    const entry = parseHistoryEntry(stack[index], treeId, limits);
    if (entry === null) {
      return Object.freeze({ entries: entries.reverse(), released: true });
    }
    entries.push(entry);
  }
  return Object.freeze({ entries: entries.reverse(), released: false });
}

