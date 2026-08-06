import { describe, expect, it } from "vitest";
import { applyTreeCommand } from "./engine";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { moveNodeToParentCommand } from "../runtime/move";

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
      createdAt: "2026-08-07T00:00:00.000Z",
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
});
