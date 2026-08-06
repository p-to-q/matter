import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { NavigationState } from "../runtime/navigation";
import {
  inquiryContextWeight,
  projectInquiryContext,
} from "./inquiry-context";

describe("inquiry context", () => {
  it("carries the root-to-focus lineage and nothing beside it", () => {
    const context = projectInquiryContext(tree, selected("grandchild"));

    expect(context.lineage.map((node) => node.nodeId)).toEqual(["root", "child-a", "grandchild"]);
    expect(context.lineage.map((node) => node.depth)).toEqual([0, 1, 2]);
    // "child-b" is on screen but not on the lineage, so it is not context.
    expect(context.lineage.some((node) => node.nodeId === "child-b")).toBe(false);
    expect(context).toMatchObject({ treeId: "tree_inquiry", revision: 4, thoughtCount: 4 });
  });

  it("follows focus as readily as selection", () => {
    const focused: NavigationState = {
      mode: "focus",
      focusNodeId: "child-b",
      selectedNodeId: "grandchild",
      foldedNodeIds: new Set(),
    };
    expect(projectInquiryContext(tree, focused).lineage.map((node) => node.nodeId))
      .toEqual(["root", "child-b"]);
  });

  it("falls back to the root when nothing is selected", () => {
    expect(projectInquiryContext(tree, selected(null)).lineage.map((node) => node.nodeId))
      .toEqual(["root"]);
  });

  it("returns nothing for an empty document rather than inventing a root", () => {
    const empty: ThoughtTree = { ...tree, rootId: null, nodes: {} };
    const context = projectInquiryContext(empty, selected(null));

    expect(context.lineage).toEqual([]);
    expect(context.thoughtCount).toBe(0);
    expect(inquiryContextWeight(context)).toBe(0);
  });

  it("ignores a selection that is no longer in the document", () => {
    expect(projectInquiryContext(tree, selected("removed")).lineage.map((node) => node.nodeId))
      .toEqual(["root"]);
  });

  it("truncates one long passage and says that it did", () => {
    const long = { ...tree, nodes: { ...tree.nodes, root: { ...tree.nodes.root, text: "字".repeat(600) } } };
    const [rootNode] = projectInquiryContext(long, selected("root"), { maxNodeCodePoints: 100 }).lineage;

    expect(Array.from(rootNode!.text)).toHaveLength(100);
    expect(rootNode!.truncated).toBe(true);
  });

  // The root states the document and the focus states the subject; when the
  // budget bites, the middle is what can be spared.
  it("drops middle ancestors before either end, and marks the context clipped", () => {
    const deep = buildChain(8);
    const context = projectInquiryContext(deep, selected("n7"), {
      maxNodeCodePoints: 10,
      maxContextCodePoints: 30,
    });

    expect(context.clipped).toBe(true);
    expect(context.lineage[0]?.nodeId).toBe("n0");
    expect(context.lineage.at(-1)?.nodeId).toBe("n7");
    expect(inquiryContextWeight(context)).toBeLessThanOrEqual(30);
  });

  it("never clips below the two ends, even on an impossible budget", () => {
    const deep = buildChain(6);
    const context = projectInquiryContext(deep, selected("n5"), { maxContextCodePoints: 1 });

    expect(context.lineage.map((node) => node.nodeId)).toEqual(["n0", "n5"]);
    expect(context.clipped).toBe(true);
  });

  it("does not clip a context that fits", () => {
    const context = projectInquiryContext(tree, selected("grandchild"));
    expect(context.clipped).toBe(false);
    expect(inquiryContextWeight(context)).toBeGreaterThan(0);
  });
});

const tree: ThoughtTree = {
  protocolVersion: PROTOCOL_VERSION,
  id: "tree_inquiry",
  rootId: "root",
  revision: 4,
  nodes: {
    root: node("root", null, ["child-a", "child-b"], "我们怀念的也许不是过去。"),
    "child-a": node("child-a", "root", ["grandchild"], "被允许想象的其他生活。"),
    grandchild: node("grandchild", "child-a", [], "不必立刻证明效率的时间。"),
    "child-b": node("child-b", "root", [], "过去为什么在今天显得遥远。"),
  },
};

function buildChain(length: number): ThoughtTree {
  const nodes: ThoughtTree["nodes"] = {};
  for (let index = 0; index < length; index += 1) {
    nodes[`n${index}`] = node(
      `n${index}`,
      index === 0 ? null : `n${index - 1}`,
      index + 1 < length ? [`n${index + 1}`] : [],
      "字".repeat(10),
    );
  }
  return { ...tree, id: "tree_chain", rootId: "n0", nodes };
}

function node(id: string, parentId: string | null, children: string[], text: string) {
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
