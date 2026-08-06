import { describe, expect, it, vi } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import type { ImportedDocumentPreparation, PersistenceController } from "./persistence-controller";

describe("document import coordinator", () => {
  it("switches runtime only after a prepared archive has a successful CAS", async () => {
    const tree = createRootedMaterialFixture().tree;
    const prepared: ImportedDocumentPreparation = { ok: true, tree, writeGeneration: 4 };
    const events: string[] = [];
    const persistence = {
      prepareImportedTree: vi.fn(async () => {
        events.push("prepare");
        return prepared;
      }),
      activateImportedDocument: vi.fn(() => events.push("activate")),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument">;
    const switchDocument = vi.fn(() => {
      events.push("switch");
      return { operation: "switch-document", status: "switched", treeId: tree.id, revision: tree.revision } as const;
    });

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument);
    await expect(coordinator.importValidatedTree(tree)).resolves.toEqual({
      status: "switched",
      treeId: tree.id,
      revision: tree.revision,
    });
    expect(events).toEqual(["prepare", "switch", "activate"]);
  });

  it("leaves runtime untouched when persistence rejects a conflict", async () => {
    const tree = createRootedMaterialFixture().tree;
    const persistence = {
      prepareImportedTree: vi.fn(async () => ({ ok: false, errorCode: "IMPORT_CONFLICT" } as const)),
      activateImportedDocument: vi.fn(),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument">;
    const switchDocument = vi.fn();

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument);
    await expect(coordinator.importValidatedTree(tree)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_CONFLICT",
    });
    expect(switchDocument).not.toHaveBeenCalled();
    expect(persistence.activateImportedDocument).not.toHaveBeenCalled();
  });

  it("does not activate persistence if the named runtime switch rejects", async () => {
    const tree = createRootedMaterialFixture().tree;
    const prepared: ImportedDocumentPreparation = { ok: true, tree, writeGeneration: 4 };
    const persistence = {
      prepareImportedTree: vi.fn(async () => prepared),
      activateImportedDocument: vi.fn(),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument">;
    const switchDocument = vi.fn(() => ({
      operation: "switch-document",
      status: "rejected",
      treeId: "current",
      revision: 7,
      errorCode: "TREE_INVARIANT_VIOLATION",
    } as const));

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument);
    await expect(coordinator.importValidatedTree(tree)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_INVALID_TREE",
    });
    expect(persistence.activateImportedDocument).not.toHaveBeenCalled();
  });
});
