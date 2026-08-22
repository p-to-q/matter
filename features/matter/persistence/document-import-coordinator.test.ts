import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { createTreeHistory } from "../tree/history";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import { STORAGE_SCHEMA_VERSION, type ImportedSnapshotReservation } from "./document-repository";
import type { ImportedDocumentPreparation, PersistenceController } from "./persistence-controller";
import { treeToBundle } from "./snapshot-codec";

describe("document import coordinator", () => {
  it("switches runtime only after a prepared archive has a successful CAS", async () => {
    const tree = createSeededDocument().tree;
    const basis = { treeId: tree.id, revision: tree.revision, documentEpoch: 2 };
    const prepared: ImportedDocumentPreparation = {
      ok: true,
      attemptId: 1,
      createdSnapshot: true,
      tree,
      writeGeneration: 4,
      reservation: reservation(tree, 4),
    };
    const events: string[] = [];
    const persistence = {
      prepareImportedTree: vi.fn(async () => {
        events.push("prepare");
        return prepared;
      }),
      activateImportedDocument: vi.fn(() => events.push("activate")),
      discardImportedDocument: vi.fn(async () => null),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn(() => {
      events.push("switch");
      return { operation: "switch-document", status: "switched", treeId: tree.id, revision: tree.revision } as const;
    });

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => basis);
    await expect(coordinator.importValidatedTree(tree, basis)).resolves.toEqual({
      status: "switched",
      treeId: tree.id,
      revision: tree.revision,
    });
    expect(events).toEqual(["prepare", "switch", "activate"]);
  });

  it("leaves runtime untouched when persistence rejects a conflict", async () => {
    const tree = createSeededDocument().tree;
    const persistence = {
      prepareImportedTree: vi.fn(async () => ({ ok: false, errorCode: "IMPORT_CONFLICT" } as const)),
      activateImportedDocument: vi.fn(),
      discardImportedDocument: vi.fn(async () => null),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn();
    const basis = { treeId: tree.id, revision: tree.revision, documentEpoch: 2 };

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => basis);
    await expect(coordinator.importValidatedTree(tree, basis)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_CONFLICT",
    });
    expect(switchDocument).not.toHaveBeenCalled();
    expect(persistence.activateImportedDocument).not.toHaveBeenCalled();
  });

  it("rejects a foreign document before reserving storage in the first release", async () => {
    const current = createSeededDocument().tree;
    const foreign = { ...current, id: "foreign_tree" };
    const basis = { treeId: current.id, revision: current.revision, documentEpoch: 2 };
    const persistence = {
      prepareImportedTree: vi.fn(),
      activateImportedDocument: vi.fn(),
      discardImportedDocument: vi.fn(),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn();

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => basis);
    await expect(coordinator.importValidatedTree(foreign, basis)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_FOREIGN_DOCUMENT",
    });
    expect(persistence.prepareImportedTree).not.toHaveBeenCalled();
    expect(switchDocument).not.toHaveBeenCalled();
  });

  it("does not activate persistence if the named runtime switch rejects", async () => {
    const tree = createSeededDocument().tree;
    const basis = { treeId: tree.id, revision: tree.revision, documentEpoch: 2 };
    const prepared: ImportedDocumentPreparation = {
      ok: true,
      attemptId: 1,
      createdSnapshot: true,
      tree,
      writeGeneration: 4,
      reservation: reservation(tree, 4),
    };
    const persistence = {
      prepareImportedTree: vi.fn(async () => prepared),
      activateImportedDocument: vi.fn(),
      discardImportedDocument: vi.fn(async () => null),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn(() => ({
      operation: "switch-document",
      status: "rejected",
      treeId: "current",
      revision: 7,
      errorCode: "TREE_INVARIANT_VIOLATION",
    } as const));

    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => basis);
    await expect(coordinator.importValidatedTree(tree, basis)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_INVALID_TREE",
    });
    expect(persistence.activateImportedDocument).not.toHaveBeenCalled();
    expect(persistence.discardImportedDocument).toHaveBeenCalledWith(prepared);
  });

  it("discards a prepared snapshot when the current document basis moves", async () => {
    const tree = createSeededDocument().tree;
    const basis = { treeId: tree.id, revision: tree.revision, documentEpoch: 2 };
    let current = basis;
    let settle!: (value: ImportedDocumentPreparation) => void;
    const prepared: ImportedDocumentPreparation = {
      ok: true,
      attemptId: 7,
      createdSnapshot: false,
      tree,
      writeGeneration: 1,
      reservation: reservation(tree, 1),
    };
    const persistence = {
      prepareImportedTree: vi.fn(() => new Promise<ImportedDocumentPreparation>((resolve) => {
        settle = resolve;
      })),
      activateImportedDocument: vi.fn(),
      discardImportedDocument: vi.fn(async () => null),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn();
    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => current);

    const importing = coordinator.importValidatedTree(prepared.tree, basis);
    current = { ...basis, revision: basis.revision + 1 };
    settle(prepared);

    await expect(importing).resolves.toEqual({ status: "rejected", errorCode: "IMPORT_STALE" });
    expect(persistence.discardImportedDocument).toHaveBeenCalledWith(prepared);
    expect(switchDocument).not.toHaveBeenCalled();
  });

  it("keeps one import owner while preparation is in flight", async () => {
    const tree = createSeededDocument().tree;
    const basis = { treeId: tree.id, revision: tree.revision, documentEpoch: 2 };
    let settle!: (value: ImportedDocumentPreparation) => void;
    const prepared: ImportedDocumentPreparation = {
      ok: true,
      attemptId: 3,
      createdSnapshot: false,
      tree,
      writeGeneration: 4,
      reservation: reservation(tree, 4),
    };
    const persistence = {
      prepareImportedTree: vi.fn(() => new Promise<ImportedDocumentPreparation>((resolve) => {
        settle = resolve;
      })),
      activateImportedDocument: vi.fn(),
      discardImportedDocument: vi.fn(async () => null),
    } satisfies Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument">;
    const switchDocument = vi.fn(() => ({
      operation: "switch-document",
      status: "switched",
      treeId: tree.id,
      revision: tree.revision,
    } as const));
    const coordinator = createDocumentImportCoordinator(persistence, switchDocument, () => basis);

    const first = coordinator.importValidatedTree(tree, basis);
    await expect(coordinator.importValidatedTree(tree, basis)).resolves.toEqual({
      status: "rejected",
      errorCode: "IMPORT_CONFLICT",
    });
    settle(prepared);
    await expect(first).resolves.toMatchObject({ status: "switched" });
    expect(persistence.prepareImportedTree).toHaveBeenCalledTimes(1);
  });
});

function reservation(
  tree: ReturnType<typeof createSeededDocument>["tree"],
  writeGeneration: number,
): ImportedSnapshotReservation {
  return Object.freeze({
    treeId: tree.id,
    imported: Object.freeze({
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      treeId: tree.id,
      treeRevision: tree.revision,
      writeGeneration,
      bundle: treeToBundle(tree),
      history: createTreeHistory(),
    }),
    previous: null,
  });
}
