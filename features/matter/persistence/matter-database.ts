import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { SnapshotBundle } from "./snapshot-codec";

/**
 * Opens the one browser database Matter owns.
 *
 * Both stores live here because a single origin may hold only one version of a
 * named database: two modules opening `ptoq-matter` with different versions
 * would deadlock each other. The schema therefore moves as a whole.
 *
 * `snapshots` is durable material. `labels` is a derived cache — losing it
 * costs a regeneration, never a thought — and is kept out of the snapshot so
 * the archive stays exactly the material a person wrote.
 */

export const STORAGE_SCHEMA_VERSION = 1 as const;

export type StoredSnapshot = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
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

export interface MatterDatabase extends DBSchema {
  snapshots: {
    key: string;
    value: StoredSnapshot;
  };
  labels: {
    key: string;
    value: StoredLabel;
    indexes: { treeId: string };
  };
}

const DATABASE_NAME = "ptoq-matter";
const DATABASE_VERSION = 2;

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
      upgrade(db) {
        if (!db.objectStoreNames.contains("snapshots")) {
          db.createObjectStore("snapshots", { keyPath: "treeId" });
        }
        if (!db.objectStoreNames.contains("labels")) {
          const labels = db.createObjectStore("labels", { keyPath: "key" });
          labels.createIndex("treeId", "treeId");
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
