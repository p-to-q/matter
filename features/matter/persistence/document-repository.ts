import { bundleToTree, type SnapshotBundle } from "./snapshot-codec";
import { createMatterDatabaseHandle, STORAGE_SCHEMA_VERSION } from "./matter-database";
import type { StoredSnapshot } from "./matter-database";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";

export { STORAGE_SCHEMA_VERSION };
export type { StoredSnapshot };

export type RepositoryErrorCode =
  | "PERSISTENCE_UNAVAILABLE"
  | "PERSISTENCE_CORRUPT"
  | "PERSISTENCE_CONFLICT"
  | "PERSISTENCE_STORAGE_FULL"
  | "PERSISTENCE_WRITE_FAILED";

export type RepositoryResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Readonly<{ code: RepositoryErrorCode; message: string }> }>;

export type LoadedSnapshot = Readonly<{
  tree: ThoughtTree;
  history?: TreeHistory | null;
  writeGeneration: number;
}>;

export type DocumentRepository = Readonly<{
  load(treeId: string): Promise<RepositoryResult<LoadedSnapshot | null>>;
  save(
    treeId: string,
    treeRevision: number,
    bundle: SnapshotBundle,
    expectedGeneration: number | null,
    history?: TreeHistory,
  ): Promise<RepositoryResult<number>>;
  close(): void;
}>;

export function createIndexedDbDocumentRepository(): DocumentRepository {
  const handle = createMatterDatabaseHandle();
  const database = handle.open;

  return Object.freeze({
    async load(treeId) {
      try {
        const stored = await (await database()).get("snapshots", treeId);
        if (stored === undefined) return success(null);
        if (
          stored.storageSchemaVersion !== STORAGE_SCHEMA_VERSION ||
          stored.treeId !== treeId ||
          !Number.isSafeInteger(stored.treeRevision) ||
          !Number.isSafeInteger(stored.writeGeneration) ||
          stored.writeGeneration < 1
        ) {
          return failure("PERSISTENCE_CORRUPT", "The stored material metadata is invalid.");
        }
        const decoded = bundleToTree(stored.bundle);
        if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== stored.treeRevision) {
          return failure("PERSISTENCE_CORRUPT", "The stored Markdown bundle is invalid.");
        }
        return success(Object.freeze({
          tree: decoded.tree,
          history: stored.history ?? null,
          writeGeneration: stored.writeGeneration,
        }));
      } catch {
        return failure("PERSISTENCE_UNAVAILABLE", "Local material storage is unavailable.");
      }
    },

    async save(treeId, treeRevision, bundle, expectedGeneration, history) {
      try {
        const db = await database();
        const transaction = db.transaction("snapshots", "readwrite");
        const existing = await transaction.store.get(treeId);
        const currentGeneration = existing?.writeGeneration ?? null;
        if (currentGeneration !== expectedGeneration) {
          transaction.abort();
          try {
            await transaction.done;
          } catch {
            // The deliberate abort is the atomic conflict outcome.
          }
          return failure("PERSISTENCE_CONFLICT", "Material changed in another tab.");
        }
        const nextGeneration = (currentGeneration ?? 0) + 1;
        await transaction.store.put(Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId,
          treeRevision,
          writeGeneration: nextGeneration,
          bundle,
          ...(history === undefined ? {} : { history }),
        }));
        await transaction.done;
        return success(nextGeneration);
      } catch (error) {
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          return failure("PERSISTENCE_STORAGE_FULL", "Local material storage is full.");
        }
        return failure("PERSISTENCE_WRITE_FAILED", "The latest material could not be saved locally.");
      }
    },

    close() {
      handle.close();
    },
  });
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): Extract<RepositoryResult<never>, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
