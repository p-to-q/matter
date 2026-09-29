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
  /** The inverse's serialized UTF-8 size, measured once when it entered a stack. */
  retainedInverseBytes: number;
  /**
   * Restored from storage: the byte count was read, not measured. It is
   * compared with the memento when the step is first applied, so a damaged
   * record fails closed instead of escaping the byte bound.
   */
  bytesUnverified?: true;
};

export type TreeHistory = {
  /** Commands that can be applied backwards from the current material, oldest first. */
  entries: TreeHistoryEntry[];
  /** Commands reachable only through the platform Redo keyboard convention; the last is next. */
  redoEntries: TreeHistoryEntry[];
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

const UTF8 = new TextEncoder();

export function createTreeHistory(): TreeHistory {
  return { entries: [], redoEntries: [] };
}

/** The one measure of an inverse, used on entry, at the bound, and at use. */
export function estimateSerializedInverseBytes(inverse: TreeCommand): number {
  return UTF8.encode(JSON.stringify(inverse)).byteLength;
}

/** The exact inverse bytes a run of entries retains. */
export function retainedInverseBytes(entries: readonly TreeHistoryEntry[]): number {
  let total = 0;
  for (const entry of entries) total += entry.retainedInverseBytes;
  return total;
}

/**
 * The material commit boundary. A command is published only when its exact
 * inverse can enter history; capacity failure preserves both input objects.
 * A new human command creates a new timeline, so the undone future ends.
 */
export function commitTreeCommand(
  tree: ThoughtTree,
  history: TreeHistory,
  command: TreeCommand,
  limits: TreeHistoryLimits,
): CommitTreeCommandResult {
  const committed = commitWithInverse(tree, history, command, limits);
  if (!committed.ok) return committed;
  return {
    ok: true,
    tree: committed.tree,
    history: boundHistory([...history.entries, committed.entry], [], limits, { keepNewestUndo: true }),
    affectedNodeIds: committed.affectedNodeIds,
  };
}

/**
 * Commits the result of work submitted earlier: a model turn or an admission
 * repair. The undo stack is exactly what `commitTreeCommand` publishes, but
 * the redo future is not ended. The delivery window, not the person, chose this
 * moment, and the person's latest history gesture may be an Undo made after
 * they submitted; clearing redo would let latency destroy it.
 *
 * Retained redo entries must still replay exactly, in stack order, against
 * the new tree. The first entry that does not is released together with
 * everything after it, so the redo stack stays one contiguous future that
 * recovery and Redo can trust. Only an exact text replacement is known to
 * commute with that future; any other delivered mutation ends it as a human
 * command does.
 */
export function commitDeliveredTreeCommand(
  tree: ThoughtTree,
  history: TreeHistory,
  command: TreeCommand,
  limits: TreeHistoryLimits,
): CommitTreeCommandResult {
  const committed = commitWithInverse(tree, history, command, limits);
  if (!committed.ok) return committed;
  const future = command.mutation.type === "replace-text"
    ? redoFutureIndependentOf(command.mutation.nodeId, history.redoEntries)
    : [];
  return {
    ok: true,
    tree: committed.tree,
    history: boundHistory([...history.entries, committed.entry], future, limits, { keepNewestUndo: true }),
    affectedNodeIds: committed.affectedNodeIds,
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

  const result = measuredAsStored(entry) ? applyTreeCommand(tree, {
    ...entry.inverse,
    expectedRevision: tree.revision,
  }) : null;
  if (result === null || !result.ok) {
    return { ok: false, tree, history: releaseUndoStack(history), error: unavailableEntry() };
  }

  return {
    ok: true,
    tree: result.tree,
    history: boundHistory(
      history.entries.slice(0, -1),
      [...history.redoEntries, moveEntry(entry, result.inverse)],
      limits,
      { keepNewestUndo: false },
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

  const result = measuredAsStored(entry) ? applyTreeCommand(tree, {
    ...entry.inverse,
    expectedRevision: tree.revision,
  }) : null;
  if (result === null || !result.ok) {
    return { ok: false, tree, history: releaseRedoStack(history), error: unavailableEntry() };
  }

  return {
    ok: true,
    tree: result.tree,
    history: boundHistory(
      [...history.entries, moveEntry(entry, result.inverse)],
      history.redoEntries.slice(0, -1),
      limits,
      { keepNewestUndo: true },
    ),
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Applies the retention policy to a journal that may have been written under
 * another one (a pre-v6 inline journal). Nothing is produced here, so no step
 * is protected. Returns the same object when it already fits: a history this
 * build kept always does.
 */
export function boundTreeHistory(history: TreeHistory, limits: TreeHistoryLimits): TreeHistory {
  assertHistoryLimits(limits);
  const bounded = boundHistory(history.entries, history.redoEntries, limits, { keepNewestUndo: false });
  return bounded.entries === history.entries && bounded.redoEntries === history.redoEntries
    ? history
    : bounded;
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

/**
 * The one retention policy (owner decision 2026-09-29). Both stacks together
 * keep at most `maxEntries` steps within `maxRetainedInverseBytes` of exact
 * inverses. Whole oldest undo steps are released first, then the farthest redo
 * steps: the kept redo prefix is the person's most recently undone intent,
 * fresher than the oldest undo steps. `keepNewestUndo` protects the step the
 * operation just produced (a commit, a delivery, a Redo); the byte bound
 * exceeds every legal inverse, so that step always fits. Every operation is
 * bounded here, so a history never exceeds the bound, and a reload that applies
 * the same policy releases nothing a current build kept.
 *
 * Totals are recomputed from the entries rather than carried between
 * operations, so no operation depends on how another accounted for its stacks.
 * The cost is linear in the entries, at most 1,000 plus the one being added,
 * which is the same order as the stack copy every operation makes anyway.
 */
function boundHistory(
  undo: TreeHistoryEntry[],
  redo: TreeHistoryEntry[],
  limits: TreeHistoryLimits,
  { keepNewestUndo }: Readonly<{ keepNewestUndo: boolean }>,
): TreeHistory {
  let count = undo.length + redo.length;
  let bytes = retainedInverseBytes(undo) + retainedInverseBytes(redo);
  const fits = () => count <= limits.maxEntries && bytes <= limits.maxRetainedInverseBytes;
  const releasableUndo = keepNewestUndo ? Math.max(0, undo.length - 1) : undo.length;
  let undoFirst = 0;
  while (undoFirst < releasableUndo && !fits()) {
    bytes -= undo[undoFirst]!.retainedInverseBytes;
    count -= 1;
    undoFirst += 1;
  }
  let redoFirst = 0;
  while (redoFirst < redo.length && !fits()) {
    bytes -= redo[redoFirst]!.retainedInverseBytes;
    count -= 1;
    redoFirst += 1;
  }
  return {
    entries: undoFirst === 0 ? undo : undo.slice(undoFirst),
    redoEntries: redoFirst === 0 ? redo : redo.slice(redoFirst),
  };
}

type CommittedWithInverse =
  | Readonly<{ ok: true; tree: ThoughtTree; entry: TreeHistoryEntry; affectedNodeIds: string[] }>
  | Extract<CommitTreeCommandResult, { ok: false }>;

/** Applies a command and measures the exact inverse it will retain. */
function commitWithInverse(
  tree: ThoughtTree,
  history: TreeHistory,
  command: TreeCommand,
  limits: TreeHistoryLimits,
): CommittedWithInverse {
  assertHistoryLimits(limits);
  const result = applyTreeCommand(tree, command);
  if (!result.ok) {
    return { ok: false, tree, history, error: result.error };
  }
  // The engine may construct an inverse from references in the command. The
  // history owns its memento, so later caller mutation cannot weaken undo.
  const inverse = cloneTreeCommand(result.inverse);
  const bytes = estimateSerializedInverseBytes(inverse);
  if (bytes > limits.maxRetainedInverseBytes) {
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
  return {
    ok: true,
    tree: result.tree,
    entry: { commandId: command.id, source: command.source, inverse, retainedInverseBytes: bytes },
    affectedNodeIds: result.affectedNodeIds,
  };
}

function appliesTo(tree: ThoughtTree, entry: TreeHistoryEntry): boolean {
  return measuredAsStored(entry) &&
    applyTreeCommand(tree, { ...entry.inverse, expectedRevision: tree.revision }).ok;
}

/** A restored step's claimed bytes must match its memento before it is used. */
function measuredAsStored(entry: TreeHistoryEntry): boolean {
  return entry.bytesUnverified !== true ||
    estimateSerializedInverseBytes(entry.inverse) === entry.retainedInverseBytes;
}

function releaseUndoStack(history: TreeHistory): TreeHistory {
  return { entries: [], redoEntries: history.redoEntries };
}

function releaseRedoStack(history: TreeHistory): TreeHistory {
  return { entries: history.entries, redoEntries: [] };
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

/**
 * Returns the longest nearest-first redo prefix that still replays after one
 * delivered replacement of `nodeId`'s text. Capacity is applied separately.
 *
 * The redo stack replayed before the delivery. The delivery changes only that
 * node's text and timestamp, and the engine reads node content solely through
 * the node mementos a mutation carries. Every step nearer than the first one
 * carrying a memento of that node therefore replays unchanged, while that
 * first carrier holds the replaced content and can never replay again. This
 * finds the exact replayable prefix without replaying the tree, which would
 * cost one full validation per retained step on every delivery.
 */
function redoFutureIndependentOf(
  nodeId: string,
  redoEntries: TreeHistoryEntry[],
): TreeHistoryEntry[] {
  let firstRetained = redoEntries.length;
  for (let index = redoEntries.length - 1; index >= 0; index -= 1) {
    const entry = redoEntries[index];
    if (entry === undefined || carriesNodeMemento(entry.inverse.mutation, nodeId)) break;
    firstRetained = index;
  }
  return firstRetained === 0 ? redoEntries : redoEntries.slice(firstRetained);
}

/** Whether the engine will compare this node's current content to a memento. */
function carriesNodeMemento(mutation: TreeMutation, nodeId: string): boolean {
  switch (mutation.type) {
    case "initialize-root":
      return mutation.root.id === nodeId;
    case "clear-root":
      return mutation.expectedRoot.id === nodeId;
    case "insert-node":
      return mutation.node.id === nodeId;
    case "remove-subtree":
    case "restore-subtree":
      return Object.hasOwn(mutation.detached.nodes, nodeId);
    case "replace-text":
    case "move-node":
      return mutation.nodeId === nodeId;
    case "replace-title":
      return false;
  }
}

function assertHistoryLimits(limits: TreeHistoryLimits): void {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1) {
    throw new RangeError("History maxEntries must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(limits.maxRetainedInverseBytes) || limits.maxRetainedInverseBytes < 0) {
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
