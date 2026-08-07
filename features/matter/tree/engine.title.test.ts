import { describe, expect, it } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { renameDocumentCommand } from "../runtime/title";
import { normalizeDocumentTree } from "./document-root";
import { applyTreeCommand } from "./engine";

describe("replace-title", () => {
  it("renames independently from material text and restores through its inverse", () => {
    const tree = normalizeDocumentTree(createRootedMaterialFixture().tree);
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
