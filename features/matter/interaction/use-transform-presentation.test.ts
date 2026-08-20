import { describe, expect, it } from "vitest";
import type { TransformCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { isTransformPresentationCurrent } from "./use-transform-presentation";

const change: TransformCommittedChange = {
  id: "turn_1_action",
  treeId: "tree_1",
  documentEpoch: 2,
  nodeId: "node_1",
  committedRevision: 4,
  motionHint: "grow",
  before: { text: "short", updatedAt: "2026-08-20T00:00:00.000Z" },
  after: { text: "short but open", updatedAt: "2026-08-20T00:00:01.000Z" },
};

const tree: ThoughtTree = {
  protocolVersion: "0.2",
  id: "tree_1",
  rootId: "node_1",
  revision: 4,
  nodes: {
    node_1: {
      id: "node_1",
      parentId: null,
      children: [],
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:01.000Z",
      text: "short but open",
    },
  },
};

describe("transform presentation authority", () => {
  it("accepts only the exact committed canonical node", () => {
    const scope = { treeId: "tree_1", documentEpoch: 2 };
    expect(isTransformPresentationCurrent(change, scope, tree)).toBe(true);
    expect(isTransformPresentationCurrent(change, scope, { ...tree, revision: 6 })).toBe(false);
    expect(isTransformPresentationCurrent(change, { ...scope, documentEpoch: 3 }, tree)).toBe(false);
    expect(isTransformPresentationCurrent(change, scope, {
      ...tree,
      revision: 5,
      nodes: { node_1: { ...tree.nodes.node_1!, text: "undone" } },
    })).toBe(false);
  });
});
