import type { RepositoryErrorCode, RepositoryResult } from "./document-repository";
import {
  createMatterDatabaseHandle,
  STORAGE_SCHEMA_VERSION,
  WIKI_RECORD_KEY,
  WIKI_RECORD_SCHEMA_VERSION,
  type StoredWikiRecord,
} from "./matter-database";
import { parseWikiState, wikiStateStorageBytes } from "../wiki/wiki-codec";
import {
  createInitialWikiState,
  ensureWikiStarterLexemes,
} from "../wiki/wiki-evidence";
import type { WikiState } from "../wiki/wiki-model";
import { MAX_WIKI_STATE_BYTES } from "../wiki/wiki-model";

export const MAX_STORED_WIKI_BYTES = MAX_WIKI_STATE_BYTES;

export type LoadedWiki = Readonly<{
  state: WikiState;
  writeGeneration: number;
}>;

type ParsedStoredWiki = LoadedWiki & Readonly<{
  recordSchemaVersion: StoredWikiRecord["recordSchemaVersion"];
}>;

export type WikiRepository = Readonly<{
  load(): Promise<RepositoryResult<LoadedWiki | null>>;
  save(
    state: WikiState,
    expectedGeneration: number | null,
  ): Promise<RepositoryResult<number>>;
  resetCorrupt(minimumGeneration: number): Promise<RepositoryResult<LoadedWiki>>;
  close(): void;
}>;

/**
 * Persists one origin-local Wiki with compare-and-swap semantics.
 *
 * The caller compiles and validates a candidate snapshot before saving it. A
 * successful transaction is therefore the linearization point after which an
 * in-memory compiled snapshot may be swapped. Corrupt rows are retained for
 * recovery and are never silently replaced by a valid starter Wiki.
 */
export function createIndexedDbWikiRepository(): WikiRepository {
  const handle = createMatterDatabaseHandle();
  const database = handle.open;

  return Object.freeze({
    async load() {
      try {
        const db = await database();
        const transaction = db.transaction("wiki", "readwrite");
        observeTransactionCompletion(transaction);
        const stored: unknown = await transaction.store.get(WIKI_RECORD_KEY);
        if (stored === undefined) {
          const state = createInitialWikiState();
          const initialized: StoredWikiRecord = Object.freeze({
            storageSchemaVersion: STORAGE_SCHEMA_VERSION,
            recordSchemaVersion: WIKI_RECORD_SCHEMA_VERSION,
            key: WIKI_RECORD_KEY,
            writeGeneration: 1,
            state,
          });
          await transaction.store.put(initialized);
          await transaction.done;
          return success(Object.freeze({ state, writeGeneration: 1 }));
        }
        const parsed = parseStoredWikiRecord(stored);
        if (parsed === null) {
          return abort(transaction, "PERSISTENCE_CORRUPT", "The saved Wiki is invalid.");
        }
        if (parsed.recordSchemaVersion === WIKI_RECORD_SCHEMA_VERSION) {
          await transaction.done;
          return success(toLoadedWiki(parsed));
        }
        const migrated = ensureWikiStarterLexemes(parsed.state);
        if (!migrated.ok || wikiStateStorageBytes(migrated.state) > MAX_STORED_WIKI_BYTES) {
          await transaction.done;
          return success(toLoadedWiki(parsed));
        }
        const writeGeneration = nextGeneration(parsed.writeGeneration);
        if (writeGeneration === null) {
          await transaction.done;
          return success(toLoadedWiki(parsed));
        }
        const initialized: StoredWikiRecord = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          recordSchemaVersion: WIKI_RECORD_SCHEMA_VERSION,
          key: WIKI_RECORD_KEY,
          writeGeneration,
          state: migrated.state,
        });
        try {
          await transaction.store.put(initialized);
          await transaction.done;
        } catch {
          await abandonOptionalMigration(transaction);
          return success(toLoadedWiki(parsed));
        }
        return success(Object.freeze({
          state: migrated.state,
          writeGeneration,
        }));
      } catch {
        return failure("PERSISTENCE_UNAVAILABLE", "Wiki storage is unavailable.");
      }
    },

    async save(state, expectedGeneration) {
      const parsedCandidate = parseWikiState(state);
      if (!parsedCandidate.ok || wikiStateStorageBytes(parsedCandidate.state) > MAX_STORED_WIKI_BYTES) {
        return failure("PERSISTENCE_CORRUPT", "The Wiki candidate is invalid.");
      }
      try {
        const db = await database();
        const transaction = db.transaction("wiki", "readwrite");
        observeTransactionCompletion(transaction);
        const current: unknown = await transaction.store.get(WIKI_RECORD_KEY);
        const parsedCurrent = current === undefined ? null : parseStoredWikiRecord(current);
        if (current !== undefined && parsedCurrent === null) {
          return abort(
            transaction,
            "PERSISTENCE_CORRUPT",
            "The saved Wiki is invalid.",
          );
        }
        const currentGeneration = parsedCurrent?.writeGeneration ?? null;
        if (currentGeneration !== expectedGeneration) {
          return abort(
            transaction,
            "PERSISTENCE_CONFLICT",
            "Wiki changed in another tab.",
          );
        }
        if (
          parsedCurrent !== null &&
          parsedCandidate.state.revision <= parsedCurrent.state.revision
        ) {
          return abort(
            transaction,
            "PERSISTENCE_CONFLICT",
            "Wiki state does not descend from the durable revision.",
          );
        }
        const writeGeneration = nextGeneration(currentGeneration);
        if (writeGeneration === null) {
          return abort(
            transaction,
            "PERSISTENCE_WRITE_FAILED",
            "The Wiki write generation is exhausted.",
          );
        }
        const stored: StoredWikiRecord = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          recordSchemaVersion: WIKI_RECORD_SCHEMA_VERSION,
          key: WIKI_RECORD_KEY,
          writeGeneration,
          state: parsedCandidate.state,
        });
        await transaction.store.put(stored);
        await transaction.done;
        return success(writeGeneration);
      } catch (error) {
        return writeFailure(error);
      }
    },

    async resetCorrupt(minimumGeneration) {
      if (!Number.isSafeInteger(minimumGeneration) || minimumGeneration < 0) {
        return failure("PERSISTENCE_WRITE_FAILED", "The recovery generation is invalid.");
      }
      try {
        const db = await database();
        const transaction = db.transaction("wiki", "readwrite");
        observeTransactionCompletion(transaction);
        const current: unknown = await transaction.store.get(WIKI_RECORD_KEY);
        if (current === undefined || parseStoredWikiRecord(current) !== null) {
          return abort(
            transaction,
            "PERSISTENCE_CONFLICT",
            "Wiki recovery no longer addresses a corrupt record.",
          );
        }
        const corruptGeneration = corruptWriteGeneration(current);
        const currentGeneration = Math.max(corruptGeneration ?? 0, minimumGeneration);
        const writeGeneration = nextGeneration(currentGeneration);
        if (writeGeneration === null) {
          return abort(
            transaction,
            "PERSISTENCE_WRITE_FAILED",
            "The Wiki write generation is exhausted.",
          );
        }
        const state = createInitialWikiState();
        const stored: StoredWikiRecord = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          recordSchemaVersion: WIKI_RECORD_SCHEMA_VERSION,
          key: WIKI_RECORD_KEY,
          writeGeneration,
          state,
        });
        await transaction.store.put(stored);
        await transaction.done;
        return success(Object.freeze({ state, writeGeneration }));
      } catch (error) {
        return writeFailure(error);
      }
    },

    close: handle.close,
  });
}

function parseStoredWikiRecord(value: unknown): ParsedStoredWiki | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "storageSchemaVersion",
    "recordSchemaVersion",
    "key",
    "writeGeneration",
    "state",
  ])) return null;
  if (
    value.storageSchemaVersion !== STORAGE_SCHEMA_VERSION ||
    (value.recordSchemaVersion !== 1 && value.recordSchemaVersion !== 2 &&
      value.recordSchemaVersion !== 3 &&
      value.recordSchemaVersion !== WIKI_RECORD_SCHEMA_VERSION) ||
    value.key !== WIKI_RECORD_KEY ||
    !Number.isSafeInteger(value.writeGeneration) ||
    (value.writeGeneration as number) < 1 ||
    wikiStateStorageBytes(value.state) > MAX_STORED_WIKI_BYTES
  ) return null;
  const parsed = parseWikiState(value.state);
  return parsed.ok
    ? Object.freeze({
        state: parsed.state,
        writeGeneration: value.writeGeneration as number,
        recordSchemaVersion: value.recordSchemaVersion as StoredWikiRecord["recordSchemaVersion"],
      })
    : null;
}

function toLoadedWiki(parsed: ParsedStoredWiki): LoadedWiki {
  return Object.freeze({
    state: parsed.state,
    writeGeneration: parsed.writeGeneration,
  });
}

async function abort(
  transaction: Readonly<{ abort(): void; done: Promise<unknown> }>,
  code: RepositoryErrorCode,
  message: string,
): Promise<RepositoryResult<never>> {
  transaction.abort();
  try {
    await transaction.done;
  } catch {
    // A deliberate abort leaves the previous durable Wiki untouched.
  }
  return failure(code, message);
}

function nextGeneration(current: number | null): number | null {
  if (current === Number.MAX_SAFE_INTEGER) return null;
  return (current ?? 0) + 1;
}

function corruptWriteGeneration(value: unknown): number | null {
  if (!isPlainObject(value)) return null;
  return Number.isSafeInteger(value.writeGeneration) &&
    (value.writeGeneration as number) >= 1
    ? value.writeGeneration as number
    : null;
}

function observeTransactionCompletion(
  transaction: Readonly<{ done: Promise<unknown> }>,
): void {
  void transaction.done.catch(() => undefined);
}

async function abandonOptionalMigration(
  transaction: Readonly<{ abort(): void; done: Promise<unknown> }>,
): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // IndexedDB may already have aborted the failed optional migration.
  }
  try {
    await transaction.done;
  } catch {
    // A failed starter migration must not make an otherwise valid Wiki unreadable.
  }
}

function writeFailure(error: unknown): RepositoryResult<never> {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? failure("PERSISTENCE_STORAGE_FULL", "Local Wiki storage is full.")
    : failure("PERSISTENCE_WRITE_FAILED", "Wiki could not be saved locally.");
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): RepositoryResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
