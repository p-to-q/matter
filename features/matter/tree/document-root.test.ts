import { describe, expect, it } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { projectLayoutProjection } from "../components/layout-projection";
import { createNavigationState } from "../runtime/navigation";
import { normalizeDocumentTree } from "./document-root";
import { createEmptyTree, validateThoughtTree } from "./invariants";

describe("document root normalization", () => {
  it("migrates a legacy visible root into the first visible top-level node", () => {
    const legacy = createRootedMaterialFixture().tree;
    const tree = normalizeDocumentTree(legacy);
    const root = tree.nodes[tree.rootId!];

    expect(root.role).toBe("document-root");
    expect(root.text).toBe("");
    expect(root.children).toEqual([legacy.rootId]);
    expect(tree.nodes[legacy.rootId!].parentId).toBe(root.id);
    expect(tree.title).toBe(legacy.nodes[legacy.rootId!].text);
    expect(validateThoughtTree(tree)).toEqual({ ok: true });

    const navigation = createNavigationState();
    const projection = projectLayoutProjection({
      tree,
      mode: "full",
      focusNodeId: null,
      foldedNodeIds: navigation.foldedNodeIds,
    });
    expect(projection[0]).toMatchObject({ node: { id: legacy.rootId }, depth: 0, parentId: null });
    expect(projection.some(({ node }) => node.id === root.id)).toBe(false);
  });

  it("is idempotent for an already normalized document", () => {
    const tree = normalizeDocumentTree(createRootedMaterialFixture().tree);
    expect(normalizeDocumentTree(tree)).toBe(tree);
  });

  it("gives an empty canvas the same invisible attachment root", () => {
    const tree = normalizeDocumentTree(createEmptyTree("empty_document"));
    expect(tree.rootId).not.toBeNull();
    expect(tree.nodes[tree.rootId!]).toMatchObject({ role: "document-root", children: [] });
    expect(validateThoughtTree(tree)).toEqual({ ok: true });
  });

  it("repairs an early structural root that predates the explicit role", () => {
    const normalized = normalizeDocumentTree(createRootedMaterialFixture().tree);
    const rootId = normalized.rootId!;
    const early = {
      ...normalized,
      title: "Untitled matter",
      nodes: { ...normalized.nodes, [rootId]: { ...normalized.nodes[rootId], role: undefined } },
    };
    const repaired = normalizeDocumentTree(early, "Recovered title");
    expect(repaired.nodes[rootId].role).toBe("document-root");
    expect(repaired.title).toBe("Recovered title");
    expect(validateThoughtTree(repaired)).toEqual({ ok: true });
  });
});
