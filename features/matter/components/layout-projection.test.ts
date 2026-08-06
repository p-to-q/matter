import { describe, expect, it } from "vitest";
import type { ThoughtTree } from "../tree/model";
import {
  createNavigationState,
  focusNode,
  selectNode,
  toggleFold,
} from "../runtime/navigation";
import {
  createLayoutProjectionInput,
  layoutProjectionKey,
  projectLayoutProjection,
} from "./layout-projection";

const tree: ThoughtTree = {
  protocolVersion: "0.2",
  id: "layout_projection_fixture",
  revision: 3,
  rootId: "root",
  nodes: {
    root: {
      id: "root",
      text: "A rooted thought.",
      parentId: null,
      children: ["child"],
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
    },
    child: {
      id: "child",
      text: "Its child.",
      parentId: "root",
      children: [],
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
    },
  },
};

function keyFor(tree: ThoughtTree, navigation: ReturnType<typeof createNavigationState>) {
  const input = createLayoutProjectionInput(tree, navigation);
  return layoutProjectionKey(input, projectLayoutProjection(input));
}

describe("layout projection boundary", () => {
  it("does not let selected material or language state alter the geometry key", () => {
    const initial = createNavigationState();
    const selected = selectNode(tree, initial, "child");
    if (!selected.ok) throw new Error("expected fixture child to be selectable");

    // Lasso is deliberately not accepted by the geometry input at all.
    expect(keyFor(tree, selected.navigation)).toBe(keyFor(tree, initial));
    expect(Object.keys(createLayoutProjectionInput(tree, selected.navigation)).sort()).toEqual([
      "focusNodeId",
      "foldedNodeIds",
      "mode",
      "tree",
    ].sort());
  });

  it("changes when visible structure, focus, fold, or tree revision changes", () => {
    const initial = createNavigationState();
    const focused = focusNode(tree, initial, "child");
    const folded = toggleFold(tree, initial, tree.rootId ?? "");
    if (!focused.ok || !folded.ok) throw new Error("expected fixture navigation to succeed");

    const initialKey = keyFor(tree, initial);
    expect(keyFor(tree, focused.navigation)).not.toBe(initialKey);
    expect(keyFor(tree, folded.navigation)).not.toBe(initialKey);
    expect(keyFor({ ...tree, revision: tree.revision + 1 }, initial)).not.toBe(initialKey);
  });
});
