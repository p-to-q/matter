import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { NavigationState } from "../runtime/navigation";
import { inquiryContextWeight, projectInquiryContext } from "./inquiry-context";

describe("inquiry context", () => {
  it("uses the full virtual tree when no lasso selection exists", () => {
    const context = projectInquiryContext(TREE, selected("grandchild"));
    expect(context.scope).toBe("tree");
    expect(context.lineage.map((node) => node.nodeId)).toEqual(["root", "child", "grandchild", "sibling"]);
    expect(context).toMatchObject({ treeId: "tree_inquiry", revision: 4, thoughtCount: 4 });
  });

  it("uses selected lasso text in authored order, including two ranges in one node", () => {
    const context = projectInquiryContext(TREE, selected(null), [
      { type: "segment-range", nodeId: "grandchild", start: 0, end: 2, selectedText: "孙段" },
      { type: "segment-range", nodeId: "grandchild", start: 3, end: 5, selectedText: "后段" },
    ]);
    expect(context.scope).toBe("selection");
    expect(context.lineage.map((node) => node.text)).toEqual(["孙段", "后段"]);
  });

  it("does not invent material for an empty tree", () => {
    const focus: NavigationState = {
      mode: "focus",
      focusNodeId: "sibling",
      selectedNodeId: "grandchild",
      foldedNodeIds: new Set(),
    };
    expect(projectInquiryContext(TREE, focus).lineage.map((node) => node.nodeId))
      .toEqual(["root", "child", "grandchild", "sibling"]);
    expect(projectInquiryContext(TREE, selected(null)).lineage.map((node) => node.nodeId))
      .toEqual(["root", "child", "grandchild", "sibling"]);
    const empty = { ...TREE, rootId: null, nodes: {} };
    expect(projectInquiryContext(empty, selected(null)).lineage).toEqual([]);
  });

  it("clips a full-tree context to the shared budget", () => {
    const context = projectInquiryContext(chain(8), selected("n7"), {
      maxNodeCodePoints: 10,
      maxContextCodePoints: 30,
    });
    expect(context.clipped).toBe(true);
    expect(context.lineage[0]?.nodeId).toBe("n0");
    expect(inquiryContextWeight(context)).toBeLessThanOrEqual(30);
  });
});

const TREE: ThoughtTree = {
  protocolVersion: PROTOCOL_VERSION,
  id: "tree_inquiry",
  rootId: "root",
  revision: 4,
  nodes: {
    root: node("root", null, ["child", "sibling"]),
    child: node("child", "root", ["grandchild"]),
    grandchild: node("grandchild", "child", []),
    sibling: node("sibling", "root", []),
  },
};

function chain(length: number): ThoughtTree {
  const nodes: ThoughtTree["nodes"] = {};
  for (let index = 0; index < length; index += 1) {
    nodes[`n${index}`] = node(
      `n${index}`,
      index === 0 ? null : `n${index - 1}`,
      index + 1 < length ? [`n${index + 1}`] : [],
      "字".repeat(10),
    );
  }
  return { ...TREE, id: "tree_chain", rootId: "n0", nodes };
}

function node(id: string, parentId: string | null, children: string[], text = id) {
  return {
    id,
    parentId,
    children,
    text,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function selected(nodeId: string | null): NavigationState {
  return { mode: "full", focusNodeId: null, selectedNodeId: nodeId, foldedNodeIds: new Set() };
}
