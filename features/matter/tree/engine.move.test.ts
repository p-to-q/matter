import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import { createSeededDocument } from "../material/seeded-document";
import {
  canMoveNodeToParent,
  createNodeMovePolicy,
  moveNodeToParentCommand,
} from "../runtime/move";
import { commitTreeCommand, createTreeHistory, undoTreeHistory } from "./history";
import type { ThoughtNode, ThoughtTree, TreeCommand } from "./model";
import { MAX_CHILDREN_PER_NODE, MAX_TREE_DEPTH, validateThoughtTree } from "./invariants";

const NOW = "2026-08-07T00:00:00.000Z";

describe("move-node", () => {
  it("moves a node across branches and its inverse restores it", () => {
    const tree = createSeededDocument().tree;
    const root = tree.nodes[tree.rootId!];
    const source = tree.nodes[root.children[0]];
    const target = tree.nodes[root.children[1]];
    const child = tree.nodes[source.children[0]];
    const command = moveNodeToParentCommand(tree, {
      commandId: "move-test",
      nodeId: child.id,
      targetParentId: target.id,
      createdAt: NOW,
    });
    expect(command).not.toBeNull();
    const moved = applyTreeCommand(tree, command!);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.tree.nodes[child.id].parentId).toBe(target.id);
    const restored = applyTreeCommand(moved.tree, moved.inverse);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.tree.nodes).toEqual(tree.nodes);
      expect(restored.tree.rootId).toBe(tree.rootId);
    }
  });

  it("moves a nested node back under the root and restores it through history", () => {
    const tree = createSeededDocument().tree;
    const root = tree.nodes[tree.rootId!];
    const source = tree.nodes[root.children[0]];
    const child = tree.nodes[source.children[0]];
    const command = moveNodeToParentCommand(tree, {
      commandId: "move-to-root",
      nodeId: child.id,
      targetParentId: root.id,
      createdAt: NOW,
    });
    expect(command).not.toBeNull();
    const committed = commitTreeCommand(tree, createTreeHistory(), command!, {
      maxEntries: 8,
      maxRetainedInverseBytes: 100_000,
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(committed.tree.nodes[child.id].parentId).toBe(root.id);
    const undone = undoTreeHistory(committed.tree, committed.history);
    expect(undone.ok).toBe(true);
    if (undone.ok) expect(undone.tree.nodes).toEqual(tree.nodes);
  });

  it("reorders siblings and restores their exact authored order", () => {
    const tree = createSeededDocument().tree;
    const root = tree.nodes[tree.rootId!];
    const source = tree.nodes[root.children[0]];
    const command = moveNodeToParentCommand(tree, {
      commandId: "reorder-test",
      nodeId: source.id,
      targetParentId: root.id,
      targetIndex: root.children.length,
      createdAt: NOW,
    });
    expect(command).not.toBeNull();
    const moved = applyTreeCommand(tree, command!);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.tree.nodes[root.id].children).toEqual([...root.children.slice(1), source.id]);
    const restored = applyTreeCommand(moved.tree, moved.inverse);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.tree.nodes[root.id].children).toEqual(root.children);
  });

  it("rejects root, same-slot, and descendant targets before constructing a command", () => {
    const tree = createSeededDocument().tree;
    const root = tree.nodes[tree.rootId!];
    const branch = tree.nodes[root.children[0]];
    const child = tree.nodes[branch.children[0]];
    const values = { commandId: "invalid-move", createdAt: NOW };
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: root.id, targetParentId: branch.id })).toBeNull();
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: child.id, targetParentId: branch.id, targetIndex: 0 })).toBeNull();
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: branch.id, targetParentId: child.id })).toBeNull();
  });

  it("projects legal targets once and rejects a parent at its child bound", () => {
    const fixture = createSeededDocument().tree;
    const root = fixture.nodes[fixture.rootId!];
    const sourceParent = fixture.nodes[root.children[0]];
    const source = fixture.nodes[sourceParent.children[0]];
    const target = fixture.nodes[root.children[1]];
    const nodes = { ...fixture.nodes };
    const children = [...target.children];
    for (let index = children.length; index < MAX_CHILDREN_PER_NODE; index += 1) {
      const id = `move_bound_child_${index}`;
      children.push(id);
      nodes[id] = leaf(id, target.id);
    }
    nodes[target.id] = { ...target, children };
    const tree: ThoughtTree = { ...fixture, nodes };
    expect(validateThoughtTree(tree)).toEqual({ ok: true });
    const policy = createNodeMovePolicy(tree, source.id);
    expect(policy?.validTargetIds.has(root.id)).toBe(true);
    expect(policy?.validTargetIds.has(target.id)).toBe(false);
    expect(canMoveNodeToParent(tree, source.id, target.id)).toBe(false);
  });

  it("rejects a move whose complete subtree would exceed the depth bound", () => {
    const fixture = createSeededDocument().tree;
    const root = fixture.nodes[fixture.rootId!];
    const source = fixture.nodes[root.children[0]];
    const branch = fixture.nodes[root.children[1]];
    let target = fixture.nodes[branch.children[1]];
    const nodes = { ...fixture.nodes };
    for (let depth = 4; depth <= MAX_TREE_DEPTH; depth += 1) {
      const child = leaf(`move_depth_${depth}`, target.id);
      nodes[target.id] = { ...target, children: [child.id] };
      nodes[child.id] = child;
      target = child;
    }
    const tree: ThoughtTree = { ...fixture, nodes };
    expect(validateThoughtTree(tree)).toEqual({ ok: true });
    expect(createNodeMovePolicy(tree, source.id)?.validTargetIds.has(target.id)).toBe(false);
    expect(moveNodeToParentCommand(tree, {
      commandId: "move-too-deep",
      nodeId: source.id,
      targetParentId: target.id,
      createdAt: NOW,
    })).toBeNull();
  });

  it("atomically rejects malformed and stale move mementos", () => {
    const tree = createSeededDocument().tree;
    const root = tree.nodes[tree.rootId!];
    const source = tree.nodes[root.children[0]];
    const target = tree.nodes[root.children[1]];
    const child = tree.nodes[source.children[0]];
    const command = moveNodeToParentCommand(tree, {
      commandId: "malformed-move",
      nodeId: child.id,
      targetParentId: target.id,
      createdAt: NOW,
    })!;
    const malformed = {
      ...command,
      mutation: { ...command.mutation, expectedNode: undefined },
    } as unknown as TreeCommand;
    expect(() => applyTreeCommand(tree, malformed)).not.toThrow();
    expect(applyTreeCommand(tree, malformed)).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    const stale = {
      ...command,
      mutation: { ...command.mutation, fromParentChildrenBefore: [] },
    } as TreeCommand;
    const result = applyTreeCommand(tree, stale);
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    expect(tree.nodes[child.id].parentId).toBe(source.id);
  });
});

function leaf(id: string, parentId: string): ThoughtNode {
  return {
    id,
    text: id,
    parentId,
    children: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}
