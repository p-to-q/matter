import { describe, expect, it } from "vitest";
import { exportSnapshotArchive, importSnapshotArchive } from "../persistence/archive-transport";
import { bundleToTree, treeToBundle } from "../persistence/snapshot-codec";
import { documentRootId } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtNode, type ThoughtTree } from "../tree/model";
import { selectVisiblePreorder } from "../tree/selectors";
import { parseContextReceipt, renderContextReceipt } from "./context-receipt";
import { parseContextReceiptV2, renderContextReceiptV2 } from "./context-receipt-v2";
import { projectInquiryContext } from "./inquiry-context";
import { serializeMaterialSelection } from "./material-files";
import { projectMaterial } from "./material-projection";
import { renderActiveTreeReceipt } from "./receipt-actions";
import { parseOutlineMarkdown } from "./render/list";
import { projectActiveViewContext, projectWorkingContext } from "./working-context";

const TREE_ID = "tree_output_conformance";
const ROOT_ID = documentRootId(TREE_ID);

/** The same authored tree reaches each output with that output's own address. */
function fixture(text: string): ThoughtTree {
  const node = (id: string, parentId: string | null, children: string[], content: string): ThoughtNode => ({
    id, parentId, children, text: content,
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  });
  return {
    protocolVersion: PROTOCOL_VERSION, id: TREE_ID, rootId: ROOT_ID, revision: 1,
    nodes: {
      [ROOT_ID]: { ...node(ROOT_ID, null, ["a", "held"], ""), role: "document-root" },
      a: node("a", ROOT_ID, ["b"], text),
      b: node("b", "a", [], "Child 😀"),
      held: node("held", ROOT_ID, [], "EXCLUDED_FIXTURE_TEXT"),
    },
  };
}

function active(tree: ThoughtTree) {
  return {
    view: [
      { node: tree.nodes.a, depth: 0 },
      { node: tree.nodes.b, depth: 1 },
      { node: tree.nodes.held, depth: 0 },
    ],
    activeNodeIds: new Set(["a", "b"]),
  };
}

describe("material output scope and conformance", () => {
  it("compresses selected-ancestor nesting in Copy without inventing a Receipt parent", async () => {
    const original = fixture("Included ancestor");
    const tree: ThoughtTree = {
      ...original,
      nodes: {
        ...original.nodes,
        b: { ...original.nodes.b, text: "OMITTED_PARENT_TEXT", children: ["c"] },
        c: { ...original.nodes.b, id: "c", parentId: "b", text: "Included descendant" },
      },
    };
    const copied = serializeMaterialSelection(tree, new Set(["a", "c"]));
    if (!copied.ok) throw new Error("copy fixture rejected");
    expect(copied.text).toBe("- Included ancestor\n  - Included descendant");
    expect(parseOutlineMarkdown(copied.text)).toEqual([
      { depth: 0, text: "Included ancestor" },
      { depth: 1, text: "Included descendant" },
    ]);
    const projection = projectMaterial(tree, {
      kind: "working-tree",
      view: [{ node: tree.nodes.a, depth: 0 }, { node: tree.nodes.c, depth: 2 }],
      activeNodeIds: new Set(["a", "c"]),
    });
    expect(projection.nodes.map(({ nodeId, parentId, depth }) => ({ nodeId, parentId, depth })))
      .toEqual([
        { nodeId: "a", parentId: null, depth: 0 },
        { nodeId: "c", parentId: null, depth: 2 },
      ]);
    const receipt = await renderContextReceipt(projection);
    expect(receipt).not.toContain("OMITTED_PARENT_TEXT");
    expect(copied.text).not.toContain("OMITTED_PARENT_TEXT");
    expect((await parseContextReceipt(receipt)).ok).toBe(true);
    const currentReceipt = await renderContextReceiptV2(projection);
    expect(currentReceipt).toContain("\n\n- Included ancestor\n- Included descendant\n\n");
    expect(currentReceipt).not.toContain("OMITTED_PARENT_TEXT");
    expect(await parseContextReceiptV2(currentReceipt)).toEqual({ ok: true, projection });
    expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
  });

  it.each(["held", "folded"] as const)(
    "keeps %s material out of Receipt and Inquiry without excluding it from Archive or deliberate Copy",
    async (exclusion) => {
      const tree = fixture("Visible parent");
      const working = {
        view: selectVisiblePreorder(tree, new Set(exclusion === "folded" ? ["a"] : []))
          .map((node) => ({ node, depth: node.parentId === "a" ? 1 : 0 })),
        activeNodeIds: projectWorkingContext(tree, new Set(exclusion === "held" ? ["b", "held"] : ["held"]))
          .activeNodeIds,
      };
      const projection = projectMaterial(tree, { kind: "working-tree", ...working });
      const inquiry = projectInquiryContext(tree, projectActiveViewContext(working.view, working.activeNodeIds));
      expect(projection.nodes.map(({ nodeId }) => nodeId)).toEqual(["a"]);
      expect(inquiry.lineage).toEqual(projection.nodes.map(({ nodeId, depth, text, truncated }) => ({
        nodeId, depth, text, truncated,
      })));
      expect(projection.thoughtCount).toBe(1);
      expect(inquiry.thoughtCount).toBe(1);
      const receipt = await renderContextReceipt(projection);
      expect(receipt).not.toContain("Child 😀");
      expect(receipt).not.toContain("EXCLUDED_FIXTURE_TEXT");
      const copied = serializeMaterialSelection(tree, new Set(["b", "held"]));
      expect(copied).toMatchObject({ ok: true });
      if (!copied.ok) throw new Error("copy fixture rejected");
      expect(copied.text).toContain("Child 😀");
      expect(copied.text).toContain("EXCLUDED_FIXTURE_TEXT");
      expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
    },
  );

  it("keeps repeated selected ranges in presentation order rather than substituting whole-node Copy", async () => {
    const tree = fixture("First。Second");
    const selections = [
      { type: "segment-range" as const, nodeId: "a", start: 0, end: 5, selectedText: "First" },
      { type: "segment-range" as const, nodeId: "a", start: 6, end: 12, selectedText: "Second" },
    ];
    const projection = projectMaterial(tree, { kind: "selection", selections });
    const working = projectActiveViewContext(active(tree).view, active(tree).activeNodeIds);
    const inquiry = projectInquiryContext(tree, working, selections);
    expect(projection.nodes.map(({ nodeId, depth, text, truncated }) => ({ nodeId, depth, text, truncated })))
      .toEqual(inquiry.lineage);
    expect(projection.nodes.map(({ nodeId, text }) => ({ nodeId, text }))).toEqual([
      { nodeId: "a", text: "First" }, { nodeId: "a", text: "Second" },
    ]);
    expect((await parseContextReceipt(await renderContextReceipt(projection))).ok).toBe(true);
    expect(serializeMaterialSelection(tree, new Set(["a"])))
      .toMatchObject({ ok: true, text: tree.nodes.a.text, nodeIds: ["a"] });
    expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
  });

  it("shares code-point text clipping with Inquiry while leaving Copy and Archive whole", async () => {
    const tree = fixture("A😀BC");
    const working = active(tree);
    const projection = projectMaterial(tree, { kind: "working-tree", ...working }, {
      maxNodeCodePoints: 2, maxTotalCodePoints: 2,
    });
    const inquiry = projectInquiryContext(tree, projectActiveViewContext(working.view, working.activeNodeIds), {
      maxNodeCodePoints: 2, maxContextCodePoints: 2,
    });
    expect(projection.nodes.map(({ nodeId, depth, text, truncated }) => ({ nodeId, depth, text, truncated })))
      .toEqual(inquiry.lineage);
    expect(projection.nodes).toEqual([
      { nodeId: "a", parentId: null, siblingIndex: 0, depth: 0, text: "A😀", truncated: true },
    ]);
    expect(projection).toMatchObject({ clipped: true, thoughtCount: 2 });
    expect(inquiry).toMatchObject({ clipped: true, thoughtCount: 2 });
    const receipt = await renderContextReceipt(projection);
    expect((await parseContextReceipt(receipt)).ok).toBe(true);
    expect(receipt).not.toContain("Child 😀");
    expect(serializeMaterialSelection(tree, new Set(["a"]))).toMatchObject({ ok: true, text: "A😀BC" });
    expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
  });

  it("lets Inquiry filter an excluded explicit selection while an explicitly empty receipt address stays empty", async () => {
    const tree = fixture("Still active");
    const selections = [{ type: "segment-range" as const, nodeId: "held", start: 0, end: 8, selectedText: "EXCLUDED" }];
    const working = active(tree);
    const inquiry = projectInquiryContext(tree, projectActiveViewContext(working.view, working.activeNodeIds), selections);
    expect(inquiry).toMatchObject({ scope: "selection", lineage: [], clipped: false });
    // The caller owns active selection filtering; projectMaterial does not infer it.
    const projection = projectMaterial(tree, { kind: "selection", selections: [] });
    expect(projection).toMatchObject({ nodes: [], thoughtCount: 0, clipped: false });
    expect((await parseContextReceipt(await renderContextReceipt(projection))).ok).toBe(true);
    expect(serializeMaterialSelection(tree, new Set())).toEqual({ ok: false, error: "EMPTY_SELECTION" });
    expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
  });

  it("restores image pointers through ZIP with truthful missing-byte accounting, not through text outputs", async () => {
    const original = fixture("Language survives a missing picture");
    const image = { mediaType: "image/png" as const, byteLength: 512, width: 256, height: 256, contentHash: "a".repeat(64) };
    const tree: ThoughtTree = { ...original, nodes: { ...original.nodes, a: { ...original.nodes.a, image } } };
    const exported = await exportSnapshotArchive(treeToBundle(tree));
    if (!exported.ok) throw new Error("archive export rejected");
    expect(exported.missingImages).toBe(1);
    const imported = await importSnapshotArchive(exported.bytes);
    expect(imported).toMatchObject({ ok: true, tree });
    if (!imported.ok) throw new Error("archive import rejected");
    expect(imported.blobs.size).toBe(0);
    expect(imported.tree.nodes.a.image).toEqual(image);
    const receipt = await renderContextReceipt(projectMaterial(tree, { kind: "working-tree", ...active(tree) }));
    expect(receipt).not.toContain(image.contentHash);
    expect(receipt).not.toContain("image/png");
    expect(serializeMaterialSelection(tree, new Set(["a"])))
      .toMatchObject({ ok: true, text: tree.nodes.a.text });
  });

  it("does not reveal an omitted sibling's earlier position through Receipt rank or digest", async () => {
    const tree = fixture("Included passage");
    const reordered: ThoughtTree = {
      ...tree,
      nodes: {
        ...tree.nodes,
        [ROOT_ID]: { ...tree.nodes[ROOT_ID], children: ["held", "a"] },
        held: { ...tree.nodes.held, text: "DIFFERENT_EXCLUDED_TEXT" },
      },
    };
    const addressFor = (source: ThoughtTree) => ({
      kind: "working-tree" as const,
      view: selectVisiblePreorder(source, new Set())
        .map((node) => ({ node, depth: node.parentId === "a" ? 1 : 0 })),
      activeNodeIds: projectWorkingContext(source, new Set(["held"])).activeNodeIds,
    });
    const projection = projectMaterial(tree, addressFor(tree));
    const alternate = projectMaterial(reordered, addressFor(reordered));
    expect(alternate).toEqual(projection);
    expect(alternate.nodes[0]?.siblingIndex).toBe(0);
    expect(await renderContextReceipt(alternate)).toBe(await renderContextReceipt(projection));
    expect(bundleToTree(treeToBundle(reordered))).toEqual({ ok: true, tree: reordered });
  });

  it("carries the same addressed text and ancestry without making Archive inherit transient exclusion", async () => {
    const tree = fixture("---\n- not a child\n`code` & <tag> 😀");
    const copied = serializeMaterialSelection(tree, new Set(["a", "b"]));
    expect(copied.ok).toBe(true);
    if (!copied.ok) throw new Error("copy fixture rejected");
    expect(parseOutlineMarkdown(copied.text)).toEqual([
      { depth: 0, text: tree.nodes.a.text },
      { depth: 1, text: tree.nodes.b.text },
    ]);

    const projection = projectMaterial(tree, { kind: "working-tree", ...active(tree) });
    expect(projection.nodes.map(({ nodeId, parentId, text }) => ({ nodeId, parentId, text }))).toEqual([
      { nodeId: "a", parentId: null, text: tree.nodes.a.text },
      { nodeId: "b", parentId: "a", text: tree.nodes.b.text },
    ]);
    const receipt = await renderContextReceipt(projection);
    expect((await parseContextReceipt(receipt)).ok).toBe(true);
    expect(receipt).not.toContain("EXCLUDED_FIXTURE_TEXT");
    expect(copied.text).not.toContain("EXCLUDED_FIXTURE_TEXT");
    expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
  });

  it.each(["\r", "\r\n", "\u0085", "\u2028", "\u2029"])(
    "preserves valid material containing %j in Copy/Archive while Receipt v1 refuses it whole",
    async (lineBreak) => {
      const tree = fixture(`Before${lineBreak}- cannot forge a child`);
      const copied = serializeMaterialSelection(tree, new Set(["a", "b"]));
      expect(copied.ok).toBe(true);
      if (!copied.ok) throw new Error("copy fixture rejected");
      expect(parseOutlineMarkdown(copied.text)).toEqual([
        { depth: 0, text: tree.nodes.a.text },
        { depth: 1, text: tree.nodes.b.text },
      ]);
      expect(bundleToTree(treeToBundle(tree))).toEqual({ ok: true, tree });
      const projection = projectMaterial(tree, { kind: "working-tree", ...active(tree) });
      await expect(renderContextReceipt(projection)).rejects.toThrow(RangeError);
      const current = await renderActiveTreeReceipt(tree, active(tree));
      expect(current).not.toBeNull();
      const parsed = await parseContextReceiptV2(current);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.projection).toEqual(projection);
    },
  );
});
