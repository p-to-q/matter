import {
  createMatterDatabaseHandle,
  STORAGE_SCHEMA_VERSION,
  type StoredInquiryExchange,
  type StoredInquiryRecord,
} from "./matter-database";
import type { RepositoryErrorCode, RepositoryResult } from "./document-repository";
import {
  type InquiryRecordDraft,
  type InquiryRecordVersion,
  inquiryRecordVersion,
  isStoredInquiryRecord,
} from "./inquiry-record-policy";

export { type StoredInquiryExchange, type StoredInquiryRecord };
export { type InquiryRecordDraft, type InquiryRecordVersion } from "./inquiry-record-policy";

export type InquiryRecordRepository = Readonly<{
  load(treeId: string): Promise<RepositoryResult<StoredInquiryRecord | null>>;
  save(
    record: InquiryRecordDraft,
    expectedVersion: InquiryRecordVersion,
  ): Promise<RepositoryResult<InquiryRecordVersion>>;
  clear(treeId: string, expectedVersion: InquiryRecordVersion): Promise<RepositoryResult<InquiryRecordVersion>>;
  close(): void;
}>;

/**
 * Ask Matter records have their own CAS boundary. They must never be written
 * in the material snapshot transaction, because an inquiry cannot change the
 * document or its command history.
 */
export function createIndexedDbInquiryRecordRepository(): InquiryRecordRepository {
  const handle = createMatterDatabaseHandle();
  const database = handle.open;
  return Object.freeze({
    async load(treeId) {
      try {
        const record = await (await database()).get("inquiryRecords", treeId);
        if (record === undefined) return success(null);
        return isStoredInquiryRecord(record, treeId)
          ? success(record)
          : failure("PERSISTENCE_CORRUPT", "The saved Ask Matter record is invalid.");
      } catch {
        return failure("PERSISTENCE_UNAVAILABLE", "Ask Matter storage is unavailable.");
      }
    },
    async save(record, expectedVersion) {
      try {
        if (!isValidDraft(record)) return failure("PERSISTENCE_CORRUPT", "The Ask Matter record is invalid.");
        const db = await database();
        const transaction = db.transaction("inquiryRecords", "readwrite");
        const current = await transaction.store.get(record.treeId);
        if (current !== undefined && !isStoredInquiryRecord(current, record.treeId)) {
          return abortCorrupt(transaction);
        }
        const version = inquiryRecordVersion(current ?? null);
        if (!sameVersion(version, expectedVersion)) return abortConflict(transaction);
        const nextGeneration = nextSafeInteger(version.generation ?? 0);
        if (nextGeneration === null) return abortVersionExhausted(transaction);
        const next = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          ...record,
          writeGeneration: nextGeneration,
          recordEpoch: version.epoch,
          cleared: false,
        });
        await transaction.store.put(Object.freeze({
          ...next,
        }));
        await transaction.done;
        return success(inquiryRecordVersion(next));
      } catch (error) {
        return writeFailure(error);
      }
    },
    async clear(treeId, expectedVersion) {
      try {
        const db = await database();
        const transaction = db.transaction("inquiryRecords", "readwrite");
        const current = await transaction.store.get(treeId);
        if (current !== undefined && !isStoredInquiryRecord(current, treeId)) return abortCorrupt(transaction);
        const version = inquiryRecordVersion(current ?? null);
        if (!sameVersion(version, expectedVersion)) return abortConflict(transaction);
        const nextGeneration = nextSafeInteger(version.generation ?? 0);
        const nextEpoch = nextSafeInteger(version.epoch);
        if (nextGeneration === null || nextEpoch === null) return abortVersionExhausted(transaction);
        const cleared = Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          recordSchemaVersion: 1 as const,
          treeId,
          writeGeneration: nextGeneration,
          recordEpoch: nextEpoch,
          cleared: true,
          exchanges: Object.freeze([]),
        });
        await transaction.store.put(cleared);
        await transaction.done;
        return success(inquiryRecordVersion(cleared));
      } catch (error) {
        return writeFailure(error);
      }
    },
    close: handle.close,
  });
}

async function abortConflict(transaction: { abort: () => void; done: Promise<unknown> }): Promise<RepositoryResult<never>> {
  transaction.abort();
  try { await transaction.done; } catch { /* A deliberate transaction abort is the conflict result. */ }
  return failure("PERSISTENCE_CONFLICT", "Ask Matter changed in another tab.");
}

async function abortCorrupt(transaction: { abort: () => void; done: Promise<unknown> }): Promise<RepositoryResult<never>> {
  transaction.abort();
  try { await transaction.done; } catch { /* The invalid stored value stays untouched for recovery. */ }
  return failure("PERSISTENCE_CORRUPT", "The saved Ask Matter record is invalid.");
}

async function abortVersionExhausted(transaction: { abort: () => void; done: Promise<unknown> }): Promise<RepositoryResult<never>> {
  transaction.abort();
  try { await transaction.done; } catch { /* Exhaustion leaves the last recoverable record untouched. */ }
  return failure("PERSISTENCE_WRITE_FAILED", "Ask Matter storage reached its safe version limit.");
}

function writeFailure(error: unknown): RepositoryResult<never> {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? failure("PERSISTENCE_STORAGE_FULL", "Local Ask Matter storage is full.")
    : failure("PERSISTENCE_WRITE_FAILED", "Ask Matter could not be saved locally.");
}

function isValidDraft(record: InquiryRecordDraft): boolean {
  return isStoredInquiryRecord({
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    ...record,
    writeGeneration: 1,
    recordEpoch: 0,
    cleared: false,
  }, record.treeId);
}

function sameVersion(left: InquiryRecordVersion, right: InquiryRecordVersion): boolean {
  return left.generation === right.generation && left.epoch === right.epoch;
}

function nextSafeInteger(value: number): number | null {
  return value < Number.MAX_SAFE_INTEGER ? value + 1 : null;
}

function success<Value>(value: Value): RepositoryResult<Value> {
  return Object.freeze({ ok: true, value });
}

function failure(code: RepositoryErrorCode, message: string): RepositoryResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
