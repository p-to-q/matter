import { describe, expect, it } from "vitest";
import { createTreeHistory } from "../tree/history";
import { createEmptyTree } from "../tree/invariants";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { createNavigationState, selectNode } from "./navigation";
import { selectedNodeToRemovalCommand } from "./removal";
import { commitHumanRemoval, undoSession, type RuntimeState } from "./session";

const T0 = "2026-08-03T00:00:00.000Z";
const LIMITS = { maxEntries: 8, maxRetainedInverseBytes: 20_000 };

function node(id: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: T0, updatedAt: T0 };
}

function rootedState(): RuntimeState {
  const tree: ThoughtTree = {
    ...createEmptyTree("tree_1"),
    rootId: "root",
    revision: 1,
    nodes: {
      root: node("root", null, ["parent", "other"]),
      parent: node("parent", "root", ["child"]),
      child: node("child", "parent"),
      other: node("other", "root"),
    },
  };
  return { tree, history: createTreeHistory(), navigation: createNavigationState(), lastError: null };
}

function values() {
  return { commandId: "remove_parent", createdAt: T0 };
}

describe("human thought removal", () => {
  it("removes a selected subtree through one command and undoes exactly", () => {
    const state = rootedState();
    const selected = selectNode(state.tree, state.navigation, "parent");
    if (!selected.ok) throw new Error(selected.error.code);
    const removed = commitHumanRemoval({ ...state, navigation: selected.navigation }, values(), LIMITS);
    expect(removed).toMatchObject({ ok: true, receipt: { affectedNodeIds: ["parent", "child", "root"] } });
    if (!removed.ok) throw new Error(removed.receipt.errorCode);
    expect(removed.state.tree.nodes).not.toHaveProperty("parent");
    expect(removed.state.tree.nodes.root.children).toEqual(["other"]);
    expect(removed.state.navigation.selectedNodeId).toBe("root");

    const undone = undoSession(removed.state);
    expect(undone.ok).toBe(true);
    if (!undone.ok) throw new Error(undone.receipt.errorCode);
    expect(undone.state.tree.nodes.parent.children).toEqual(["child"]);
    expect(undone.state.tree.nodes.root.children).toEqual(["parent", "other"]);
  });

  it("rejects root, missing, and focus-view removals before a tree command exists", () => {
    const state = rootedState();
    const root = selectNode(state.tree, state.navigation, "root");
    if (!root.ok) throw new Error(root.error.code);
    expect(selectedNodeToRemovalCommand(state.tree, root.navigation, values())).toMatchObject({ ok: false });
    expect(selectedNodeToRemovalCommand(state.tree, state.navigation, values())).toMatchObject({ ok: false });
    expect(selectedNodeToRemovalCommand(state.tree, { ...root.navigation, mode: "focus", focusNodeId: "root" }, values())).toMatchObject({ ok: false });
  });
});
