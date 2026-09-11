import type {
  DBSchema,
  IDBPDatabase,
  IDBPObjectStore,
  StoreNames,
} from "idb";
import { openDB } from "idb";
import type { SnapshotBundle } from "./snapshot-codec";
import type { TreeHistory } from "../tree/history";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

/**
 * Opens the one browser database Matter owns.
 *
 * Both stores live here because a single origin may hold only one version of a
 * named database: two modules opening `ptoq-matter` with different versions
 * would deadlock each other. The schema therefore moves as a whole.
 *
 * `snapshots` is durable material. `labels` keeps bounded derived model rows
 * beside durable manual names; neither is material, so both stay outside the
 * snapshot and the archive remains exactly what a person wrote.
 */

export const STORAGE_SCHEMA_VERSION = 1 as const;

export type StoredSnapshot = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
  /** Absent only for snapshots written before durable undo history existed. */
  history?: TreeHistory;
}>;

/** Origin of a stored label. A provisional label is never stored: it is a pure
 * function of the material and costs less to recompute than to read back. */
export type StoredLabelOrigin = "model" | "user";

export type StoredLabel = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  key: string;
  treeId: string;
  nodeId: string;
  label: string;
  origin: StoredLabelOrigin;
  /**
   * Fingerprint of the material this label was derived from, or `null` for a
   * name a person typed. A person's name outlives edits to the material; a
   * model's does not.
   */
  basis: string | null;
  updatedAt: string;
}>;

export type StoredInquiryOutcome =
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{
      status: "unavailable";
      reason:
        | "NO_PROVIDER"
        | "NO_MATERIAL"
        | "RATE_LIMITED"
        | "BUSY"
        | "TIMED_OUT"
        | "TEMPORARILY_UNAVAILABLE"
        | "UNREACHABLE";
    }>;

/** A durable, local-only Ask Matter exchange; never a material command. */
export type StoredInquiryExchange = Readonly<{
  id: string;
  askedAt: string;
  question: string;
  outcome: StoredInquiryOutcome;
  basis: Readonly<{
    treeId: string;
    revision: number;
    /** Frozen v1 look-back vocabulary; a future address kind needs migration. */
    scope: "selection" | "tree";
  }>;
}>;

export type StoredInquiryRecord = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  recordSchemaVersion: 1;
  treeId: string;
  writeGeneration: number;
  /**
   * A clear advances the record epoch instead of deleting the row. This lets a
   * late save prove that it began before the clear and prevents resurrection.
   * Records written before this field existed are active epoch zero.
   */
  recordEpoch?: number;
  /** A retained clear marker, never visible as an exchange. */
  cleared?: boolean;
  exchanges: readonly StoredInquiryExchange[];
}>;

export interface MatterDatabase extends DBSchema {
  snapshots: {
    key: string;
    value: StoredSnapshot;
  };
  labels: {
    key: string;
    value: StoredLabel;
    indexes: {
      treeId: string;
      originUpdatedAt: [StoredLabelOrigin, string];
    };
  };
  inquiryRecords: {
    key: string;
    value: StoredInquiryRecord;
  };
}

const DATABASE_NAME = "ptoq-matter";
const DATABASE_VERSION = 4;
/** Two maximum documents stay warm; manual names are not part of this cache. */
export const MAX_CACHED_MODEL_LABELS = MAX_NODES_PER_TREE * 2;

/**
 * Tree and node ids are drawn from `[A-Za-z0-9_-]`, so a space can never occur
 * inside either half and the composite key is unambiguous.
 */
export function labelKey(treeId: string, nodeId: string): string {
  return `${treeId} ${nodeId}`;
}

/**
 * Each caller keeps its own connection handle so one module closing does not
 * strand another. `blocking` closes eagerly so a newer tab can upgrade.
 */
export function createMatterDatabaseHandle(): {
  open: () => Promise<IDBPDatabase<MatterDatabase>>;
  close: () => void;
} {
  let databasePromise: Promise<IDBPDatabase<MatterDatabase>> | null = null;
  const open = () => {
    if (databasePromise !== null) return databasePromise;
    const owner: { opening: Promise<IDBPDatabase<MatterDatabase>> | null } = {
      opening: null,
    };
    const resetIfCurrent = () => {
      if (databasePromise === owner.opening) databasePromise = null;
    };
    const opening = openDB<MatterDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("snapshots")) {
          db.createObjectStore("snapshots", { keyPath: "treeId" });
        }
        const existingLabels = db.objectStoreNames.contains("labels");
        const labels = existingLabels
          ? transaction.objectStore("labels")
          : db.createObjectStore("labels", { keyPath: "key" });
        if (!labels.indexNames.contains("treeId")) {
          labels.createIndex("treeId", "treeId");
        }
        if (!labels.indexNames.contains("originUpdatedAt")) {
          labels.createIndex("originUpdatedAt", ["origin", "updatedAt"]);
        }
        if (existingLabels && oldVersion < 4) {
          // Queue the first cursor request before the upgrade callback returns.
          // The versionchange transaction then remains the sole owner until the
          // complete legacy cache has converged to the new global bound.
          void retainNewestModelLabels(labels, MAX_CACHED_MODEL_LABELS).catch(() => {
            try {
              transaction.abort();
            } catch {
              // The transaction already failed; the open will reject as well.
            }
          });
        }
        if (!db.objectStoreNames.contains("inquiryRecords")) {
          db.createObjectStore("inquiryRecords", { keyPath: "treeId" });
        }
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
      // Retry a failed open only on a later explicit repository operation.
      resetIfCurrent();
    });
    return databasePromise;
  };
  return {
    open,
    close() {
      void databasePromise?.then((db) => db.close()).catch(() => undefined);
      databasePromise = null;
    },
  };
}

/** Reclaims only derived rows, oldest first, inside the caller's transaction. */
export async function retainNewestModelLabels<
  TxStores extends ArrayLike<StoreNames<MatterDatabase>>,
  Mode extends "readwrite" | "versionchange",
>(
  store: IDBPObjectStore<MatterDatabase, TxStores, "labels", Mode>,
  maximum: number,
): Promise<void> {
  const index = store.index("originUpdatedAt");
  const range = IDBKeyRange.bound(["model", ""], ["model", "\uffff"]);
  let remaining = Math.max(0, await index.count(range) - maximum);
  let cursor = remaining === 0 ? null : await index.openCursor(range);
  while (cursor !== null && remaining > 0) {
    await cursor.delete();
    remaining -= 1;
    cursor = await cursor.continue();
  }
}
