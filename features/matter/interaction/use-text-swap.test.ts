import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  createTextSwapBasis,
  createTextSwapEnvelope,
} from "./use-text-swap";

const TIME = "2026-08-20T00:00:00.000Z";
const TEXT = "Rain is near. Next";
const SELECTION = Object.freeze({
  type: "segment-range" as const,
  nodeId: "thought_1",
  start: 0,
  end: 12,
  selectedText: "Rain is near",
});

describe("Text Swap basis and envelope", () => {
  it("freezes one current punctuation segment with its untouched source", () => {
    const basis = createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });

    expect(basis).toEqual({
      treeId: "tree_1",
      baseRevision: 4,
      documentEpoch: 3,
      selection: SELECTION,
      sourceText: "Rain is near",
      locale: "en-US",
      lineage: [{
        id: "thought_1",
        text: TEXT,
        parentId: null,
        createdAt: TIME,
        updatedAt: TIME,
      }],
    });
    expect(Object.isFrozen(basis?.selection)).toBe(true);
  });

  it("accepts the exact whole node addressed by the passage-local AI control", () => {
    const wholeNode = Object.freeze({
      type: "segment-range" as const,
      nodeId: "thought_1",
      start: 0,
      end: TEXT.length,
      selectedText: TEXT,
    });
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: wholeNode,
      locale: "en-US",
    })?.selection).toEqual(wholeNode);
  });

  it("rejects an arbitrary partial range, stale text, and a missing selection", () => {
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: {
        ...SELECTION,
        end: TEXT.length - 1,
        selectedText: TEXT.slice(0, -1),
      },
      locale: "en-US",
    })).toBeNull();
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: { ...SELECTION, selectedText: "Other source" },
      locale: "en-US",
    })).toBeNull();
    expect(createTextSwapBasis({
      tree: tree(),
      documentEpoch: 3,
      selection: null,
      locale: "en-US",
    })).toBeNull();
  });

  it("builds the stable text-swap/2 shape without audio or carrier metadata", () => {
    const currentTree = tree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const envelope = createTextSwapEnvelope({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    });

    expect(envelope).toMatchObject({
      requestVersion: "text-swap/2",
      id: "text_swap_request_1",
      mode: "transform",
      operation: "paraphrase-in-place",
      treeRevision: 4,
      selection: SELECTION,
      direction: { text: "Use a more tentative rhythm" },
      context: { lineage: [{ id: "thought_1", parentId: null }] },
    });
    expect(envelope).not.toHaveProperty("audio");
    expect(envelope).not.toHaveProperty("carrier");
    expect(envelope).not.toHaveProperty("gesture");
    expect(envelope?.context.lineage.some((node) => node.id === "document")).toBe(false);
  });

  it("rebases an unrelated revision and refuses a changed epoch, lineage, selection, or direction", () => {
    const currentTree = tree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const common = {
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    };

    expect(createTextSwapEnvelope({ ...common, documentEpoch: 4 })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      tree: { ...currentTree, revision: 5 },
    })?.treeRevision).toBe(5);
    expect(createTextSwapEnvelope({
      ...common,
      tree: {
        ...currentTree,
        revision: 5,
        nodes: {
          ...currentTree.nodes,
          thought_1: { ...currentTree.nodes.thought_1!, text: "Rain was near. Next" },
        },
      },
    })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      selection: { ...SELECTION, selectedText: "Other source" },
    })).toBeNull();
    expect(createTextSwapEnvelope({
      ...common,
      direction: "line one\nline two",
    })).toBeNull();
  });

  it("does not reinterpret one direction after an ancestor edit or reparent", () => {
    const currentTree = nestedTree();
    const basis = createTextSwapBasis({
      tree: currentTree,
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
    });
    if (basis === null) throw new Error("basis missing");
    const common = {
      documentEpoch: 3,
      selection: SELECTION,
      basis,
      direction: "Use a more tentative rhythm",
      id: "text_swap_request_1",
    };
    const ancestorChanged: ThoughtTree = {
      ...currentTree,
      revision: 5,
      nodes: {
        ...currentTree.nodes,
        parent_1: {
          ...currentTree.nodes.parent_1!,
          text: "A different frame",
          updatedAt: "2026-08-20T00:00:01.000Z",
        },
      },
    };
    expect(createTextSwapEnvelope({ ...common, tree: ancestorChanged })).toBeNull();

    const reparented: ThoughtTree = {
      ...currentTree,
      revision: 5,
      nodes: {
        ...currentTree.nodes,
        document: { ...currentTree.nodes.document!, children: ["parent_1", "parent_2"] },
        parent_1: { ...currentTree.nodes.parent_1!, children: [] },
        parent_2: {
          id: "parent_2",
          text: "Another frame",
          parentId: "document",
          children: ["thought_1"],
          createdAt: TIME,
          updatedAt: TIME,
        },
        thought_1: { ...currentTree.nodes.thought_1!, parentId: "parent_2" },
      },
    };
    expect(createTextSwapEnvelope({ ...common, tree: reparented })).toBeNull();
  });
});

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_1",
    rootId: "document",
    title: "Text Swap",
    revision: 4,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["thought_1"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      thought_1: {
        id: "thought_1",
        text: TEXT,
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
  };
}

function nestedTree(): ThoughtTree {
  const current = tree();
  return {
    ...current,
    nodes: {
      ...current.nodes,
      document: { ...current.nodes.document!, children: ["parent_1"] },
      parent_1: {
        id: "parent_1",
        text: "The weather frame",
        parentId: "document",
        children: ["thought_1"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      thought_1: { ...current.nodes.thought_1!, parentId: "parent_1" },
    },
  };
}
