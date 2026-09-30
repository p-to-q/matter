import type { IDBPDatabase, IDBPObjectStore } from "idb";
import { bundleToTree, type SnapshotBundle } from "./snapshot-codec";
import {
  CLEARED_DATABASE_ERROR,
  createMatterDatabaseHandle,
  retainNewestModelLabels,
  STORAGE_SCHEMA_VERSION,
  SUPERSEDED_DATABASE_ERROR,
} from "./matter-database";
import type {
  MatterDatabase,
  MatterDatabaseLifecycle,
  StoredSnapshot,
} from "./matter-database";
import {
  assembleHistoryJournal,
  emptyHistoryJournal,
  historyJournalManifest,
  historyReadRange,
  nextHistoryEpoch,
  planHistoryJournalWrite,
  readHistoryManifest,
  type HistoryRetention,
  type HistoryStackName,
  type PersistedHistoryJournal,
} from "./history-journal";
import { parseLegacyHistory, type RecoveredHistory } from "./history-recovery";
import { isPlainRecord } from "./stored-value";
import type { ThoughtTree } from "../tree/model";
import { MATTER_HISTORY_LIMITS, type TreeHistory } from "../tree/history";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

export { STORAGE_SCHEMA_VERSION };
export type { StoredSnapshot };

/**
 * `PERSISTENCE_SUPERSEDED` and `PERSISTENCE_CLEARED` are terminal for this
 * tab: a newer schema owns the database, or another tab deleted it. Nothing
 * this build writes may land after either.
 */
export type RepositoryErrorCode =
  | "PERSISTENCE_UNAVAILABLE"
  | "PERSISTENCE_CORRUPT"
  | "PERSISTENCE_CONFLICT"
  | "PERSISTENCE_STORAGE_FULL"
  | "PERSISTENCE_WRITE_FAILED"
  | "PERSISTENCE_SUPERSEDED"
  | "PERSISTENCE_CLEARED";

export type RepositoryResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Readonly<{ code: RepositoryErrorCode; message: string }> }>;

/**
 * What one stored row is known to contain: its CAS generation and the exact
 * journal layout its manifest describes. The two change only together.
 */
export type SnapshotBasis = Readonly<{
  writeGeneration: number | null;
  journal: PersistedHistoryJournal;
}>;

export type LoadedSnapshot = Readonly<{
  tree: ThoughtTree;
  history: RecoveredHistory;
  basis: SnapshotBasis & Readonly<{ writeGeneration: number }>;
}>;

export type SnapshotWrite = Readonly<{
  treeId: string;
  treeRevision: number;
  bundle: SnapshotBundle;
  basis: SnapshotBasis;
  history: TreeHistory;
  retention: HistoryRetention;
}>;

/** The cheapest read that tells whether another tab moved a row on. */
export type StoredGeneration = Readonly<{
  writeGeneration: number;
  storageSchemaVersion: number;
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
  /** The basis the runtime adopts if this import is activated. */
  basis: SnapshotBasis & Readonly<{ writeGeneration: number }>;
}>;

export type ImportedSnapshotRollback =
  | Readonly<{ status: "rolled-back"; writeGeneration: number | null }>
  | Readonly<{ status: "stale" }>;

export type DocumentRepository = Readonly<{
  load(treeId: string): Promise<RepositoryResult<LoadedSnapshot | null>>;
  readGeneration(treeId: string): Promise<RepositoryResult<StoredGeneration | null>>;
  save(write: SnapshotWrite): Promise<RepositoryResult<SnapshotBasis>>;
  /** Shrinks recomputable caches in the same database; never a human decision. */
  reclaimDerivedStorage(): Promise<boolean>;
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
    write: Omit<SnapshotWrite, "basis">,
    basis: CorruptSnapshotBasis,
  ): Promise<RepositoryResult<SnapshotBasis>>;
  subscribeLifecycle(listener: (event: MatterDatabaseLifecycle) => void): () => void;
  close(): void;
}>;

type DocumentStores = ["snapshots", "historyEntries"];
type TransactionLike = Readonly<{ error: DOMException | null }>;

const DOCUMENT_STORES: DocumentStores = ["snapshots", "historyEntries"];
const MAX_CORRUPT_EXPORT_BYTES = 32 * 1_024 * 1_024;
/** Under quota the model-label cache keeps one maximum document's worth. */
const RECLAIMED_MODEL_LABELS = MAX_NODES_PER_TREE;

/**
 * The snapshot row and its undo journal records move together: every write of
 * `historyEntries` happens inside the readwrite transaction that compares and
 * writes the row whose manifest describes them. Nothing else writes that store.
 */
export function createIndexedDbDocumentRepository(): DocumentRepository {
  const lifecycleListeners = new Set<(event: MatterDatabaseLifecycle) => void>();
  const handle = createMatterDatabaseHandle({
    waitWhenBlocked: true,
    onLifecycle(event) {
      for (const listener of lifecycleListeners) listener(event);
    },
  });

  /**
   * Runs one storage operation. A connection WebKit reports as lost is dropped
   * and the operation is retried once on a fresh one; every transaction here is
   * guarded by its own CAS, so a retry can never apply a write twice.
   */
  const withDatabase = async <Value>(
    operation: (
      database: IDBPDatabase<MatterDatabase>,
      track: <Transaction extends TransactionLike>(transaction: Transaction) => Transaction,
    ) => Promise<RepositoryResult<Value>>,
    classify: (error: unknown, transaction: TransactionLike | null) => RepositoryResult<Value>,
  ): Promise<RepositoryResult<Value>> => {
    for (let attempt = 0; ; attempt += 1) {
      let transaction: TransactionLike | null = null;
      const track = <Transaction extends TransactionLike>(tracked: Transaction) => {
        transaction = tracked;
        return tracked;
      };
      try {
        return await operation(await handle.open(), track);
      } catch (error) {
        const terminal = terminalFailure(error);
        if (terminal !== null) return terminal;
        if (attempt === 0 && isConnectionLost(error, transaction)) {
          handle.reset();
          continue;
        }
        return classify(error, transaction);
      }
    }
  };

  return Object.freeze({
    load(treeId) {
      return withDatabase(async (database, track) => {
        const transaction = track(database.transaction(DOCUMENT_STORES, "readonly"));
        const stored: unknown = await transaction.objectStore("snapshots").get(treeId);
        if (stored === undefined) {
          await transaction.done;
          return success(null);
        }
        const decoded = decodeStoredSnapshot(stored, treeId);
        if (!decoded.ok) {
          await transaction.done;
          return decoded;
        }
        const row = stored as StoredSnapshot;
        const manifest = readHistoryManifest(row);
        if (manifest.status !== "journal") {
          await transaction.done;
          const legacy = parseLegacyHistory(row.history, treeId, MATTER_HISTORY_LIMITS);
          return success(Object.freeze({
            tree: decoded.value,
            // A present but unusable manifest means stored steps existed.
            history: manifest.status === "unusable"
              ? Object.freeze({ history: legacy.history, released: true })
              : legacy,
            basis: Object.freeze({
              writeGeneration: row.writeGeneration,
              journal: emptyHistoryJournal(nextHistoryEpoch(row)),
            }),
          }));
        }
        const entries = transaction.objectStore("historyEntries");
        const [undoRecords, redoRecords] = await Promise.all([
          readStack(entries, treeId, manifest.manifest.epoch, "undo", manifest.manifest.undo),
          readStack(entries, treeId, manifest.manifest.epoch, "redo", manifest.manifest.redo),
        ]);
        await transaction.done;
        const assembled = assembleHistoryJournal(
          treeId,
          manifest.manifest,
          undoRecords,
          redoRecords,
          MATTER_HISTORY_LIMITS,
        );
        return success(Object.freeze({
          tree: decoded.value,
          history: assembled.recovered,
          basis: Object.freeze({ writeGeneration: row.writeGeneration, journal: assembled.journal }),
        }));
      }, unavailable);
    },

    readGeneration(treeId) {
      return withDatabase(async (database) => {
        const stored: unknown = await database.get("snapshots", treeId);
        if (
          !isPlainRecord(stored) ||
          !Number.isSafeInteger(stored.writeGeneration) ||
          !Number.isSafeInteger(stored.storageSchemaVersion)
        ) return success(null);
        return success(Object.freeze({
          writeGeneration: stored.writeGeneration as number,
          storageSchemaVersion: stored.storageSchemaVersion as number,
        }));
      }, unavailable);
    },

    save({ treeId, treeRevision, bundle, basis, history, retention }) {
      const plan = planHistoryJournalWrite(treeId, basis.journal, history, retention);
      return withDatabase(async (database, track) => {
        const transaction = track(database.transaction(DOCUMENT_STORES, "readwrite"));
        const snapshots = transaction.objectStore("snapshots");
        const existing: unknown = await snapshots.get(treeId);
        if (isNewerSchema(existing)) {
          await abortTransaction(transaction);
          return superseded();
        }
        if (existing === undefined && basis.writeGeneration !== null) {
          await abortTransaction(transaction);
          return cleared();
        }
        const currentGeneration = existing === undefined ? null : generationOf(existing);
        if (currentGeneration !== basis.writeGeneration) {
          await abortTransaction(transaction);
          // Two tabs can commit the same revision with the same bytes (both
          // relocalizing an untouched seed, say). That is not a conflict: the
          // stored row already holds this material. The journal basis starts
          // empty, so the next save rewrites this tab's steps whole.
          if (holdsSameMaterial(existing, treeId, treeRevision, bundle)) {
            return success(Object.freeze({
              writeGeneration: currentGeneration as number,
              journal: emptyHistoryJournal(nextHistoryEpoch(existing)),
            }));
          }
          return failure("PERSISTENCE_CONFLICT", "Material changed in another tab.");
        }
        const writeGeneration = nextGeneration(currentGeneration);
        if (writeGeneration === null) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_WRITE_FAILED", "The local write generation is exhausted.");
        }
        const entries = transaction.objectStore("historyEntries");
        await commitWrites(transaction, () => [
          snapshots.put(snapshotRow(treeId, treeRevision, writeGeneration, bundle, plan.journal)),
          ...plan.records.map((record) => entries.put(record)),
          ...compactionRanges(treeId, plan.journal).map((range) => entries.delete(range)),
        ]);
        return success(Object.freeze({ writeGeneration, journal: plan.journal }));
      }, writeFailure);
    },

    async reclaimDerivedStorage() {
      const reclaimed = await withDatabase(async (database, track) => {
        const transaction = track(database.transaction("labels", "readwrite"));
        const deleted = await retainNewestModelLabels(transaction.store, RECLAIMED_MODEL_LABELS);
        await transaction.done;
        return success(deleted > 0);
      }, unavailable);
      return reclaimed.ok && reclaimed.value;
    },

    reserveImportedSnapshot(treeId, treeRevision, bundle, expectedGeneration) {
      const decoded = bundleToTree(bundle);
      if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== treeRevision) {
        return Promise.resolve(failure("PERSISTENCE_WRITE_FAILED", "Imported material is invalid."));
      }
      return withDatabase(async (database, track) => {
        const transaction = track(database.transaction(DOCUMENT_STORES, "readwrite"));
        const snapshots = transaction.objectStore("snapshots");
        const previous = await snapshots.get(treeId);
        if (isNewerSchema(previous)) {
          await abortTransaction(transaction);
          return superseded();
        }
        if (previous === undefined && expectedGeneration !== null) {
          await abortTransaction(transaction);
          return cleared();
        }
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
        // Import is a document boundary: the runtime switch starts with empty
        // history, so the row starts a new, empty journal epoch. The previous
        // epoch's records stay untouched until rollback can no longer need them.
        const journal = emptyHistoryJournal(nextHistoryEpoch(previous));
        const imported = snapshotRow(treeId, treeRevision, writeGeneration, bundle, journal);
        await commitWrites(transaction, () => [snapshots.put(imported)]);
        return success(Object.freeze({
          treeId,
          imported,
          previous: previous ?? null,
          basis: Object.freeze({ writeGeneration, journal }),
        }));
      }, writeFailure);
    },

    rollbackImportedSnapshot(reservation) {
      return withDatabase<ImportedSnapshotRollback>(async (database, track) => {
        const transaction = track(database.transaction(DOCUMENT_STORES, "readwrite"));
        const snapshots = transaction.objectStore("snapshots");
        const current: unknown = await snapshots.get(reservation.treeId);
        if (serializeStoredSnapshot(current) !== serializeStoredSnapshot(reservation.imported)) {
          await abortTransaction(transaction);
          return success(Object.freeze({ status: "stale" as const }));
        }
        if (reservation.previous === null) {
          await commitWrites(transaction, () => [snapshots.delete(reservation.treeId)]);
          return success(Object.freeze({ status: "rolled-back" as const, writeGeneration: null }));
        }
        const writeGeneration = nextGeneration(reservation.imported.writeGeneration);
        if (writeGeneration === null) {
          await abortTransaction(transaction);
          return failure("PERSISTENCE_WRITE_FAILED", "The local write generation is exhausted.");
        }
        const previous = reservation.previous;
        await commitWrites(transaction, () => [snapshots.put(restoredRow(previous, writeGeneration))]);
        return success(Object.freeze({ status: "rolled-back" as const, writeGeneration }));
      }, writeFailure);
    },

    exportCorrupt(treeId) {
      return withDatabase(async (database) => {
        const stored: unknown = await database.get("snapshots", treeId);
        if (isNewerSchema(stored)) return superseded();
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
      }, unavailable);
    },

    replaceCorrupt({ treeId, treeRevision, bundle, history, retention }, basis) {
      const decoded = bundleToTree(bundle);
      if (!decoded.ok || decoded.tree.id !== treeId || decoded.tree.revision !== treeRevision) {
        return Promise.resolve(failure("PERSISTENCE_WRITE_FAILED", "Replacement material is invalid."));
      }
      return withDatabase(async (database, track) => {
        const transaction = track(database.transaction(DOCUMENT_STORES, "readwrite"));
        const snapshots = transaction.objectStore("snapshots");
        const existing: unknown = await snapshots.get(treeId);
        // A row from a newer schema is not damaged; repairing it would let
        // this older build overwrite valid newer material.
        if (isNewerSchema(existing)) {
          await abortTransaction(transaction);
          return superseded();
        }
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
        const writeGeneration = nextRecoveryGeneration(existing);
        // The damaged row's journal is never trusted: the replacement writes
        // its whole journal into a fresh epoch and compacts everything else.
        const plan = planHistoryJournalWrite(
          treeId,
          emptyHistoryJournal(nextHistoryEpoch(existing)),
          history,
          retention,
        );
        const entries = transaction.objectStore("historyEntries");
        await commitWrites(transaction, () => [
          snapshots.put(snapshotRow(treeId, treeRevision, writeGeneration, bundle, plan.journal)),
          ...plan.records.map((record) => entries.put(record)),
          ...compactionRanges(treeId, plan.journal).map((range) => entries.delete(range)),
        ]);
        return success(Object.freeze({ writeGeneration, journal: plan.journal }));
      }, writeFailure);
    },

    subscribeLifecycle(listener) {
      lifecycleListeners.add(listener);
      return () => lifecycleListeners.delete(listener);
    },

    close() {
      lifecycleListeners.clear();
      handle.close();
    },
  });
}

function snapshotRow(
  treeId: string,
  treeRevision: number,
  writeGeneration: number,
  bundle: SnapshotBundle,
  journal: PersistedHistoryJournal,
): StoredSnapshot {
  return Object.freeze({
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    treeId,
    treeRevision,
    writeGeneration,
    bundle,
    historyJournal: historyJournalManifest(journal, writeGeneration, treeRevision),
  });
}

/** Restores a replaced row exactly, under a newer generation. */
function restoredRow(previous: StoredSnapshot, writeGeneration: number): StoredSnapshot {
  return Object.freeze({
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    treeId: previous.treeId,
    treeRevision: previous.treeRevision,
    writeGeneration,
    bundle: previous.bundle,
    ...(previous.historyJournal === undefined
      ? {}
      : { historyJournal: Object.freeze({ ...previous.historyJournal, writeGeneration }) }),
    ...(previous.history === undefined ? {} : { history: previous.history }),
  });
}

function readStack(
  entries: IDBPObjectStore<MatterDatabase, DocumentStores, "historyEntries", "readonly">,
  treeId: string,
  epoch: number,
  stack: HistoryStackName,
  range: readonly [number, number],
): Promise<unknown[]> {
  const [first, end] = historyReadRange(range, MATTER_HISTORY_LIMITS);
  if (first === end) return Promise.resolve([]);
  return entries.getAll(IDBKeyRange.bound(
    [treeId, epoch, stack, first],
    [treeId, epoch, stack, end],
    false,
    true,
  ));
}

/**
 * Every record of this tree outside the manifest: other epochs, and positions
 * below or above each live stack. Orphans from a rolled-back import or from a
 * writer that left the manifest behind are therefore reclaimed by any save.
 */
function compactionRanges(treeId: string, journal: PersistedHistoryJournal): IDBKeyRange[] {
  const { epoch } = journal;
  const ranges = [
    IDBKeyRange.bound([treeId, -Infinity], [treeId, epoch], false, true),
    IDBKeyRange.bound([treeId, epoch + 1], [treeId, Infinity]),
  ];
  for (const stack of ["undo", "redo"] as const) {
    const { first, entries } = journal[stack];
    ranges.push(
      IDBKeyRange.bound([treeId, epoch, stack, -Infinity], [treeId, epoch, stack, first], false, true),
      IDBKeyRange.bound([treeId, epoch, stack, first + entries.length], [treeId, epoch, stack, Infinity]),
    );
  }
  return ranges;
}

function decodeStoredSnapshot(value: unknown, treeId: string): RepositoryResult<ThoughtTree> {
  if (isNewerSchema(value)) return superseded();
  if (
    !isPlainRecord(value) ||
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
  return success(decoded.tree);
}

/** A newer build's row is valid material this build cannot read, not damage. */
function isNewerSchema(value: unknown): boolean {
  return isPlainRecord(value) &&
    Number.isSafeInteger(value.storageSchemaVersion) &&
    (value.storageSchemaVersion as number) > STORAGE_SCHEMA_VERSION;
}

function generationOf(value: unknown): unknown {
  return isPlainRecord(value) ? value.writeGeneration : undefined;
}

function holdsSameMaterial(
  value: unknown,
  treeId: string,
  treeRevision: number,
  bundle: SnapshotBundle,
): boolean {
  if (
    !isPlainRecord(value) ||
    value.storageSchemaVersion !== STORAGE_SCHEMA_VERSION ||
    value.treeId !== treeId ||
    value.treeRevision !== treeRevision ||
    !Number.isSafeInteger(value.writeGeneration) ||
    (value.writeGeneration as number) < 1 ||
    !isPlainRecord(value.bundle) ||
    !isPlainRecord(value.bundle.files)
  ) return false;
  const stored = value.bundle.files;
  const files = bundle.files as Readonly<Record<string, string>>;
  const paths = Object.keys(files);
  if (Object.keys(stored).length !== paths.length) return false;
  return paths.every((path) => Object.hasOwn(stored, path) && stored[path] === files[path]);
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
  if (!isPlainRecord(value)) return 1;
  const generation = value.writeGeneration;
  return Number.isSafeInteger(generation) && (generation as number) >= 1 && (generation as number) < Number.MAX_SAFE_INTEGER
    ? (generation as number) + 1
    : 1;
}

function nextGeneration(current: unknown): number | null {
  if (current === null) return 1;
  return typeof current === "number" && Number.isSafeInteger(current) && current >= 1 && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : null;
}

/**
 * A request that fails asynchronously aborts its transaction, but one that
 * throws while being issued (clone, key, or quota refusal) does not: requests
 * already issued would then commit alone. Any throw aborts the whole write.
 */
async function commitWrites(
  transaction: { abort(): void; done: Promise<unknown> },
  issue: () => readonly Promise<unknown>[],
): Promise<void> {
  let requests: readonly Promise<unknown>[];
  try {
    requests = issue();
  } catch (error) {
    await abortTransaction(transaction);
    throw error;
  }
  await Promise.all([...requests, transaction.done]);
}

async function abortTransaction(transaction: { abort(): void; done: Promise<unknown> }): Promise<void> {
  transaction.abort();
  try {
    await transaction.done;
  } catch {
    // The deliberate abort is the atomic stale/conflict outcome.
  }
}

/**
 * A quota refusal may surface on the request or only as the transaction's
 * abort reason, so the transaction's own error is consulted first.
 */
function writeFailure(
  error: unknown,
  transaction: TransactionLike | null,
): Extract<RepositoryResult<never>, { ok: false }> {
  return isQuotaError(transactionError(transaction)) || isQuotaError(error)
    ? failure("PERSISTENCE_STORAGE_FULL", "Local material storage is full.")
    : failure("PERSISTENCE_WRITE_FAILED", "The latest material could not be saved locally.");
}

function unavailable(): Extract<RepositoryResult<never>, { ok: false }> {
  return failure("PERSISTENCE_UNAVAILABLE", "Local material storage is unavailable.");
}

function superseded(): Extract<RepositoryResult<never>, { ok: false }> {
  return failure("PERSISTENCE_SUPERSEDED", "A newer Matter owns local material storage.");
}

/**
 * A row this tab held a generation for is gone, or the database was deleted:
 * storage was cleared, by another tab or by the browser. Writing would
 * resurrect material the person removed, so the save stops here.
 */
function cleared(): Extract<RepositoryResult<never>, { ok: false }> {
  return failure("PERSISTENCE_CLEARED", "Local material storage was cleared.");
}

function terminalFailure(error: unknown): Extract<RepositoryResult<never>, { ok: false }> | null {
  if (!(error instanceof Error)) return null;
  if (error.name === SUPERSEDED_DATABASE_ERROR) return superseded();
  if (error.name === CLEARED_DATABASE_ERROR) return cleared();
  return null;
}

function transactionError(transaction: TransactionLike | null): unknown {
  try {
    return transaction?.error ?? null;
  } catch {
    // Reading `error` on a still-active transaction throws in some engines.
    return null;
  }
}

/** WebKit reports a full disk as an `UnknownError`, not a quota error. */
function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    (error.name === "UnknownError" && /disk is full/iu.test(error.message))
  );
}

function isConnectionLost(error: unknown, transaction: TransactionLike | null): boolean {
  return [error, transactionError(transaction)].some((candidate) =>
    candidate instanceof DOMException &&
    candidate.name === "UnknownError" &&
    /connection to indexed database server lost/iu.test(candidate.message));
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): Extract<RepositoryResult<never>, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
