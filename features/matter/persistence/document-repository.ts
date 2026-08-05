import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import { bundleToTree, type SnapshotBundle } from "./snapshot-codec";
import type { ThoughtTree } from "../tree/model";

export const STORAGE_SCHEMA_VERSION = 1 as const;

export type StoredSnapshot = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
}>;

export type RepositoryErrorCode =
  | "PERSISTENCE_UNAVAILABLE"
  | "PERSISTENCE_CORRUPT"
  | "PERSISTENCE_CONFLICT"
  | "PERSISTENCE_WRITE_FAILED";

export type RepositoryResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Readonly<{ code: RepositoryErrorCode; message: string }> }>;

export type LoadedSnapshot = Readonly<{
  tree: ThoughtTree;
  writeGeneration: number;
}>;

export type DocumentRepository = Readonly<{
  load(treeId: string): Promise<RepositoryResult<LoadedSnapshot | null>>;
  save(
    treeId: string,
    treeRevision: number,
    bundle: SnapshotBundle,
    expectedGeneration: number | null,
  ): Promise<RepositoryResult<number>>;
  close(): void;
}>;

interface MatterDatabase extends DBSchema {
  snapshots: {
    key: string;
    value: StoredSnapshot;
  };
}

const DATABASE_NAME = "ptoq-matter";
const DATABASE_VERSION = 1;

export function createIndexedDbDocumentRepository(): DocumentRepository {
  let databasePromise: Promise<IDBPDatabase<MatterDatabase>> | null = null;
  const database = () => {
    if (databasePromise === null) {
      const owner: { opening: Promise<IDBPDatabase<MatterDatabase>> | null } = {
        opening: null,
      };
      const resetIfCurrent = () => {
        if (databasePromise === owner.opening) databasePromise = null;
      };
      const opening = openDB<MatterDatabase>(DATABASE_NAME, DATABASE_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "treeId" });
        },
        blocked: resetIfCurrent,
        terminated: resetIfCurrent,
        blocking() {
          void owner.opening?.then((db) => db.close()).catch(() => undefined);
          resetIfCurrent();
        },
      });
      owner.opening = opening;
      databasePromise = opening;
      void opening.catch(() => {
        // A failed open is recoverable on the next explicit operation. Do not
        // let an older rejection clear a newer open installed by a lifecycle event.
        resetIfCurrent();
      });
    }
    return databasePromise;
  };

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
        return success(Object.freeze({ tree: decoded.tree, writeGeneration: stored.writeGeneration }));
      } catch {
        return failure("PERSISTENCE_UNAVAILABLE", "Local material storage is unavailable.");
      }
    },

    async save(treeId, treeRevision, bundle, expectedGeneration) {
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
        }));
        await transaction.done;
        return success(nextGeneration);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return failure("PERSISTENCE_CONFLICT", "Material changed in another tab.");
        }
        return failure("PERSISTENCE_WRITE_FAILED", "The latest material could not be saved locally.");
      }
    },

    close() {
      void databasePromise?.then((db) => db.close()).catch(() => undefined);
      databasePromise = null;
    },
  });
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): Extract<RepositoryResult<never>, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
