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
  /** Commands that can be applied backwards from the current material. */
  entries: TreeHistoryEntry[];
  /** Commands that can restore a previously undone material change. */
  redoEntries?: TreeHistoryEntry[];
  /** Exact inverse bytes retained across both reversible stacks. */
  retainedInverseBytes: number;
};

export type TreeHistoryLimits = {
  maxEntries: number;
  maxRetainedInverseBytes: number;
};

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
        | { code: CommandErrorCode; message: string };
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
        | { code: CommandErrorCode; message: string };
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
  if (!Number.isSafeInteger(retainedInverseBytes) || retainedInverseBytes < 0) {
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
  // valid redo target.
  const entries = [
    ...history.entries,
    {
      commandId: command.id,
      source: command.source,
      inverse,
      retainedInverseBytes,
    },
  ];
  let totalBytes = retainedBytes(history.entries) + retainedInverseBytes;

  while (
    entries.length > limits.maxEntries ||
    totalBytes > limits.maxRetainedInverseBytes
  ) {
    const removed = entries.shift();
    if (removed === undefined) {
      break;
    }
    totalBytes -= removed.retainedInverseBytes;
  }

  return {
    ok: true,
    tree: result.tree,
    history: { entries, redoEntries: [], retainedInverseBytes: totalBytes },
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Applies the latest inverse as a new commit. Only its optimistic revision is
 * rebased; every text and structural memento remains exact and is revalidated
 * by the tree engine. Failure preserves both input objects unchanged.
 */
export function undoTreeHistory(
  tree: ThoughtTree,
  history: TreeHistory,
): UndoTreeHistoryResult {
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
    return { ok: false, tree, history, error: result.error };
  }

  return {
    ok: true,
    tree: result.tree,
    history: {
      entries: history.entries.slice(0, -1),
      redoEntries: [
        ...(history.redoEntries ?? []),
        {
          commandId: entry.commandId,
          source: entry.source,
          inverse: cloneTreeCommand(result.inverse),
          retainedInverseBytes: estimateSerializedInverseBytes(result.inverse),
        },
      ],
      retainedInverseBytes:
        history.retainedInverseBytes - entry.retainedInverseBytes +
        estimateSerializedInverseBytes(result.inverse),
    },
    affectedNodeIds: result.affectedNodeIds,
  };
}

/**
 * Restores the most recently undone change. Redo is intentionally another
 * engine application, never a tree snapshot swap: the exact memento still has
 * to agree with the current material and revision.
 */
export function redoTreeHistory(
  tree: ThoughtTree,
  history: TreeHistory,
): RedoTreeHistoryResult {
  const redoEntries = history.redoEntries ?? [];
  const entry = redoEntries.at(-1);
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
  if (!result.ok) return { ok: false, tree, history, error: result.error };

  const inverse = cloneTreeCommand(result.inverse);
  const retainedInverseBytes = estimateSerializedInverseBytes(inverse);
  return {
    ok: true,
    tree: result.tree,
    history: {
      entries: [
        ...history.entries,
        { commandId: entry.commandId, source: entry.source, inverse, retainedInverseBytes },
      ],
      redoEntries: redoEntries.slice(0, -1),
      retainedInverseBytes:
        history.retainedInverseBytes - entry.retainedInverseBytes + retainedInverseBytes,
    },
    affectedNodeIds: result.affectedNodeIds,
  };
}

function retainedBytes(entries: readonly TreeHistoryEntry[]): number {
  return entries.reduce((total, entry) => total + entry.retainedInverseBytes, 0);
}

function assertHistoryLimits(limits: TreeHistoryLimits): void {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1) {
    throw new RangeError("History maxEntries must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(limits.maxRetainedInverseBytes) ||
    limits.maxRetainedInverseBytes < 0
  ) {
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
