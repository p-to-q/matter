import type {
  DBSchema,
  IDBPDatabase,
  IDBPObjectStore,
  StoreNames,
} from "idb";
import { openDB } from "idb";
import type { SnapshotBundle } from "./snapshot-codec";
import { MAX_NODES_PER_TREE } from "../tree/invariants";
import type { TreeCommand } from "../tree/model";
import type { WikiState } from "../wiki/wiki-model";

/**
 * Opens the one browser database Matter owns.
 *
 * All stores live here because a single origin may hold only one version of a
 * named database: two modules opening `ptoq-matter` with different versions
 * would deadlock each other. The schema therefore moves as a whole.
 *
 * `snapshots` is durable material. Labels, inquiries, and Wiki authority stay
 * outside the snapshot, so the archive remains exactly what a person wrote.
 * `historyEntries` holds one record per retained inverse; it is written only in
 * the same transaction as the snapshot row whose manifest describes it.
 */

export const STORAGE_SCHEMA_VERSION = 1 as const;
export const HISTORY_JOURNAL_FORMAT_VERSION = 1 as const;

export type HistoryStackName = "undo" | "redo";

/** Half-open `[first, end)` positions of one stack inside the manifest epoch. */
export type StoredHistoryRange = readonly [first: number, end: number];

/**
 * The snapshot row's description of its undo journal. It repeats the row's
 * generation and revision so a row rewritten by a writer that copied the
 * manifest without owning the records is recognized as stale.
 */
export type StoredHistoryJournal = Readonly<{
  formatVersion: typeof HISTORY_JOURNAL_FORMAT_VERSION;
  epoch: number;
  writeGeneration: number;
  treeRevision: number;
  undo: StoredHistoryRange;
  redo: StoredHistoryRange;
  count: number;
  bytes: number;
}>;

export type StoredSnapshot = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
  /** Present on every row this schema writes. */
  historyJournal?: StoredHistoryJournal;
  /**
   * The pre-v6 inline journal. It is only read, once, to migrate; a row keeps
   * it only while no save of this schema has replaced that row.
   */
  history?: unknown;
}>;

export type StoredHistoryKey = [treeId: string, epoch: number, stack: HistoryStackName, position: number];

export type StoredHistoryEntry = Readonly<{
  formatVersion: typeof HISTORY_JOURNAL_FORMAT_VERSION;
  treeId: string;
  epoch: number;
  stack: HistoryStackName;
  position: number;
  commandId: string;
  source: TreeCommand["source"];
  inverse: TreeCommand;
  retainedInverseBytes: number;
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

export const WIKI_RECORD_KEY = "origin" as const;
export const WIKI_RECORD_SCHEMA_VERSION = 6 as const;

/** Wiki is local lexical authority. It is neither material nor a model cache. */
export type StoredWikiRecord = Readonly<{
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  recordSchemaVersion: 1 | 2 | 3 | 4 | 5 | typeof WIKI_RECORD_SCHEMA_VERSION;
  key: typeof WIKI_RECORD_KEY;
  writeGeneration: number;
  state: WikiState;
}>;

export interface MatterDatabase extends DBSchema {
  snapshots: {
    key: string;
    value: StoredSnapshot;
  };
  historyEntries: {
    key: StoredHistoryKey;
    value: StoredHistoryEntry;
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
  wiki: {
    key: typeof WIKI_RECORD_KEY;
    value: StoredWikiRecord;
  };
}

const DATABASE_NAME = "ptoq-matter";
export const MATTER_DATABASE_VERSION = 6;
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
 * What another tab did to this tab's database. `upgrade-blocked` and
 * `upgrade-ready` bracket an upgrade waiting for older tabs to close.
 * `superseded` (a newer schema) and `cleared` (the database was deleted) are
 * terminal: this build must never reopen, recreate, or write it again.
 */
export type MatterDatabaseLifecycle = "upgrade-blocked" | "upgrade-ready" | "superseded" | "cleared";

export const SUPERSEDED_DATABASE_ERROR = "MatterDatabaseSupersededError";
export const CLEARED_DATABASE_ERROR = "MatterDatabaseClearedError";

export type MatterDatabaseHandle = Readonly<{
  open: () => Promise<IDBPDatabase<MatterDatabase>>;
  close: () => void;
  /** Drops a connection the engine reports as lost so the next open is fresh. */
  reset: () => void;
}>;

/**
 * Each caller keeps its own connection handle so one module closing does not
 * strand another. `blocking` closes eagerly so a newer tab can upgrade, and
 * leaves the handle terminal so it cannot silently recreate an older schema.
 * By default a blocked upgrade fails the open; the material owner instead
 * keeps waiting and reports it, because its tab can do nothing useful first.
 */
export function createMatterDatabaseHandle(options: Readonly<{
  waitWhenBlocked?: boolean;
  onLifecycle?: (event: MatterDatabaseLifecycle) => void;
}> = {}): MatterDatabaseHandle {
  let databasePromise: Promise<IDBPDatabase<MatterDatabase>> | null = null;
  let terminal: "superseded" | "cleared" | null = null;
  const report = (event: MatterDatabaseLifecycle) => {
    try {
      options.onLifecycle?.(event);
    } catch {
      // A lifecycle observer cannot break the connection owner.
    }
  };
  const enterTerminal = (state: "superseded" | "cleared") => {
    if (terminal !== null) return;
    terminal = state;
    report(state);
  };
  const open = () => {
    if (terminal !== null) return Promise.reject(terminalError(terminal));
    if (databasePromise !== null) return databasePromise;
    const owner: { opening: Promise<IDBPDatabase<MatterDatabase>> | null } = {
      opening: null,
    };
    const resetIfCurrent = () => {
      if (databasePromise === owner.opening) databasePromise = null;
    };
    const opening = new Promise<IDBPDatabase<MatterDatabase>>((resolveOpen, rejectOpen) => {
      let abandoned = false;
      let blockedReported = false;
      const nativeOpen = openDB<MatterDatabase>(DATABASE_NAME, MATTER_DATABASE_VERSION, {
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
          if (!db.objectStoreNames.contains("wiki")) {
            db.createObjectStore("wiki", { keyPath: "key" });
          }
          // Legacy inline journals migrate lazily on the first save of each
          // row, so the upgrade stays constant-time for any stored history.
          if (!db.objectStoreNames.contains("historyEntries")) {
            db.createObjectStore("historyEntries", {
              keyPath: ["treeId", "epoch", "stack", "position"],
            });
          }
        },
        blocked() {
          if (options.waitWhenBlocked === true) {
            blockedReported = true;
            report("upgrade-blocked");
            return;
          }
          abandoned = true;
          resetIfCurrent();
          const error = new Error("The Matter database upgrade is blocked by another tab.");
          error.name = "BlockedError";
          rejectOpen(error);
        },
        terminated: resetIfCurrent,
        blocking(_currentVersion, blockedVersion) {
          void owner.opening?.then((db) => db.close()).catch(() => undefined);
          resetIfCurrent();
          enterTerminal(blockedVersion === null ? "cleared" : "superseded");
        },
      });
      void nativeOpen.then((db) => {
        if (abandoned || terminal !== null) {
          db.close();
          if (!abandoned) rejectOpen(terminalError(terminal ?? "superseded"));
          return;
        }
        if (blockedReported) report("upgrade-ready");
        resolveOpen(db);
      }, (error: unknown) => {
        // This build asked for an older version than the one on disk.
        if (error instanceof DOMException && error.name === "VersionError") {
          enterTerminal("superseded");
          rejectOpen(terminalError("superseded"));
          return;
        }
        rejectOpen(error);
      });
    });
    owner.opening = opening;
    databasePromise = opening;
    void opening.catch(() => {
      // Retry a failed open only on a later explicit repository operation.
      resetIfCurrent();
    });
    return databasePromise;
  };
  const close = () => {
    void databasePromise?.then((db) => db.close()).catch(() => undefined);
    databasePromise = null;
  };
  return Object.freeze({ open, close, reset: close });
}

function terminalError(state: "superseded" | "cleared"): Error {
  const error = new Error(state === "superseded"
    ? "A newer Matter schema owns this database."
    : "The Matter database was deleted by another tab.");
  error.name = state === "superseded" ? SUPERSEDED_DATABASE_ERROR : CLEARED_DATABASE_ERROR;
  return error;
}

/**
 * Reclaims only derived rows, oldest first, inside the caller's transaction,
 * and returns how many it removed.
 */
export async function retainNewestModelLabels<
  TxStores extends ArrayLike<StoreNames<MatterDatabase>>,
  Mode extends "readwrite" | "versionchange",
>(
  store: IDBPObjectStore<MatterDatabase, TxStores, "labels", Mode>,
  maximum: number,
): Promise<number> {
  const index = store.index("originUpdatedAt");
  const range = IDBKeyRange.bound(["model", ""], ["model", "\uffff"]);
  const excess = Math.max(0, await index.count(range) - maximum);
  let remaining = excess;
  let cursor = remaining === 0 ? null : await index.openCursor(range);
  while (cursor !== null && remaining > 0) {
    await cursor.delete();
    remaining -= 1;
    cursor = await cursor.continue();
  }
  return excess - remaining;
}
