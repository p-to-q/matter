import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import type { NavigationState } from "../runtime/navigation";
import {
  deriveMaterialFileLabel,
  deriveMaterialTitle,
  extractMaterialKeywords,
  projectMaterialFileRows,
  projectMaterialFiles,
  serializeMaterialSelection,
} from "./material-files";

const tree: ThoughtTree = {
  protocolVersion: PROTOCOL_VERSION,
  id: "tree_files",
  rootId: "root",
  revision: 4,
  nodes: {
    root: node("root", null, ["child-a", "child-b"], "We keep unfinished language, while structure keeps its lineage."),
    "child-a": node("child-a", "root", ["grandchild"], "我们怀念的也许不是过去，而是仍然允许想象的其他生活。"),
    grandchild: node("grandchild", "child-a", [], "A resilient clipboard boundary keeps exact material."),
    "child-b": node("child-b", "root", [], "# A named direction\n\nMore material follows."),
  },
};

describe("material file labels", () => {
  it("uses an explicit Markdown heading without exposing the extension", () => {
    expect(deriveMaterialTitle("# A named direction\n\nMore material follows.")).toBe("A named direction");
  });

  it("derives stable mixed-language keywords from long material", () => {
    const text = "Matter keeps reversible material close. 可逆的材料让思想继续生长。Matter keeps lineage visible.";
    expect(deriveMaterialTitle(text)).toBe(deriveMaterialTitle(text));
    expect(extractMaterialKeywords(text)).toContain("Matter");
    expect(deriveMaterialTitle(text).length).toBeGreaterThan(0);
  });

  it("removes URL and formatting noise and has a blank fallback", () => {
    expect(deriveMaterialTitle("   \n  ")).toBe("Untitled thought");
    expect(deriveMaterialTitle("**Useful material** https://example.com/private?q=1")).not.toContain("https");
  });
});

describe("material file projection", () => {
  it("keeps the unlabeled projection identical without reading offscreen text", () => {
    let textReads = 0;
    const lazyNode = {
      ...node("lazy", null, [], "unused"),
      get text() {
        textReads += 1;
        return "Only the mounted row needs this label.";
      },
    };
    const lazyTree: ThoughtTree = {
      protocolVersion: PROTOCOL_VERSION,
      id: "tree_lazy_files",
      rootId: lazyNode.id,
      revision: 0,
      nodes: { [lazyNode.id]: lazyNode },
    };

    const rows = projectMaterialFileRows(lazyTree, navigation());
    expect(rows.map(({ nodeId, authoredIndex, depth }) => ({ nodeId, authoredIndex, depth })))
      .toEqual([{ nodeId: "lazy", authoredIndex: 0, depth: 0 }]);
    expect(textReads).toBe(0);
    expect(deriveMaterialFileLabel(lazyNode).title.length).toBeGreaterThan(0);
    expect(textReads).toBeGreaterThan(0);
  });

  it("matches the complete labeled projection for full, folded, and focus views", () => {
    const focused: NavigationState = {
      mode: "focus",
      focusNodeId: "grandchild",
      selectedNodeId: "grandchild",
      foldedNodeIds: new Set(["root"]),
    };
    for (const state of [navigation(), navigation(new Set(["child-a"])), focused]) {
      const rows = projectMaterialFileRows(tree, state);
      const labeled = projectMaterialFiles(tree, state);
      expect(rows).toEqual(labeled.map((entry) => ({
        nodeId: entry.nodeId,
        parentId: entry.parentId,
        depth: entry.depth,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        authoredIndex: entry.authoredIndex,
        hasChildren: entry.hasChildren,
        folded: entry.folded,
        directMatch: entry.directMatch,
      })));
    }
  });

  it("reuses bounded structural projections across selection-only navigation", () => {
    const initial = projectMaterialFileRows(tree, navigation());
    const selected = projectMaterialFileRows(tree, {
      ...navigation(),
      selectedNodeId: "child-b",
    });
    const folded = projectMaterialFileRows(tree, navigation(new Set(["child-a"])));

    expect(selected).toBe(initial);
    expect(folded).not.toBe(initial);
    expect(projectMaterialFileRows(tree, navigation(new Set(["child-a"])))).toBe(folded);
  });

  it("uses authored preorder and shared fold state", () => {
    expect(projectMaterialFiles(tree, navigation(new Set(["child-a"]))).map((entry) => entry.nodeId)).toEqual([
      "root",
      "child-a",
      "child-b",
    ]);
  });

  it("reveals matching ancestry during filtering without changing folds", () => {
    const folded = new Set(["root", "child-a"]);
    const result = projectMaterialFiles(tree, navigation(folded), "clipboard");
    expect(result.map((entry) => entry.nodeId)).toEqual(["root", "child-a", "grandchild"]);
    expect(result.at(-1)?.directMatch).toBe(true);
    expect(folded).toEqual(new Set(["root", "child-a"]));
  });

  it("returns no rows for an empty material tree", () => {
    expect(projectMaterialFiles({ ...tree, rootId: null, nodes: {} }, navigation())).toEqual([]);
  });

  it("keeps focus projection on the exact root-to-focus lineage", () => {
    const focused: NavigationState = {
      mode: "focus",
      focusNodeId: "grandchild",
      selectedNodeId: "grandchild",
      foldedNodeIds: new Set(["root"]),
    };
    expect(projectMaterialFiles(tree, focused, "clipboard").map((entry) => entry.nodeId)).toEqual([
      "root",
      "child-a",
      "grandchild",
    ]);
  });

  it("does not let a focus search reveal matches outside the visible lineage", () => {
    const focused: NavigationState = {
      mode: "focus",
      focusNodeId: "grandchild",
      selectedNodeId: "grandchild",
      foldedNodeIds: new Set(),
    };
    expect(projectMaterialFiles(tree, focused, "named")).toEqual([]);
  });
});

describe("material selection copy", () => {
  it("copies exact text in authored order regardless of selection order", () => {
    const result = serializeMaterialSelection(tree, new Set(["child-b", "child-a"]));
    expect(result).toEqual({
      ok: true,
      text: `${tree.nodes["child-a"].text}\n\n${tree.nodes["child-b"].text}`,
      nodeIds: ["child-a", "child-b"],
    });
  });

  it("rejects empty and stale selections", () => {
    expect(serializeMaterialSelection(tree, new Set())).toEqual({ ok: false, error: "EMPTY_SELECTION" });
    expect(serializeMaterialSelection(tree, new Set(["missing"]))).toEqual({ ok: false, error: "STALE_SELECTION" });
  });
});

function node(
  id: string,
  parentId: string | null,
  children: string[],
  text: string,
) {
  return {
    id,
    parentId,
    children,
    text,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

function navigation(foldedNodeIds: ReadonlySet<string> = new Set()): NavigationState {
  return { mode: "full", focusNodeId: null, selectedNodeId: null, foldedNodeIds };
}
