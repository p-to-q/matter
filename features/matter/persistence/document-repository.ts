import { bundleToTree, type SnapshotBundle } from "./snapshot-codec";
import { createMatterDatabaseHandle, STORAGE_SCHEMA_VERSION } from "./matter-database";
import type { StoredSnapshot } from "./matter-database";
import type { ThoughtTree } from "../tree/model";
import { createTreeHistory, type TreeHistory } from "../tree/history";

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

export type CorruptSnapshotBasis = Readonly<{
  treeId: string;
  /** Exact private serialization of the row the person exported. */
  serialized: string;
}>;

export type CorruptSnapshotExport = Readonly<{
  basis: CorruptSnapshotBasis;
  bytes: Uint8Array;
}>;

export type ImportedSnapshotReservation = Readonly<{
  treeId: string;
  imported: StoredSnapshot;
  previous: StoredSnapshot | null;
}>;

export type ImportedSnapshotRollback =
  | Readonly<{ status: "rolled-back"; writeGeneration: number | null }>
  | Readonly<{ status: "stale" }>;

export type DocumentRepository = Readonly<{
  load(treeId: string): Promise<RepositoryResult<LoadedSnapshot | null>>;
  save(
    treeId: string,
    treeRevision: number,
    bundle: SnapshotBundle,
    expectedGeneration: number | null,
    history?: TreeHistory,
  ): Promise<RepositoryResult<number>>;
  reserveImportedSnapshot(
    treeId: string,
    treeRevision: number,
    bundle: SnapshotBundle,
    expectedGeneration: number | null,
  ): Promise<RepositoryResult<ImportedSnapshotReservation>>;
  rollbackImportedSnapshot(
    reservation: ImportedSnapshotReservation,
  ): Promise<RepositoryResult<ImportedSnapshotRollback>>;
  exportCorrupt(treeId: string): Promise<RepositoryResult<CorruptSnapshotExport>>;
  replaceCorrupt(
    treeId: string,
    treeRevision: number,
    bundle: SnapshotBundle,
    history: TreeHistory,
    basis: CorruptSnapshotBasis,
  ): Promise<RepositoryResult<number>>;
  close(): void;
}>;

const MAX_CORRUPT_EXPORT_BYTES = 32 * 1_024 * 1_024;

export function createIndexedDbDocumentRepository(): DocumentRepository {
  const handle = createMatterDatabaseHandle();
  const database = handle.open;

  return Object.freeze({
    async load(treeId) {
      try {
        const stored: unknown = await (await database()).get("snapshots", treeId);
        if (stored === undefined) return success(null);
        return decodeStoredSnapshot(stored, treeId);
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

    async reserveImportedSnapshot(treeId, treeRevision, bundle, expectedGeneration) {
      const decoded = bundleToTree(bundle);
      if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== treeRevision) {
        return failure("PERSISTENCE_WRITE_FAILED", "Imported material is invalid.");
      }
      try {
        const db = await database();
        const transaction = db.transaction("snapshots", "readwrite");
        const previous = await transaction.store.get(treeId);
        const currentGeneration = previous?.writeGeneration ?? null;
        if (currentGeneration !== expectedGeneration) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_CONFLICT", "Material changed in another tab.");
        }
        const writeGeneration = nextGeneration(currentGeneration);
        if (writeGeneration === null) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_WRITE_FAILED", "The local write generation is exhausted.");
        }
        const imported = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId,
          treeRevision,
          writeGeneration,
          bundle,
          // Import is a document boundary. Its durable inverse journal must
          // match the runtime switch, which also starts with empty history.
          history: createTreeHistory(),
        });
        await transaction.store.put(imported);
        await transaction.done;
        return success(Object.freeze({
          treeId,
          imported,
          previous: previous ?? null,
        }));
      } catch (error) {
        return writeFailure(error);
      }
    },

    async rollbackImportedSnapshot(reservation) {
      try {
        const db = await database();
        const transaction = db.transaction("snapshots", "readwrite");
        const current: unknown = await transaction.store.get(reservation.treeId);
        if (serializeStoredSnapshot(current) !== serializeStoredSnapshot(reservation.imported)) {
          await abortTransaction(transaction);
          return success(Object.freeze({ status: "stale" as const }));
        }
        if (reservation.previous === null) {
          await transaction.store.delete(reservation.treeId);
          await transaction.done;
          return success(Object.freeze({ status: "rolled-back" as const, writeGeneration: null }));
        }
        const writeGeneration = nextGeneration(reservation.imported.writeGeneration);
        if (writeGeneration === null) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_WRITE_FAILED", "The local write generation is exhausted.");
        }
        const restored = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId: reservation.previous.treeId,
          treeRevision: reservation.previous.treeRevision,
          writeGeneration,
          bundle: reservation.previous.bundle,
          ...(reservation.previous.history === undefined ? {} : { history: reservation.previous.history }),
        });
        await transaction.store.put(restored);
        await transaction.done;
        return success(Object.freeze({ status: "rolled-back" as const, writeGeneration }));
      } catch (error) {
        return writeFailure(error);
      }
    },

    async exportCorrupt(treeId) {
      try {
        const stored: unknown = await (await database()).get("snapshots", treeId);
        if (stored === undefined || decodeStoredSnapshot(stored, treeId).ok) {
          return failure("PERSISTENCE_CONFLICT", "Stored material changed before recovery export.");
        }
        const serialized = serializeStoredSnapshot(stored);
        if (serialized === null) {
          return failure("PERSISTENCE_CORRUPT", "The damaged storage row cannot be represented safely.");
        }
        const bytes = new TextEncoder().encode(serialized);
        if (bytes.byteLength > MAX_CORRUPT_EXPORT_BYTES) {
          return failure("PERSISTENCE_CORRUPT", "The damaged storage row exceeds the recovery export bound.");
        }
        return success(Object.freeze({
          basis: Object.freeze({ treeId, serialized }),
          bytes,
        }));
      } catch {
        return failure("PERSISTENCE_UNAVAILABLE", "Local material storage is unavailable.");
      }
    },

    async replaceCorrupt(treeId, treeRevision, bundle, history, basis) {
      const decoded = bundleToTree(bundle);
      if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== treeRevision) {
        return failure("PERSISTENCE_WRITE_FAILED", "Replacement material is invalid.");
      }
      try {
        const db = await database();
        const transaction = db.transaction("snapshots", "readwrite");
        const existing: unknown = await transaction.store.get(treeId);
        const serialized = serializeStoredSnapshot(existing);
        if (
          basis.treeId !== treeId ||
          serialized === null ||
          serialized !== basis.serialized ||
          existing === undefined ||
          decodeStoredSnapshot(existing, treeId).ok
        ) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_CONFLICT", "Stored material changed before recovery replacement.");
        }
        const nextGeneration = nextRecoveryGeneration(existing);
        await transaction.store.put(Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId,
          treeRevision,
          writeGeneration: nextGeneration,
          bundle,
          history,
        }));
        await transaction.done;
        return success(nextGeneration);
      } catch (error) {
        return writeFailure(error);
      }
    },

    close() {
      handle.close();
    },
  });
}

function decodeStoredSnapshot(value: unknown, treeId: string): RepositoryResult<LoadedSnapshot> {
  if (
    !isRecord(value) ||
    value.storageSchemaVersion !== STORAGE_SCHEMA_VERSION ||
    value.treeId !== treeId ||
    !Number.isSafeInteger(value.treeRevision) ||
    !Number.isSafeInteger(value.writeGeneration) ||
    (value.writeGeneration as number) < 1
  ) {
    return failure("PERSISTENCE_CORRUPT", "The stored material metadata is invalid.");
  }
  const decoded = bundleToTree(value.bundle as SnapshotBundle);
  if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== value.treeRevision) {
    return failure("PERSISTENCE_CORRUPT", "The stored Markdown bundle is invalid.");
  }
  return success(Object.freeze({
    tree: decoded.tree,
    history: (value.history as TreeHistory | null | undefined) ?? null,
    writeGeneration: value.writeGeneration as number,
  }));
}

function serializeStoredSnapshot(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function nextRecoveryGeneration(value: unknown): number {
  if (!isRecord(value)) return 1;
  const generation = value.writeGeneration;
  return Number.isSafeInteger(generation) && (generation as number) >= 1 && (generation as number) < Number.MAX_SAFE_INTEGER
    ? (generation as number) + 1
    : 1;
}

function nextGeneration(current: number | null): number | null {
  if (current === null) return 1;
  return Number.isSafeInteger(current) && current >= 1 && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : null;
}

async function abortTransaction(transaction: { abort(): void; done: Promise<unknown> }): Promise<void> {
  transaction.abort();
  try {
    await transaction.done;
  } catch {
    // The deliberate abort is the atomic stale/conflict outcome.
  }
}

function writeFailure(error: unknown): Extract<RepositoryResult<never>, { ok: false }> {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? failure("PERSISTENCE_STORAGE_FULL", "Local material storage is full.")
    : failure("PERSISTENCE_WRITE_FAILED", "The latest material could not be saved locally.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): Extract<RepositoryResult<never>, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
