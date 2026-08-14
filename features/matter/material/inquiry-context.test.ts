import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import { inquiryContextWeight, projectInquiryContext } from "./inquiry-context";
import { projectActiveWorkingContext } from "./working-context";

describe("inquiry context", () => {
  it("uses the full virtual tree when no lasso selection exists", () => {
    const context = projectInquiryContext(TREE, working(TREE));
    expect(context.scope).toBe("tree");
    expect(context.lineage.map((node) => node.nodeId)).toEqual(["root", "child", "grandchild", "sibling"]);
    expect(context).toMatchObject({ treeId: "tree_inquiry", revision: 4, thoughtCount: 4 });
  });

  it("uses selected lasso text in authored order, including two ranges in one node", () => {
    const context = projectInquiryContext(TREE, working(TREE), [
      { type: "segment-range", nodeId: "grandchild", start: 0, end: 2, selectedText: "孙段" },
      { type: "segment-range", nodeId: "grandchild", start: 3, end: 5, selectedText: "后段" },
    ]);
    expect(context.scope).toBe("selection");
    expect(context.lineage.map((node) => node.text)).toEqual(["孙段", "后段"]);
  });

  it("does not invent material for an empty tree", () => {
    expect(projectInquiryContext(TREE, working(TREE)).lineage.map((node) => node.nodeId))
      .toEqual(["root", "child", "grandchild", "sibling"]);
    const empty = { ...TREE, rootId: null, nodes: {} };
    expect(projectInquiryContext(empty, working(empty)).lineage).toEqual([]);
  });

  it("clips a full-tree context to the shared budget", () => {
    const material = chain(8);
    const context = projectInquiryContext(material, working(material), {
      maxNodeCodePoints: 10,
      maxContextCodePoints: 30,
    });
    expect(context.clipped).toBe(true);
    expect(context.lineage[0]?.nodeId).toBe("n0");
    expect(inquiryContextWeight(context)).toBeLessThanOrEqual(30);
  });

  it("never falls back to the tree when a selected passage has been set aside", () => {
    const context = projectInquiryContext(TREE, working(TREE, new Set(["child"])), [
      { type: "segment-range", nodeId: "grandchild", start: 0, end: 2, selectedText: "孙段" },
    ]);

    expect(context).toMatchObject({ scope: "selection", lineage: [], thoughtCount: 2 });
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

function working(tree: ThoughtTree, heldAsideNodeIds?: ReadonlySet<string>) {
  return projectActiveWorkingContext(tree, heldAsideNodeIds);
}
