import {
  createMatterDatabaseHandle,
  labelKey,
  MAX_CACHED_MODEL_LABELS,
  retainNewestModelLabels,
  STORAGE_SCHEMA_VERSION,
  type MatterDatabase,
  type StoredLabel,
  type StoredLabelOrigin,
} from "./matter-database";
import type { IDBPDatabase } from "idb";
import { isCanonicalTimestamp, isMaterialId, MAX_NODES_PER_TREE } from "../tree/invariants";
import { isWellFormedUnicodeText } from "../tree/unicode-text";

/**
 * Durable storage for labels that cost something to produce.
 *
 * A model answer is stored so a node is named once rather than once per
 * reload, and a name a person typed is stored because losing it would lose
 * their work. A provisional label is never stored: it is a pure function of the
 * material and recomputing it is cheaper than reading it back.
 *
 * This store is a cache with one exception. Losing a model label costs a
 * regeneration; losing a manual name costs a person's decision, which is why a
 * manual name is written before it is shown and is never evicted while its node
 * exists.
 *
 * Every method is best effort. Storage may be unavailable, full, or blocked by
 * another tab, and none of that may stop a thought from being named.
 */

export type LabelRecord = Readonly<{
  nodeId: string;
  label: string;
  origin: StoredLabelOrigin;
  basis: string | null;
  updatedAt: string;
}>;

/**
 * Whether a durable label mutation reached disk.
 *
 * A model label ignores this: losing one costs a regeneration. A name a person
 * typed cannot, because the same swallowed failure that costs nothing there
 * costs a decision here — the name was shown as taken, and after a reload it
 * was gone with no signal that anything had failed.
 */
export type LabelWriteReceipt =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "STORAGE_UNAVAILABLE" | "STORAGE_FULL" | "REJECTED" }>;

const WRITTEN: LabelWriteReceipt = Object.freeze({ ok: true });
const REJECTED: LabelWriteReceipt = Object.freeze({ ok: false, code: "REJECTED" });

export type LabelRepository = Readonly<{
  loadAll(treeId: string, liveNodeIds: readonly string[]): Promise<readonly LabelRecord[]>;
  put(treeId: string, record: LabelRecord): Promise<LabelWriteReceipt>;
  remove(treeId: string, nodeIds: readonly string[]): Promise<LabelWriteReceipt>;
  clear(treeId: string): Promise<void>;
  close(): void;
}>;

export { MAX_CACHED_MODEL_LABELS } from "./matter-database";
export const MAX_STORED_LABEL_CODE_UNITS = 64;
const MAX_STORED_LABEL_BASIS_CODE_UNITS = 64;

export function createIndexedDbLabelRepository(): LabelRepository {
  const handle = createMatterDatabaseHandle();

  return Object.freeze({
    async loadAll(treeId, liveNodeIds) {
      // The tree bound is also the storage-read bound. Refuse malformed input
      // before opening IndexedDB rather than letting stale rows turn restore
      // into an unbounded scan.
      if (
        !isMaterialId(treeId) || liveNodeIds.length === 0 ||
        liveNodeIds.length > MAX_NODES_PER_TREE ||
        liveNodeIds.some((nodeId) => !isMaterialId(nodeId))
      ) {
        return Object.freeze([]);
      }
      const nodeIds = [...new Set(liveNodeIds)];
      try {
        const database = await handle.open();
        const transaction = database.transaction("labels", "readonly");
        // Queue every request before awaiting one. IndexedDB may auto-commit a
        // transaction once control returns to the event loop.
        const stored = await Promise.all(nodeIds.map(
          (nodeId) => transaction.store.get(labelKey(treeId, nodeId)),
        ));
        await transaction.done;
        const records: LabelRecord[] = [];
        for (let index = 0; index < nodeIds.length; index += 1) {
          const record = toRecord(stored[index], treeId);
          if (record === null || record.nodeId !== nodeIds[index]) continue;
          records.push(record);
        }
        return Object.freeze(records);
      } catch {
        return Object.freeze([]);
      }
    },

    async put(treeId, record) {
      if (!isMaterialId(treeId) || !isStorable(record)) return REJECTED;
      const stored = Object.freeze({
        storageSchemaVersion: STORAGE_SCHEMA_VERSION,
        key: labelKey(treeId, record.nodeId),
        treeId,
        nodeId: record.nodeId,
        label: record.label,
        origin: record.origin,
        basis: record.basis,
        updatedAt: record.updatedAt,
      });
      try {
        const database = await handle.open();
        if (record.origin === "model") await putModelLabel(database, stored);
        else await database.put("labels", stored);
        return WRITTEN;
      } catch (error) {
        if (record.origin === "user" && isStorageFull(error)) {
          try {
            const database = await handle.open();
            // Derived labels may be regenerated; a person's name may not. A
            // quota retry therefore sacrifices only model cache entries.
            const transaction = database.transaction("labels", "readwrite");
            await retainNewestModelLabels(transaction.store, 0);
            await transaction.store.put(stored);
            await transaction.done;
            return WRITTEN;
          } catch (retryError) {
            return storageFailure(retryError);
          }
        }
        // A model label that cannot be stored is still shown and regenerated
        // later. A manual name's caller needs to know, so the reason survives.
        return storageFailure(error);
      }
    },

    async remove(treeId, nodeIds) {
      if (
        !isMaterialId(treeId) || nodeIds.length > MAX_NODES_PER_TREE ||
        nodeIds.some((nodeId) => !isMaterialId(nodeId))
      ) return REJECTED;
      if (nodeIds.length === 0) return WRITTEN;
      try {
        const database = await handle.open();
        const transaction = database.transaction("labels", "readwrite");
        // Queue the complete batch before yielding. Awaiting each request in a
        // loop can let IndexedDB auto-commit between two otherwise related keys.
        await Promise.all(nodeIds.map(
          (nodeId) => transaction.store.delete(labelKey(treeId, nodeId)),
        ));
        await transaction.done;
        return WRITTEN;
      } catch (error) {
        // An orphan entry for a deleted node is inert, but an explicit reset
        // must not claim success when the manual name would return on reload.
        return storageFailure(error);
      }
    },

    async clear(treeId) {
      if (!isMaterialId(treeId)) return;
      try {
        const database = await handle.open();
        const transaction = database.transaction("labels", "readwrite");
        const keys = await transaction.store.index("treeId").getAllKeys(treeId);
        await Promise.all(keys.map((key) => transaction.store.delete(key)));
        await transaction.done;
      } catch {
        // Nothing durable depends on this succeeding.
      }
    },

    close() {
      handle.close();
    },
  });
}

async function putModelLabel(
  database: IDBPDatabase<MatterDatabase>,
  stored: StoredLabel,
): Promise<void> {
  const transaction = database.transaction("labels", "readwrite");
  const existing = await transaction.store.get(stored.key);
  // A second tab may have accepted a person's name while this model request
  // was in flight. The database transaction, not one tab's driver queue, is
  // the shared owner that prevents the late derived result replacing it.
  if (existing?.origin !== "user") {
    await transaction.store.put(stored);
    await retainNewestModelLabels(transaction.store, MAX_CACHED_MODEL_LABELS);
  }
  await transaction.done;
}

/** Parses a stored row. A row that fails any check is dropped, never repaired. */
function toRecord(entry: unknown, treeId: string): LabelRecord | null {
  if (typeof entry !== "object" || entry === null) return null;
  const stored = entry as Partial<StoredLabel>;
  if (stored.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) return null;
  if (stored.treeId !== treeId) return null;
  if (typeof stored.nodeId !== "string" || stored.nodeId.length === 0) return null;
  if (stored.key !== labelKey(treeId, stored.nodeId)) return null;
  if (typeof stored.label !== "string") return null;
  if (stored.origin !== "model" && stored.origin !== "user") return null;
  if (stored.basis !== null && typeof stored.basis !== "string") return null;
  if (typeof stored.updatedAt !== "string") return null;
  const record: LabelRecord = {
    nodeId: stored.nodeId,
    label: stored.label,
    origin: stored.origin,
    basis: stored.basis,
    updatedAt: stored.updatedAt,
  };
  return isStorable(record) ? Object.freeze(record) : null;
}

function isStorable(record: LabelRecord): boolean {
  return (
    isMaterialId(record.nodeId) &&
    record.label.trim().length > 0 &&
    record.label.length <= MAX_STORED_LABEL_CODE_UNITS &&
    isWellFormedUnicodeText(record.label) &&
    isCanonicalTimestamp(record.updatedAt) &&
    (record.origin === "user"
      ? record.basis === null
      : typeof record.basis === "string" &&
        record.basis.length <= MAX_STORED_LABEL_BASIS_CODE_UNITS &&
        isWellFormedUnicodeText(record.basis))
  );
}

function storageFailure(error: unknown): LabelWriteReceipt {
  return Object.freeze({
    ok: false,
    code: isStorageFull(error)
      ? "STORAGE_FULL"
      : "STORAGE_UNAVAILABLE",
  });
}

function isStorageFull(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}
