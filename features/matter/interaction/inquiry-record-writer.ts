import type {
  InquiryRecordRepository,
  StoredInquiryExchange,
  StoredInquiryRecord,
} from "../persistence/inquiry-record-repository";
import {
  appendInquiryExchange,
  inquiryRecordVersion,
  type InquiryRecordVersion,
} from "../persistence/inquiry-record-policy";
import type { RepositoryErrorCode } from "../persistence/document-repository";
import { reconcileInquiryAppend, reconcileInquiryClear } from "./inquiry-record-reconciliation";

export type InquiryRecordAppendBasis = Readonly<{
  version: InquiryRecordVersion;
  exchanges: readonly StoredInquiryExchange[];
}>;

export type InquiryRecordAppendResult =
  | Readonly<{
    ok: true;
    value: Readonly<{
      version: InquiryRecordVersion;
      exchanges: readonly StoredInquiryExchange[];
    }>;
  }>
  | Readonly<{ ok: false; error: RepositoryErrorCode }>;

export type InquiryRecordWriter = Readonly<{
  append(
    treeId: string,
    exchange: StoredInquiryExchange,
    basis: InquiryRecordAppendBasis | null,
  ): Promise<InquiryRecordAppendResult>;
  clear(
    treeId: string,
    version: InquiryRecordVersion,
  ): Promise<{ ok: true; value: InquiryRecordVersion } | { ok: false; error: RepositoryErrorCode }>;
  whenIdle(): Promise<void>;
}>;

/** Normalizes replaceable repository adapters to the repository result seam. */
export async function loadInquiryRecord(
  repository: InquiryRecordRepository,
  treeId: string,
): ReturnType<InquiryRecordRepository["load"]> {
  try {
    return await repository.load(treeId);
  } catch {
    return Object.freeze({
      ok: false as const,
      error: Object.freeze({
        code: "PERSISTENCE_UNAVAILABLE" as const,
        message: "Ask Matter storage is unavailable.",
      }),
    });
  }
}

/**
 * Durable record work belongs to the tree that accepted the exchange, not to
 * whichever tree the view happens to show when storage settles. Serializing
 * here also gives a load-pending append a stable CAS basis without coupling it
 * to a React effect's lifetime.
 */
export function createInquiryRecordWriter(
  repository: InquiryRecordRepository,
): InquiryRecordWriter {
  let tail = Promise.resolve();

  function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return Object.freeze({
    append(treeId, exchange, basis) {
      return enqueue(async () => {
        let resolvedBasis = basis;
        if (resolvedBasis === null) {
          const loaded = await loadInquiryRecord(repository, treeId);
          if (!loaded.ok) return { ok: false as const, error: loaded.error.code };
          resolvedBasis = Object.freeze({
            version: inquiryRecordVersion(loaded.value),
            exchanges: loaded.value?.exchanges ?? Object.freeze([]),
          });
        }

        const exchanges = appendInquiryExchange(resolvedBasis.exchanges, exchange);
        if (exchanges === null || exchange.basis.treeId !== treeId) {
          return { ok: false as const, error: "PERSISTENCE_CORRUPT" as const };
        }
        return saveAppend(repository, treeId, exchange, exchanges, resolvedBasis.version);
      });
    },
    clear(treeId, version) {
      return enqueue(() => clearRecord(repository, treeId, version));
    },
    whenIdle() {
      return tail;
    },
  });
}

async function saveAppend(
  repository: InquiryRecordRepository,
  treeId: string,
  exchange: StoredInquiryExchange,
  initialExchanges: readonly StoredInquiryExchange[],
  attemptedVersion: InquiryRecordVersion,
): Promise<InquiryRecordAppendResult> {
  let record: StoredInquiryRecord | null = null;
  let draft = Object.freeze({ recordSchemaVersion: 1 as const, treeId, exchanges: initialExchanges });
  let version = attemptedVersion;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let saved;
    try {
      saved = await repository.save(draft, version);
    } catch {
      return { ok: false, error: "PERSISTENCE_WRITE_FAILED" };
    }
    if (saved.ok) return { ok: true, value: { version: saved.value, exchanges: draft.exchanges } };
    if (saved.error.code !== "PERSISTENCE_CONFLICT") return { ok: false, error: saved.error.code };
    let loaded;
    try {
      loaded = await repository.load(treeId);
    } catch {
      return { ok: false, error: "PERSISTENCE_UNAVAILABLE" };
    }
    if (!loaded.ok) return { ok: false, error: loaded.error.code };
    record = loaded.value;
    const reconciliation = reconcileInquiryAppend(record, attemptedVersion, exchange);
    if (reconciliation.kind === "discarded-after-clear") {
      return { ok: true, value: { version: inquiryRecordVersion(record), exchanges: record?.exchanges ?? [] } };
    }
    version = reconciliation.version;
    draft = reconciliation.draft;
  }
  return { ok: false, error: "PERSISTENCE_CONFLICT" };
}

async function clearRecord(
  repository: InquiryRecordRepository,
  treeId: string,
  attemptedVersion: InquiryRecordVersion,
): Promise<{ ok: true; value: InquiryRecordVersion } | { ok: false; error: RepositoryErrorCode }> {
  let version = attemptedVersion;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let cleared;
    try {
      cleared = await repository.clear(treeId, version);
    } catch {
      return { ok: false, error: "PERSISTENCE_WRITE_FAILED" };
    }
    if (cleared.ok) return cleared;
    if (cleared.error.code !== "PERSISTENCE_CONFLICT") return { ok: false, error: cleared.error.code };
    let loaded;
    try {
      loaded = await repository.load(treeId);
    } catch {
      return { ok: false, error: "PERSISTENCE_UNAVAILABLE" };
    }
    if (!loaded.ok) return { ok: false, error: loaded.error.code };
    const reconciliation = reconcileInquiryClear(loaded.value);
    if (reconciliation.kind === "already-cleared") return { ok: true, value: reconciliation.version };
    version = reconciliation.version;
  }
  return { ok: false, error: "PERSISTENCE_CONFLICT" };
}
