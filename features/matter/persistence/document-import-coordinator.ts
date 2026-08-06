import type { ThoughtTree } from "../tree/model";
import type { DocumentSwitchReceipt } from "../store/matter-store";
import type { RepositoryErrorCode } from "./document-repository";
import type { ImportedDocumentPreparation, PersistenceController } from "./persistence-controller";

export type DocumentImportErrorCode =
  | "IMPORT_INVALID_TREE"
  | "IMPORT_CONFLICT"
  | Exclude<RepositoryErrorCode, "PERSISTENCE_CONFLICT">;

export type DocumentImportReceipt =
  | Readonly<{ status: "switched"; treeId: string; revision: number }>
  | Readonly<{ status: "rejected"; errorCode: DocumentImportErrorCode }>;

export type DocumentImportCoordinator = Readonly<{
  importValidatedTree(tree: ThoughtTree): Promise<DocumentImportReceipt>;
}>;

type DocumentSwitch = (tree: ThoughtTree) => DocumentSwitchReceipt;

/**
 * Owns the one-way archive handoff: storage must accept the complete candidate
 * before runtime state may move to it. Archive decoding belongs outside this seam.
 */
export function createDocumentImportCoordinator(
  persistence: Pick<PersistenceController, "prepareImportedTree" | "activateImportedDocument">,
  switchDocument: DocumentSwitch,
): DocumentImportCoordinator {
  return Object.freeze({
    async importValidatedTree(tree) {
      const prepared = await persistence.prepareImportedTree(tree);
      if (!prepared.ok) {
        return Object.freeze({ status: "rejected", errorCode: prepared.errorCode });
      }

      const switchReceipt = switchDocument(prepared.tree);
      if (switchReceipt.status !== "switched") {
        return Object.freeze({ status: "rejected", errorCode: "IMPORT_INVALID_TREE" });
      }

      persistence.activateImportedDocument(prepared);
      return Object.freeze({
        status: "switched",
        treeId: prepared.tree.id,
        revision: prepared.tree.revision,
      });
    },
  });
}

export type { ImportedDocumentPreparation };
