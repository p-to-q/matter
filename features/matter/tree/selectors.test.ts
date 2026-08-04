import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "./model";
import { selectLineage, selectVisiblePreorder } from "./selectors";

const CREATED_AT = "2026-08-03T00:00:00.000Z";

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
): ThoughtNode {
  return {
    id,
    text: id,
    parentId,
    children,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function tree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_1",
    rootId: "root",
    revision: 4,
    nodes: {
      root: node("root", null, ["a", "b"]),
      a: node("a", "root", ["a1", "a2"]),
      a1: node("a1", "a"),
      a2: node("a2", "a"),
      b: node("b", "root", ["b1"]),
      b1: node("b1", "b"),
    },
  };
}

describe("tree selectors", () => {
  it("projects authored preorder and omits descendants of folded nodes", () => {
    expect(
      selectVisiblePreorder(tree(), new Set(["a"])).map(({ id }) => id),
    ).toEqual(["root", "a", "b", "b1"]);
  });

  it("keeps a folded node itself visible", () => {
    expect(
      selectVisiblePreorder(tree(), new Set(["root"])).map(({ id }) => id),
    ).toEqual(["root"]);
  });

  it("returns no rows for an empty tree", () => {
    expect(
      selectVisiblePreorder(
        {
          protocolVersion: PROTOCOL_VERSION,
          id: "empty",
          rootId: null,
          nodes: {},
          revision: 0,
        },
        new Set(),
      ),
    ).toEqual([]);
  });

  it("returns the exact root-to-focus lineage independently of folds", () => {
    const material = tree();
    const folded = new Set(["root", "a"]);

    expect(selectVisiblePreorder(material, folded).map(({ id }) => id)).toEqual([
      "root",
    ]);
    expect(selectLineage(material, "a2")?.map(({ id }) => id)).toEqual([
      "root",
      "a",
      "a2",
    ]);
  });

  it("returns a stable null for a missing or detached focus", () => {
    expect(selectLineage(tree(), "missing")).toBeNull();

    const detached = tree();
    detached.nodes.a.parentId = "missing-parent";
    expect(selectLineage(detached, "a1")).toBeNull();
  });

  it("does not loop or return a partial path when parent links cycle", () => {
    const cyclic = tree();
    cyclic.nodes.a.parentId = "a1";
    cyclic.nodes.a1.children = ["a"];

    expect(selectLineage(cyclic, "a1")).toBeNull();
  });

  it("projects malformed child graphs without throwing or repeating nodes", () => {
    const malformed = tree();
    malformed.nodes.a.children = ["root", "missing", "a1", "a1"];

    expect(() => selectVisiblePreorder(malformed, new Set())).not.toThrow();
    expect(selectVisiblePreorder(malformed, new Set()).map(({ id }) => id)).toEqual([
      "root",
      "a",
      "a1",
      "b",
      "b1",
    ]);
  });
});
