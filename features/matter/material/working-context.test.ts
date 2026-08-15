import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import {
  createHeldAsideNodeIds,
  isNodeHeldAside,
  projectActiveWorkingContext,
  projectWorkingContext,
  reconcileHeldAsideNodeIds,
  restoreHeldAsideLineage,
  toggleHeldAsideBranch,
} from "./working-context";

const TIME = "2026-08-15T00:00:00.000Z";

function node(id: string, parentId: string | null, children: string[] = []): ThoughtNode {
  return { id, text: id, parentId, children, createdAt: TIME, updatedAt: TIME };
}

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "working_context",
    rootId: "document",
    revision: 4,
    nodes: {
      document: { ...node("document", null, ["a", "b"]), role: "document-root" },
      a: node("a", "document", ["a1", "a2"]),
      a1: node("a1", "a"),
      a2: node("a2", "a"),
      b: node("b", "document", ["b1"]),
      b1: node("b1", "b"),
    },
  };
}

describe("working context", () => {
  it("starts with no held-aside material", () => {
    expect(createHeldAsideNodeIds()).toEqual(new Set());
  });

  it("holds one branch aside and restores that same branch", () => {
    const material = tree();
    const held = toggleHeldAsideBranch(material, new Set(), "a");

    expect(held).toEqual(new Set(["a"]));
    expect(projectActiveWorkingContext(material, held).map(({ nodeId }) => nodeId))
      .toEqual(["b", "b1"]);

    expect(toggleHeldAsideBranch(material, held, "a")).toEqual(new Set());
  });

  it("keeps roots as an antichain and gives a held descendant no independent toggle", () => {
    const material = tree();
    const ancestorHeld = toggleHeldAsideBranch(material, new Set(["a1"]), "a");

    expect(ancestorHeld).toEqual(new Set(["a"]));
    expect(toggleHeldAsideBranch(material, ancestorHeld, "a1")).toBe(ancestorHeld);
  });

  it("recognizes an inherited held-aside state for every descendant", () => {
    const material = tree();
    const held = new Set(["a"]);

    expect(isNodeHeldAside(material, held, "a")).toBe(true);
    expect(isNodeHeldAside(material, held, "a2")).toBe(true);
    expect(isNodeHeldAside(material, held, "b")).toBe(false);
  });

  it("derives active and held ids in one projection for all render consumers", () => {
    const projection = projectWorkingContext(tree(), new Set(["a"]));

    expect(projection.heldAsideNodeIds).toEqual(new Set(["a", "a1", "a2"]));
    expect(projection.activeNodeIds).toEqual(new Set(["b", "b1"]));
  });

  it("focus restoration returns only the target lineage to the working context", () => {
    const material = tree();
    const restored = restoreHeldAsideLineage(material, new Set(["a", "b"]), "a2");

    expect(restored).toEqual(new Set(["b"]));
    expect(projectActiveWorkingContext(material, restored).map(({ nodeId }) => nodeId))
      .toEqual(["a", "a1", "a2"]);
  });

  it("reconciles deleted, detached, synthetic, and redundant roots without mutating the input", () => {
    const material = tree();
    material.nodes.a.children = ["a1"];
    delete material.nodes.a2;
    material.nodes.document.children = ["a"];
    const held = new Set(["document", "a", "a1", "a2", "b", "missing"]);

    expect(reconcileHeldAsideNodeIds(material, held)).toEqual(new Set(["a"]));
    expect(held).toEqual(new Set(["document", "a", "a1", "a2", "b", "missing"]));
  });

  it("does not restore a deleted held branch when Undo brings its id back", () => {
    const material = tree();
    const held = toggleHeldAsideBranch(material, new Set(), "a");
    const afterDeletion: ThoughtTree = {
      ...material,
      nodes: {
        ...material.nodes,
        document: { ...material.nodes.document!, children: ["b"] },
        b: { ...material.nodes.b! },
      },
    };
    delete afterDeletion.nodes.a;
    delete afterDeletion.nodes.a1;
    delete afterDeletion.nodes.a2;

    // The local owner commits this normalized result after each tree change.
    // Otherwise the old root id would become meaningful again on Undo.
    const reconciledAfterDeletion = reconcileHeldAsideNodeIds(afterDeletion, held);
    expect(reconciledAfterDeletion).toEqual(new Set());
    expect(reconcileHeldAsideNodeIds(material, reconciledAfterDeletion)).toEqual(new Set());
  });

  it("preserves original depth when a sibling branch is held aside", () => {
    const material = tree();
    const projection = projectActiveWorkingContext(material, new Set(["a"]));

    expect(projection).toEqual([
      { nodeId: "b", depth: 0 },
      { nodeId: "b1", depth: 1 },
    ]);
  });

  it("allows every material root to be held aside but never the synthetic document root", () => {
    const material = tree();
    const afterDocument = toggleHeldAsideBranch(material, new Set(), "document");
    const held = toggleHeldAsideBranch(material, afterDocument, "a");
    const allHeld = toggleHeldAsideBranch(material, held, "b");

    expect(afterDocument).toEqual(new Set());
    expect(projectActiveWorkingContext(material, allHeld)).toEqual([]);
  });

  it("fails closed for missing lineage targets", () => {
    const material = tree();
    const held = new Set(["a"]);

    expect(toggleHeldAsideBranch(material, held, "missing")).toBe(held);
    expect(isNodeHeldAside(material, held, "missing")).toBe(false);
    expect(restoreHeldAsideLineage(material, held, "missing")).toBe(held);
  });
});
