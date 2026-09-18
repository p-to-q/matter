import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { projectLayoutProjection } from "../components/layout-projection";
import { createNavigationState } from "../runtime/navigation";
import { isEmptyMaterialDocument, normalizeDocumentTree } from "./document-root";
import { createEmptyTree, validateThoughtTree } from "./invariants";

describe("document root normalization", () => {
  it("migrates a legacy visible root into the first visible top-level node", () => {
    const legacy = createSeededDocument().tree;
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
    const tree = normalizeDocumentTree(createSeededDocument().tree);
    expect(normalizeDocumentTree(tree)).toBe(tree);
  });

  it("gives an empty canvas the same invisible attachment root", () => {
    const tree = normalizeDocumentTree(createEmptyTree("empty_document"));
    expect(tree.rootId).not.toBeNull();
    expect(tree.nodes[tree.rootId!]).toMatchObject({ role: "document-root", children: [] });
    expect(isEmptyMaterialDocument(tree)).toBe(true);
    expect(validateThoughtTree(tree)).toEqual({ ok: true });
  });

  it("distinguishes the invisible container from its first visible material", () => {
    const empty = normalizeDocumentTree(createEmptyTree("empty_document"));
    const populated = normalizeDocumentTree(createSeededDocument("root").tree);

    expect(isEmptyMaterialDocument(createEmptyTree("legacy_empty"))).toBe(true);
    expect(isEmptyMaterialDocument(empty)).toBe(true);
    expect(isEmptyMaterialDocument(populated)).toBe(false);
  });

  it("normalizes a long astral title without splitting or persisting malformed text", () => {
    const prefix = "a".repeat(159);
    const tree = normalizeDocumentTree(createEmptyTree("empty_document"), `${prefix}🚀`);
    expect(tree.title).toBe(prefix);
    expect(validateThoughtTree(tree)).toEqual({ ok: true });

    const malformed = normalizeDocumentTree(createEmptyTree("other_document"), "bad\uD800title");
    expect(malformed.title).toBe("Untitled matter");
    expect(validateThoughtTree(malformed)).toEqual({ ok: true });
  });

  it("repairs an early structural root that predates the explicit role", () => {
    const normalized = normalizeDocumentTree(createSeededDocument().tree);
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
