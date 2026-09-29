import { describe, expect, it } from "vitest";
import {
  canReplayTreeHistory,
  commitDeliveredTreeCommand,
  commitTreeCommand,
  createTreeHistory,
  estimateSerializedInverseBytes,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
  type TreeHistoryLimits,
} from "./history";
import { applyTreeCommand } from "./engine";
import { createEmptyTree } from "./invariants";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "./model";

const T0 = "2026-09-29T00:00:00.000Z";
const T1 = "2026-09-29T00:01:00.000Z";
const T2 = "2026-09-29T00:02:00.000Z";
const LIMITS: TreeHistoryLimits = { maxEntries: 16, maxRetainedInverseBytes: 100_000 };

type Session = { tree: ThoughtTree; history: TreeHistory };

describe("delivered commits and the redo future", () => {
  it("keeps an Undo made after submission redoable when the late turn lands", () => {
    // Elastic on X is submitted, then the person undoes sibling Y's admission.
    const submitted = admitSibling(rootWithX());
    const undone = undo(submitted);
    expect(undone.tree.nodes.y).toBeUndefined();
    expect(undone.history.redoEntries).toHaveLength(1);

    const landed = deliver(undone, replaceX("A", T0, "A grown", T1));
    expect(landed.tree.nodes.x?.text).toBe("A grown");
    expect(landed.history.entries.map((entry) => entry.source)).toEqual(["human", "human", "agent"]);
    expect(landed.history.redoEntries).toHaveLength(1);
    expect(landed.history.retainedInverseBytes).toBe(exactBytes(landed.history));
    expect(canReplayTreeHistory(landed.tree, landed.history)).toBe(true);

    const redone = redo(landed);
    expect(redone.tree.nodes.y?.text).toBe("Y");
    expect(redone.tree.nodes.x?.text).toBe("A grown");
    expect(redone.history.redoEntries).toEqual([]);

    // Undo walks back through the redone sibling, the landed turn, and the
    // original admission in exact reverse order; Redo returns the same way.
    const withoutY = undo(redone);
    expect(withoutY.tree.nodes.y).toBeUndefined();
    const withoutTurn = undo(withoutY);
    expect(withoutTurn.tree.nodes.x?.text).toBe("A");
    const again = redo(redo(withoutTurn));
    expect(again.tree.nodes.x?.text).toBe("A grown");
    expect(again.tree.nodes.y?.text).toBe("Y");
    expect(canReplayTreeHistory(again.tree, again.history)).toBe(true);
  });

  it("still ends the redo future for a human commit", () => {
    const undone = undo(admitSibling(rootWithX()));
    const human = commitTreeCommand(undone.tree, undone.history, rebase(undone, {
      ...replaceX("A", T0, "A edited", T1),
      source: "human",
    }), LIMITS);
    if (!human.ok) throw new Error(human.error.code);
    expect(human.history.redoEntries).toEqual([]);
  });

  it("releases a conflicting redo entry and every later step instead of misapplying it", () => {
    // Redo stack, nearest first: X A→B, then admit Y. The late turn read X="A"
    // and changes it, so X A→B no longer replays; Y was built on it and goes too.
    const changed = commit(rootWithX(), replaceX("A", T0, "B", T1));
    const both = commit(changed, insertY(changed.tree.revision));
    const undone = undo(undo(both));
    expect(undone.history.redoEntries).toHaveLength(2);

    const landed = deliver(undone, replaceX("A", T0, "C", T2));
    expect(landed.tree.nodes.x?.text).toBe("C");
    expect(landed.history.redoEntries).toEqual([]);
    expect(landed.history.retainedInverseBytes).toBe(exactBytes(landed.history));
    expect(redoTreeHistory(landed.tree, landed.history)).toMatchObject({
      ok: false,
      error: { code: "EMPTY_REDO" },
    });
  });

  it("keeps the replayable nearest prefix and releases the rest", () => {
    // Redo stack, nearest first: admit Y, then X A→B.
    const withY = admitSibling(rootWithX());
    const changed = commit(withY, replaceX("A", T0, "B", T1));
    const undone = undo(undo(changed));
    expect(undone.history.redoEntries).toHaveLength(2);

    const landed = deliver(undone, replaceX("A", T0, "C", T2));
    expect(landed.history.redoEntries).toHaveLength(1);
    expect(canReplayTreeHistory(landed.tree, landed.history)).toBe(true);
    const redone = redo(landed);
    expect(redone.tree.nodes.y?.text).toBe("Y");
    expect(redone.tree.nodes.x?.text).toBe("C");
  });

  it("retains redo only inside the limits shared by both stacks", () => {
    const withY = admitSibling(rootWithX());
    const withZ = commit(withY, insertNode("z", "Z", withY.tree.revision, ["y"], 2));
    const undone = undo(undo(withZ));
    expect(undone.history.redoEntries).toHaveLength(2);

    const narrow = { ...LIMITS, maxEntries: 4 };
    const landed = deliver(undone, replaceX("A", T0, "A grown", T1), narrow);
    // Undo keeps its three steps; exactly one redo step fits beside them.
    expect(landed.history.entries).toHaveLength(3);
    expect(landed.history.redoEntries).toHaveLength(1);
    expect(redo(landed).tree.nodes.y?.text).toBe("Y");
  });

  it("releases an undone move of the delivered passage, whose memento holds its old text", () => {
    const withGroup = commit(rootWithX(), insertNode("g", "Group", -1, [], 1));
    const x = withGroup.tree.nodes.x!;
    const moved = commit(withGroup, humanCommand("move_x", -1, {
      type: "move-node",
      nodeId: "x",
      expectedNode: { ...x, children: [...x.children] },
      fromParentId: "root",
      fromIndex: 0,
      fromParentChildrenBefore: ["x", "g"],
      toParentId: "g",
      toIndex: 0,
      toParentChildrenBefore: [],
    }));
    const undone = undo(moved);
    expect(undone.tree.nodes.x?.parentId).toBe("root");

    const landed = deliver(undone, replaceX("A", T0, "A grown", T1));
    expect(landed.history.redoEntries).toEqual([]);
  });

  it("keeps an undone title change, which never reads passage content", () => {
    const titled = commit(rootWithX(), humanCommand("title", -1, {
      type: "replace-title",
      expectedTitle: "Delivery",
      title: "Renamed",
    }));
    const undone = undo(titled);
    const landed = deliver(undone, replaceX("A", T0, "A grown", T1));
    expect(landed.history.redoEntries).toHaveLength(1);
    expect(redo(landed).tree.title).toBe("Renamed");
  });

  it("ends the redo future for a delivered mutation other than one text replacement", () => {
    const undone = undo(admitSibling(rootWithX()));
    const landed = deliver(undone, {
      ...insertNode("z", "Z", -1, [], 1),
      source: "agent",
    });
    expect(landed.history.redoEntries).toEqual([]);
  });

  it("changes neither input when the delivered command is rejected", () => {
    const undone = undo(admitSibling(rootWithX()));
    const result = commitDeliveredTreeCommand(
      undone.tree,
      undone.history,
      rebase(undone, replaceX("stale", T0, "C", T1)),
      LIMITS,
    );
    expect(result.ok).toBe(false);
    expect(result.tree).toBe(undone.tree);
    expect(result.history).toBe(undone.history);
  });
});

function rootWithX(): Session {
  const initialized = commitTreeCommand(
    { ...createEmptyTree("tree_delivery"), title: "Delivery" },
    createTreeHistory(),
    humanCommand("init", 0, { type: "initialize-root", root: node("root", "Root", null) }),
    LIMITS,
  );
  if (!initialized.ok) throw new Error(initialized.error.code);
  return commit(initialized, humanCommand("insert_x", initialized.tree.revision, {
    type: "insert-node",
    node: node("x", "A", "root"),
    parentId: "root",
    index: 0,
    expectedParentChildren: [],
  }));
}

function admitSibling(session: Session): Session {
  return commit(session, insertY(session.tree.revision));
}

function insertY(revision: number): TreeCommand {
  return insertNode("y", "Y", revision, [], 1);
}

function insertNode(
  id: string,
  text: string,
  revision: number,
  siblingsAfterX: string[],
  index: number,
): TreeCommand {
  return humanCommand(`insert_${id}`, revision, {
    type: "insert-node",
    node: node(id, text, "root"),
    parentId: "root",
    index,
    expectedParentChildren: ["x", ...siblingsAfterX],
  });
}

function replaceX(
  expectedText: string,
  expectedUpdatedAt: string,
  text: string,
  updatedAt: string,
): TreeCommand {
  return {
    id: `turn_${text.replaceAll(" ", "_")}`,
    source: "agent",
    expectedTreeId: "tree_delivery",
    // Delivery rebases onto the current revision; the memento is exact.
    expectedRevision: -1,
    mutation: {
      type: "replace-text",
      nodeId: "x",
      expectedText,
      expectedUpdatedAt,
      text,
      updatedAt,
    },
    createdAt: updatedAt,
  };
}

function commit(session: Session, next: TreeCommand): Session {
  const result = commitTreeCommand(session.tree, session.history, rebase(session, next), LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return { tree: result.tree, history: result.history };
}

function deliver(session: Session, next: TreeCommand, limits = LIMITS): Session {
  const result = commitDeliveredTreeCommand(
    session.tree,
    session.history,
    rebase(session, next),
    limits,
  );
  if (!result.ok) throw new Error(result.error.code);
  if (limits === LIMITS && next.mutation.type === "replace-text") {
    // The memento rule must agree with full engine replay in every story.
    expect(result.history.redoEntries)
      .toEqual(replayablePrefix(result.tree, session.history.redoEntries ?? []));
  }
  return { tree: result.tree, history: result.history };
}

/** Oracle: the nearest-first redo prefix that full engine replay accepts. */
function replayablePrefix(
  tree: ThoughtTree,
  redoEntries: TreeHistory["redoEntries"] & object,
): TreeHistory["redoEntries"] & object {
  let cursor = tree;
  let first = redoEntries.length;
  for (let index = redoEntries.length - 1; index >= 0; index -= 1) {
    const applied = applyTreeCommand(cursor, {
      ...redoEntries[index]!.inverse,
      expectedRevision: cursor.revision,
    });
    if (!applied.ok) break;
    cursor = applied.tree;
    first = index;
  }
  return redoEntries.slice(first);
}

function undo(session: Session): Session {
  const result = undoTreeHistory(session.tree, session.history);
  if (!result.ok) throw new Error(result.error.code);
  return { tree: result.tree, history: result.history };
}

function redo(session: Session): Session {
  const result = redoTreeHistory(session.tree, session.history);
  if (!result.ok) throw new Error(result.error.code);
  return { tree: result.tree, history: result.history };
}

function rebase(session: Session, next: TreeCommand): TreeCommand {
  return next.expectedRevision === -1
    ? { ...next, expectedRevision: session.tree.revision }
    : next;
}

function exactBytes(history: TreeHistory): number {
  return [...history.entries, ...(history.redoEntries ?? [])]
    .reduce((total, entry) => total + estimateSerializedInverseBytes(entry.inverse), 0);
}

function humanCommand(id: string, revision: number, mutation: TreeCommand["mutation"]): TreeCommand {
  return {
    id,
    source: "human",
    expectedTreeId: "tree_delivery",
    expectedRevision: revision,
    mutation,
    createdAt: T0,
  };
}

function node(id: string, text: string, parentId: string | null): ThoughtNode {
  return { id, text, parentId, children: [], createdAt: T0, updatedAt: T0 };
}
