import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { StretchCommitBasis } from "../runtime/stretch-interaction";
import { createFixedExpandEnvelope } from "./use-fixed-expand-turn";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "source. next";
const SELECTION = Object.freeze({
  type: "segment-range" as const,
  nodeId: "thought",
  start: 0,
  end: 6,
  selectedText: "source",
});
const BASIS: StretchCommitBasis = Object.freeze({
  selection: SELECTION,
  treeId: "tree_fixed",
  baseRevision: 4,
  documentEpoch: 3,
  amount: .5,
});

describe("createFixedExpandEnvelope", () => {
  it("creates the exact transform/2 capability without voice or a client target", () => {
    const envelope = createFixedExpandEnvelope({
      tree: tree(),
      documentEpoch: 3,
      selection: SELECTION,
      locale: "en-US",
      basis: BASIS,
      id: "turn_fixed",
    });
    expect(envelope).toMatchObject({
      requestVersion: "transform/2",
      operation: "expand-in-place",
      gesture: { type: "stretch", axis: "vertical", amount: .5 },
      locale: "en-US",
      context: { lineage: [{ id: "thought", parentId: null }] },
    });
    expect(envelope?.context.lineage.some((node) => node.id === "document")).toBe(false);
    expect(envelope).not.toHaveProperty("voice");
    expect(envelope).not.toHaveProperty("target");
  });

  it("refuses a stale revision, document, or selected segment", () => {
    const common = { tree: tree(), selection: SELECTION, locale: "en-US" as const, basis: BASIS, id: "turn_fixed" };
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 4 })).toBeNull();
    expect(createFixedExpandEnvelope({ ...common, documentEpoch: 3, tree: { ...tree(), revision: 5 } })).toBeNull();
    expect(createFixedExpandEnvelope({
      ...common,
      documentEpoch: 3,
      selection: { ...SELECTION, selectedText: "other" },
    })).toBeNull();
  });
});

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_fixed",
    rootId: "document",
    title: "Fixed expand",
    revision: 4,
    nodes: {
      document: { id: "document", role: "document-root", text: "", parentId: null, children: ["thought"], createdAt: TIME, updatedAt: TIME },
      thought: { id: "thought", text: TEXT, parentId: "document", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
}
