import {
  createMatterDatabaseHandle,
  labelKey,
  STORAGE_SCHEMA_VERSION,
  type StoredLabel,
  type StoredLabelOrigin,
} from "./matter-database";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

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

export type LabelRepository = Readonly<{
  loadAll(treeId: string): Promise<readonly LabelRecord[]>;
  put(treeId: string, record: LabelRecord): Promise<void>;
  remove(treeId: string, nodeIds: readonly string[]): Promise<void>;
  clear(treeId: string): Promise<void>;
  close(): void;
}>;

export const MAX_STORED_LABEL_CODE_UNITS = 64;

export function createIndexedDbLabelRepository(): LabelRepository {
  const handle = createMatterDatabaseHandle();

  return Object.freeze({
    async loadAll(treeId) {
      try {
        const database = await handle.open();
        const stored = await database.getAllFromIndex("labels", "treeId", treeId);
        const records: LabelRecord[] = [];
        for (const entry of stored) {
          const record = toRecord(entry, treeId);
          if (record !== null) records.push(record);
          if (records.length >= MAX_NODES_PER_TREE) break;
        }
        return Object.freeze(records);
      } catch {
        return Object.freeze([]);
      }
    },

    async put(treeId, record) {
      if (!isStorable(record)) return;
      try {
        const database = await handle.open();
        await database.put("labels", Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          key: labelKey(treeId, record.nodeId),
          treeId,
          nodeId: record.nodeId,
          label: record.label,
          origin: record.origin,
          basis: record.basis,
          updatedAt: record.updatedAt,
        }));
      } catch {
        // A label that cannot be stored is still shown; it is regenerated later.
      }
    },

    async remove(treeId, nodeIds) {
      if (nodeIds.length === 0) return;
      try {
        const database = await handle.open();
        const transaction = database.transaction("labels", "readwrite");
        for (const nodeId of nodeIds) {
          await transaction.store.delete(labelKey(treeId, nodeId));
        }
        await transaction.done;
      } catch {
        // An orphan entry is inert: it is only ever read back by node id.
      }
    },

    async clear(treeId) {
      try {
        const database = await handle.open();
        const transaction = database.transaction("labels", "readwrite");
        const keys = await transaction.store.index("treeId").getAllKeys(treeId);
        for (const key of keys) await transaction.store.delete(key);
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

/** Parses a stored row. A row that fails any check is dropped, never repaired. */
function toRecord(entry: unknown, treeId: string): LabelRecord | null {
  if (typeof entry !== "object" || entry === null) return null;
  const stored = entry as Partial<StoredLabel>;
  if (stored.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) return null;
  if (stored.treeId !== treeId) return null;
  if (typeof stored.nodeId !== "string" || stored.nodeId.length === 0) return null;
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
    record.nodeId.length > 0 &&
    record.label.trim().length > 0 &&
    record.label.length <= MAX_STORED_LABEL_CODE_UNITS &&
    (record.origin === "user" ? record.basis === null : typeof record.basis === "string")
  );
}
