import { describe, expect, it } from "vitest";
import type { ThoughtTree } from "../tree/model";
import { pointTalkFocusRestorationIsCurrent } from "./point-talk-focus-restoration";

const TREE: ThoughtTree = {
  protocolVersion: "0.2",
  id: "tree_1",
  rootId: "thought_1",
  revision: 2,
  nodes: {
    thought_1: {
      id: "thought_1",
      text: "Material",
      parentId: null,
      children: [],
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
  },
};

const BASIS = Object.freeze({
  documentEpoch: 4,
  nodeId: "thought_1",
  treeId: "tree_1",
});

describe("Point Talk focus restoration", () => {
  it("accepts only its current document instance and surviving target", () => {
    expect(pointTalkFocusRestorationIsCurrent(BASIS, TREE, 4)).toBe(true);
    expect(pointTalkFocusRestorationIsCurrent(BASIS, TREE, 5)).toBe(false);
    expect(pointTalkFocusRestorationIsCurrent(BASIS, { ...TREE, id: "tree_2" }, 4)).toBe(false);
    expect(pointTalkFocusRestorationIsCurrent(BASIS, { ...TREE, nodes: {} }, 4)).toBe(false);
  });
});
