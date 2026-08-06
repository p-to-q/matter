import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { moveNodeToParentCommand } from "../runtime/move";
import { commitTreeCommand, createTreeHistory, undoTreeHistory } from "./history";
import type { TreeCommand } from "./model";

const NOW = "2026-08-07T00:00:00.000Z";

describe("move-node", () => {
  it("moves a node across branches and its inverse restores it", () => {
    const tree = createRootedMaterialFixture().tree;
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
    const tree = createRootedMaterialFixture().tree;
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

  it("rejects root, same-parent, and descendant targets before constructing a command", () => {
    const tree = createRootedMaterialFixture().tree;
    const root = tree.nodes[tree.rootId!];
    const branch = tree.nodes[root.children[0]];
    const child = tree.nodes[branch.children[0]];
    const values = { commandId: "invalid-move", createdAt: NOW };
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: root.id, targetParentId: branch.id })).toBeNull();
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: child.id, targetParentId: branch.id })).toBeNull();
    expect(moveNodeToParentCommand(tree, { ...values, nodeId: branch.id, targetParentId: child.id })).toBeNull();
  });

  it("atomically rejects malformed and stale move mementos", () => {
    const tree = createRootedMaterialFixture().tree;
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
