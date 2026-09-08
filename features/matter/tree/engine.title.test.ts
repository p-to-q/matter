import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { renameDocumentCommand } from "../runtime/title";
import { normalizeDocumentTree } from "./document-root";
import { DOCUMENT_TITLE_MAX_CODE_UNITS, normalizeDocumentTitle } from "./document-root";
import { applyTreeCommand } from "./engine";

describe("replace-title", () => {
  it("truncates only between Unicode scalars and rejects malformed rename input", () => {
    const prefix = "a".repeat(DOCUMENT_TITLE_MAX_CODE_UNITS - 1);
    expect(normalizeDocumentTitle(`${prefix}🚀`)).toBe(prefix);
    expect(normalizeDocumentTitle(`${"a".repeat(DOCUMENT_TITLE_MAX_CODE_UNITS - 2)}🚀`))
      .toBe(`${"a".repeat(DOCUMENT_TITLE_MAX_CODE_UNITS - 2)}🚀`);

    const tree = normalizeDocumentTree(createSeededDocument().tree);
    const originalTitle = tree.title;
    expect(renameDocumentCommand(tree, {
      commandId: "malformed-title",
      title: "bad\uD800title",
      createdAt: "2026-08-07T00:00:00.000Z",
    })).toBeNull();

    const direct = applyTreeCommand(tree, {
      id: "malformed-title",
      source: "human",
      expectedTreeId: tree.id,
      expectedRevision: tree.revision,
      createdAt: "2026-08-07T00:00:00.000Z",
      mutation: {
        type: "replace-title",
        expectedTitle: tree.title!,
        title: "bad\uDC00title",
      },
    });
    expect(direct).toMatchObject({ ok: false, error: { code: "TREE_INVARIANT_VIOLATION" } });
    expect(tree.title).toBe(originalTitle);
  });

  it("renames independently from material text and restores through its inverse", () => {
    const tree = normalizeDocumentTree(createSeededDocument().tree);
    const firstMaterialId = tree.nodes[tree.rootId!].children[0]!;
    const firstText = tree.nodes[firstMaterialId].text;
    const command = renameDocumentCommand(tree, {
      commandId: "rename-document",
      title: "Other possible lives",
      createdAt: "2026-08-07T00:00:00.000Z",
    });
    expect(command).not.toBeNull();
    const renamed = applyTreeCommand(tree, command!);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.tree.title).toBe("Other possible lives");
    expect(renamed.tree.nodes[firstMaterialId].text).toBe(firstText);
    const restored = applyTreeCommand(renamed.tree, renamed.inverse);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.tree.title).toBe(tree.title);
  });
});
