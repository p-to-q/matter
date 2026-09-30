import type { ThoughtTree } from "../tree/model";
import type { DocumentSwitchReceipt } from "../store/matter-store";
import type { RepositoryErrorCode } from "./document-repository";
import type { ImportedDocumentPreparation, ImportOptions, PersistenceController } from "./persistence-controller";

export type DocumentImportErrorCode =
  | "IMPORT_INVALID_TREE"
  | "IMPORT_CONFLICT"
  | "IMPORT_DIRTY"
  | "IMPORT_SAVING"
  | "IMPORT_FOREIGN_DOCUMENT"
  | "IMPORT_STALE"
  /** Something the person started is in progress; replacing would end it. */
  | "IMPORT_BUSY"
  | Exclude<RepositoryErrorCode, "PERSISTENCE_CONFLICT">;

export type DocumentImportReceipt =
  | Readonly<{ status: "switched"; treeId: string; revision: number }>
  | Readonly<{ status: "rejected"; errorCode: DocumentImportErrorCode }>;

export type DocumentImportCoordinator = Readonly<{
  importValidatedTree(
    tree: ThoughtTree,
    basis: DocumentImportBasis,
    options?: ImportOptions,
  ): Promise<DocumentImportReceipt>;
}>;

export type DocumentImportBasis = Readonly<{
  treeId: string;
  revision: number;
  documentEpoch: number;
}>;

type DocumentSwitch = (tree: ThoughtTree) => DocumentSwitchReceipt;

/**
 * Owns the one-way archive handoff: storage must accept the complete candidate
 * before runtime state may move to it. Archive decoding belongs outside this seam.
 *
 * Replacing the document instance revokes everything bound to it, so an import
 * refuses while `materialIdle` is false: held or in-flight spoken words, a
 * material turn, a question held in Ask Matter, or a name being typed. The
 * person finishes or discards that first; nothing is dropped behind them.
 */
export function createDocumentImportCoordinator(
  persistence: Pick<
    PersistenceController,
    "prepareImportedTree" | "activateImportedDocument" | "discardImportedDocument"
  >,
  switchDocument: DocumentSwitch,
  currentBasis: () => DocumentImportBasis,
  materialIdle: () => boolean,
): DocumentImportCoordinator {
  let importing = false;
  return Object.freeze({
    async importValidatedTree(tree, basis, options = {}) {
      if (importing) return Object.freeze({ status: "rejected", errorCode: "IMPORT_CONFLICT" });
      importing = true;
      let prepared: ImportedDocumentPreparation | null = null;
      let activated = false;
      try {
        if (!sameBasis(currentBasis(), basis)) {
          return Object.freeze({ status: "rejected", errorCode: "IMPORT_STALE" });
        }
        if (!materialIdle()) {
          return Object.freeze({ status: "rejected", errorCode: "IMPORT_BUSY" });
        }
        // The first release has no durable active-document pointer. Accepting a
        // different tree id would claim a successful switch that reload cannot
        // restore, so only a copy of the current document may cross this seam.
        if (tree.id !== basis.treeId) {
          return Object.freeze({ status: "rejected", errorCode: "IMPORT_FOREIGN_DOCUMENT" });
        }
        const result = await persistence.prepareImportedTree(tree, options);
        if (!result.ok) {
          return Object.freeze({ status: "rejected", errorCode: result.errorCode });
        }
        prepared = result;

        // The comparison and named store switch are synchronous on one browser
        // task. No late archive may replace material that moved, or work that
        // started, while IndexedDB was accepting its candidate.
        const lateRefusal: DocumentImportErrorCode | null = !sameBasis(currentBasis(), basis)
          ? "IMPORT_STALE"
          : !materialIdle() ? "IMPORT_BUSY" : null;
        if (lateRefusal !== null) {
          const cleanupError = await persistence.discardImportedDocument(prepared);
          prepared = null;
          return Object.freeze({
            status: "rejected",
            errorCode: cleanupError === null ? lateRefusal : importError(cleanupError),
          });
        }
        const switchReceipt = switchDocument(prepared.tree);
        if (switchReceipt.status !== "switched") {
          const cleanupError = await persistence.discardImportedDocument(prepared);
          prepared = null;
          return Object.freeze({
            status: "rejected",
            errorCode: cleanupError === null ? "IMPORT_INVALID_TREE" : importError(cleanupError),
          });
        }

        persistence.activateImportedDocument(prepared);
        activated = true;
        return Object.freeze({
          status: "switched",
          treeId: prepared.tree.id,
          revision: prepared.tree.revision,
        });
      } finally {
        if (prepared !== null && !activated) {
          await persistence.discardImportedDocument(prepared);
        }
        importing = false;
      }
    },
  });
}

function importError(code: RepositoryErrorCode): DocumentImportErrorCode {
  return code === "PERSISTENCE_CONFLICT" ? "IMPORT_CONFLICT" : code;
}

function sameBasis(left: DocumentImportBasis, right: DocumentImportBasis): boolean {
  return left.treeId === right.treeId &&
    left.revision === right.revision &&
    left.documentEpoch === right.documentEpoch;
}

export type { ImportedDocumentPreparation };
