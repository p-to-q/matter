import { applyTreeCommand } from "./engine";
import type {
  CommandErrorCode,
  DetachedSubtree,
  ThoughtNode,
  ThoughtTree,
  TreeCommand,
  TreeMutation,
} from "./model";

export type TreeHistoryEntry = {
  commandId: string;
  source: TreeCommand["source"];
  inverse: TreeCommand;
  retainedInverseBytes: number;
};

export type TreeHistory = {
  /** Commands that can be applied backwards from the current material, oldest first. */
  entries: TreeHistoryEntry[];
  /** Commands reachable only through the platform Redo keyboard convention; the last is next. */
  redoEntries: TreeHistoryEntry[];
  /** Exact inverse bytes retained across both reversible stacks. */
  retainedInverseBytes: number;
};

export type TreeHistoryLimits = {
  maxEntries: number;
  maxRetainedInverseBytes: number;
};

/**
 * Undo is bounded across both stacks (owner decision 2026-09-29). Older steps
 * are released; long-term recovery is an exported archive, not the journal.
 *
 * The byte bound exceeds the largest legal single inverse: restoring a subtree
 * of every node at the text and id bounds with every code unit needing a JSON
 * escape serializes to about 24 MiB. No valid change is therefore refused.
 */
export const MATTER_HISTORY_LIMITS: Readonly<TreeHistoryLimits> = Object.freeze({
  maxEntries: 1_000,
  maxRetainedInverseBytes: 32 * 1_024 * 1_024,
});

export type EstimateInverseBytes = (inverse: TreeCommand) => number;

export type CommitTreeCommandResult =
  | {
      ok: true;
      tree: ThoughtTree;
      history: TreeHistory;
      affectedNodeIds: string[];
    }
  | {
      ok: false;
      tree: ThoughtTree;
      history: TreeHistory;
      error:
        | { code: CommandErrorCode; message: string }
        | { code: "HISTORY_LIMIT_EXCEEDED"; message: string };
    };

/**
 * `HISTORY_UNAVAILABLE` means the top inverse no longer applies. Every older
 * entry on that stack could only be reached through it, so the returned history
 * has released that whole stack; the tree is unchanged.
 */
export type UndoTreeHistoryResult =
  | {
      ok: true;
      tree: ThoughtTree;
      history: TreeHistory;
      affectedNodeIds: string[];
    }
  | {
      ok: false;
      tree: ThoughtTree;
      history: TreeHistory;
      error:
        | { code: "EMPTY_HISTORY"; message: string }
        | { code: "HISTORY_UNAVAILABLE"; message: string };
    };

export type RedoTreeHistoryResult =
  | {
      ok: true;
      tree: ThoughtTree;
      history: TreeHistory;
      affectedNodeIds: string[];
    }
  | {
      ok: false;
      tree: ThoughtTree;
      history: TreeHistory;
      error:
        | { code: "EMPTY_REDO"; message: string }
        | { code: "HISTORY_UNAVAILABLE"; message: string };
    };

export function createTreeHistory(): TreeHistory {
  return { entries: [], redoEntries: [], retainedInverseBytes: 0 };
}

export function estimateSerializedInverseBytes(inverse: TreeCommand): number {
  return new TextEncoder().encode(JSON.stringify(inverse)).byteLength;
}

/**
 * The material commit boundary. A command is published only when its exact
 * inverse can enter history; capacity failure preserves both input objects.
 */
export function commitTreeCommand(
  tree: ThoughtTree,
  history: TreeHistory,
  command: TreeCommand,
  limits: TreeHistoryLimits,
  estimateBytes: EstimateInverseBytes = estimateSerializedInverseBytes,
): CommitTreeCommandResult {
  assertHistoryLimits(limits);
  const result = applyTreeCommand(tree, command);
  if (!result.ok) {
    return { ok: false, tree, history, error: result.error };
  }

  // The engine may construct an inverse from references in the command. The
  // history owns its memento, so later caller mutation cannot weaken undo.
  const inverse = cloneTreeCommand(result.inverse);
  const retainedInverseBytes = estimateBytes(inverse);
  if (!isNonNegativeSafeInteger(retainedInverseBytes)) {
    throw new RangeError("The inverse byte estimator must return a non-negative safe integer.");
  }

  if (retainedInverseBytes > limits.maxRetainedInverseBytes) {
    return {
      ok: false,
      tree,
      history,
      error: {
        code: "HISTORY_LIMIT_EXCEEDED",
        message: "The material change cannot retain an exact inverse within the history limit.",
      },
    };
  }

  // A new durable change creates a new timeline. Its exact inverse remains
  // available, but any alternate future that had been undone is no longer a
  // valid redo target. Each redo entry is summed here at most once before it is
  // discarded, so the retained total stays amortized constant-cost.
  const undoBytes = history.retainedInverseBytes - sumRetainedBytes(history.redoEntries);
  return {
    ok: true,
    tree: result.tree,
    history: releaseOldestUndo(
      [...history.entries, { commandId: command.id, source: command.source, inverse, retainedInverseBytes }],
      [],
      undoBytes + retainedInverseBytes,
      limits,
      true,
    ),
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Applies the latest inverse as a new commit. Only its optimistic revision is
 * rebased; every text and structural memento remains exact and is revalidated
 * by the tree engine, which is also what validates an entry restored from
 * storage at the moment it is first used.
 */
export function undoTreeHistory(
  tree: ThoughtTree,
  history: TreeHistory,
  limits: TreeHistoryLimits,
): UndoTreeHistoryResult {
  assertHistoryLimits(limits);
  const entry = history.entries.at(-1);
  if (entry === undefined) {
    return {
      ok: false,
      tree,
      history,
      error: { code: "EMPTY_HISTORY", message: "There is no material change to undo." },
    };
  }

  const result = applyTreeCommand(tree, {
    ...entry.inverse,
    expectedRevision: tree.revision,
  });
  if (!result.ok) {
    return { ok: false, tree, history: releaseUndoStack(history), error: unavailableEntry() };
  }

  const redoEntry = moveEntry(entry, result.inverse);
  return {
    ok: true,
    tree: result.tree,
    history: releaseOldestUndo(
      history.entries.slice(0, -1),
      [...history.redoEntries, redoEntry],
      history.retainedInverseBytes - entry.retainedInverseBytes + redoEntry.retainedInverseBytes,
      limits,
      false,
    ),
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Restores the most recently undone change. Redo is intentionally another
 * engine application, never a tree snapshot swap: the exact memento still has
 * to agree with the current material and revision. Product UI does not expose
 * this as a button; the platform keyboard convention is its only entry point.
 */
export function redoTreeHistory(
  tree: ThoughtTree,
  history: TreeHistory,
  limits: TreeHistoryLimits,
): RedoTreeHistoryResult {
  assertHistoryLimits(limits);
  const entry = history.redoEntries.at(-1);
  if (entry === undefined) {
    return {
      ok: false,
      tree,
      history,
      error: { code: "EMPTY_REDO", message: "There is no material change to redo." },
    };
  }

  const result = applyTreeCommand(tree, {
    ...entry.inverse,
    expectedRevision: tree.revision,
  });
  if (!result.ok) {
    return { ok: false, tree, history: releaseRedoStack(history), error: unavailableEntry() };
  }

  const undoEntry = moveEntry(entry, result.inverse);
  return {
    ok: true,
    tree: result.tree,
    history: releaseOldestUndo(
      [...history.entries, undoEntry],
      history.redoEntries.slice(0, -1),
      history.retainedInverseBytes - entry.retainedInverseBytes + undoEntry.retainedInverseBytes,
      limits,
      true,
    ),
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Brings a journal written under another policy within the limits: oldest
 * undo first, then the furthest redo. Returns the same object when it fits.
 */
export function boundTreeHistory(history: TreeHistory, limits: TreeHistoryLimits): TreeHistory {
  assertHistoryLimits(limits);
  if (fitsLimits(
    history.entries.length + history.redoEntries.length,
    history.retainedInverseBytes,
    limits,
  )) return history;
  const undoBounded = releaseOldestUndo(
    history.entries,
    history.redoEntries,
    history.retainedInverseBytes,
    limits,
    false,
  );
  const redo = undoBounded.redoEntries;
  let first = 0;
  let total = undoBounded.retainedInverseBytes;
  while (
    first < redo.length &&
    !fitsLimits(undoBounded.entries.length + redo.length - first, total, limits)
  ) {
    total -= redo[first]!.retainedInverseBytes;
    first += 1;
  }
  return {
    entries: undoBounded.entries,
    redoEntries: first === 0 ? redo : redo.slice(first),
    retainedInverseBytes: total,
  };
}

/**
 * Checks only the next Undo and the next Redo against the tree, without
 * publishing either. Deeper entries are validated by the engine when first
 * used. A top that no longer applies releases its stack exactly as a failed
 * Undo or Redo would, because nothing beneath it is reachable.
 */
export function verifyHistoryTops(
  tree: ThoughtTree,
  history: TreeHistory,
): Readonly<{ history: TreeHistory; released: boolean }> {
  let verified = history;
  let released = false;
  const undoTop = verified.entries.at(-1);
  if (undoTop !== undefined && !appliesTo(tree, undoTop)) {
    verified = releaseUndoStack(verified);
    released = true;
  }
  const redoTop = verified.redoEntries.at(-1);
  if (redoTop !== undefined && !appliesTo(tree, redoTop)) {
    verified = releaseRedoStack(verified);
    released = true;
  }
  return { history: verified, released };
}

function appliesTo(tree: ThoughtTree, entry: TreeHistoryEntry): boolean {
  return applyTreeCommand(tree, { ...entry.inverse, expectedRevision: tree.revision }).ok;
}

/**
 * Proves that both reversible stacks still agree with one current tree by
 * applying every inverse in stack order. Callers that migrate a journal use
 * this before publishing the migrated tree and history together; it never
 * repairs or drops a person's inverses.
 */
export function canReplayTreeHistory(tree: ThoughtTree, history: TreeHistory): boolean {
  return canReplayStack(tree, history.entries) && canReplayStack(tree, history.redoEntries);
}

function canReplayStack(tree: ThoughtTree, stack: readonly TreeHistoryEntry[]): boolean {
  let cursor = tree;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const applied = applyTreeCommand(cursor, {
      ...stack[index]!.inverse,
      expectedRevision: cursor.revision,
    });
    if (!applied.ok) return false;
    cursor = applied.tree;
  }
  return true;
}

/**
 * Releases whole oldest undo entries until both stacks fit. Redo entries are
 * never evicted here, and the newest undo entry survives when `keepNewest` is
 * set; an overage that remains once nothing else may go is tolerated until the
 * next commit clears redo.
 */
function releaseOldestUndo(
  undo: TreeHistoryEntry[],
  redo: TreeHistoryEntry[],
  totalBytes: number,
  limits: TreeHistoryLimits,
  keepNewest: boolean,
): TreeHistory {
  const releasable = keepNewest ? undo.length - 1 : undo.length;
  let first = 0;
  let total = totalBytes;
  while (
    first < releasable &&
    !fitsLimits(undo.length - first + redo.length, total, limits)
  ) {
    total -= undo[first]!.retainedInverseBytes;
    first += 1;
  }
  return {
    entries: first === 0 ? undo : undo.slice(first),
    redoEntries: redo,
    retainedInverseBytes: total,
  };
}

function releaseUndoStack(history: TreeHistory): TreeHistory {
  return {
    entries: [],
    redoEntries: history.redoEntries,
    retainedInverseBytes: history.retainedInverseBytes - sumRetainedBytes(history.entries),
  };
}

function releaseRedoStack(history: TreeHistory): TreeHistory {
  return {
    entries: history.entries,
    redoEntries: [],
    retainedInverseBytes: history.retainedInverseBytes - sumRetainedBytes(history.redoEntries),
  };
}

function unavailableEntry(): { code: "HISTORY_UNAVAILABLE"; message: string } {
  return {
    code: "HISTORY_UNAVAILABLE",
    message: "An earlier change no longer matches the material and can no longer be reversed.",
  };
}

/** One serialization per move: the byte count travels with the cloned memento. */
function moveEntry(entry: TreeHistoryEntry, inverse: TreeCommand): TreeHistoryEntry {
  const owned = cloneTreeCommand(inverse);
  return {
    commandId: entry.commandId,
    source: entry.source,
    inverse: owned,
    retainedInverseBytes: estimateSerializedInverseBytes(owned),
  };
}

function fitsLimits(count: number, bytes: number, limits: TreeHistoryLimits): boolean {
  return count <= limits.maxEntries && bytes <= limits.maxRetainedInverseBytes;
}

function sumRetainedBytes(entries: readonly TreeHistoryEntry[]): number {
  let total = 0;
  for (const entry of entries) total += entry.retainedInverseBytes;
  return total;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertHistoryLimits(limits: TreeHistoryLimits): void {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1) {
    throw new RangeError("History maxEntries must be a positive safe integer.");
  }
  if (!isNonNegativeSafeInteger(limits.maxRetainedInverseBytes)) {
    throw new RangeError(
      "History maxRetainedInverseBytes must be a non-negative safe integer.",
    );
  }
}

function cloneThoughtNode(node: ThoughtNode): ThoughtNode {
  return { ...node, children: [...node.children] };
}

function cloneDetachedSubtree(detached: DetachedSubtree): DetachedSubtree {
  return {
    ...detached,
    nodes: Object.fromEntries(
      Object.entries(detached.nodes).map(([id, node]) => [id, cloneThoughtNode(node)]),
    ),
    parentChildrenBeforeDetach: [...detached.parentChildrenBeforeDetach],
  };
}

function cloneTreeMutation(mutation: TreeMutation): TreeMutation {
  switch (mutation.type) {
    case "initialize-root":
      return { ...mutation, root: cloneThoughtNode(mutation.root) };
    case "clear-root":
      return { ...mutation, expectedRoot: cloneThoughtNode(mutation.expectedRoot) };
    case "insert-node":
      return {
        ...mutation,
        node: cloneThoughtNode(mutation.node),
        expectedParentChildren: [...mutation.expectedParentChildren],
      };
    case "remove-subtree":
    case "restore-subtree":
      return { ...mutation, detached: cloneDetachedSubtree(mutation.detached) };
    case "replace-text":
    case "replace-title":
      return { ...mutation };
    case "move-node":
      return {
        ...mutation,
        expectedNode: cloneThoughtNode(mutation.expectedNode),
        fromParentChildrenBefore: [...mutation.fromParentChildrenBefore],
        toParentChildrenBefore: [...mutation.toParentChildrenBefore],
      };
  }
}

function cloneTreeCommand(command: TreeCommand): TreeCommand {
  return { ...command, mutation: cloneTreeMutation(command.mutation) };
}
