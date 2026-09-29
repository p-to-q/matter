import { applyTreeCommand } from "./engine";
import type { TreeHistory, TreeHistoryEntry } from "./history";
import type { ThoughtTree } from "./model";

/**
 * Test oracle, never a product path: product code validates a journal only at
 * its two tops and each deeper step at use. This replays every inverse of
 * both stacks through the engine, in stack order, to prove that a history
 * still agrees with one tree, and it is the whole-journal replay the
 * persistence benchmark measures against constant-cost recovery.
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
