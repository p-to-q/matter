import type {
  CorruptSnapshotBasis,
  DocumentRepository,
  ImportedSnapshotReservation,
  RepositoryErrorCode,
  RepositoryResult,
  SnapshotBasis,
} from "./document-repository";
import {
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  shedHistoryRetention,
  type HistoryRetention,
} from "./history-journal";
import type { RecoveredHistory } from "./history-recovery";
import { treeToBundle, type SnapshotBundle } from "./snapshot-codec";
import { validateThoughtTree } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import { createTreeHistory, type TreeHistory } from "../tree/history";

/**
 * `released`: storage pressure kept material durable by saving fewer undo
 * steps than this tab still holds. `unavailable`: stored or in-memory undo
 * steps could not be restored or no longer applied, and were released.
 */
export type HistoryNotice = "released" | "unavailable";

export type PersistenceStatus = Readonly<{
  phase: "loading" | "saved" | "saving" | "error";
  persistedRevision: number | null;
  dirtyRevision: number | null;
  errorCode: RepositoryErrorCode | null;
  historyNotice: HistoryNotice | null;
}>;

export type StoredDocument = Readonly<{
  storedTree: ThoughtTree | null;
  storedHistory: RecoveredHistory | null;
}>;

export type ImportedDocumentPreparation = Readonly<{
  ok: true;
  attemptId: number;
  createdSnapshot: boolean;
  tree: ThoughtTree;
  writeGeneration: number;
  reservation: ImportedSnapshotReservation;
}>;

export type ImportedDocumentRejection = Readonly<{
  ok: false;
  errorCode: "IMPORT_INVALID_TREE" | "IMPORT_CONFLICT" | Exclude<RepositoryErrorCode, "PERSISTENCE_CONFLICT">;
}>;

export type PersistenceController = Readonly<{
  start(tree: ThoughtTree, history?: TreeHistory): Promise<StoredDocument>;
  publish(tree: ThoughtTree, history?: TreeHistory): void;
  prepareImportedTree(tree: ThoughtTree): Promise<ImportedDocumentPreparation | ImportedDocumentRejection>;
  activateImportedDocument(prepared: ImportedDocumentPreparation): void;
  discardImportedDocument(prepared: ImportedDocumentPreparation): Promise<RepositoryErrorCode | null>;
  exportCorruptRecovery(): Promise<
    | Readonly<{ ok: true; bytes: Uint8Array; fileName: string }>
    | Readonly<{ ok: false; errorCode: RepositoryErrorCode }>
  >;
  replaceCorrupt(): Promise<
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; errorCode: RepositoryErrorCode }>
  >;
  /**
   * Two versions of one document exist and neither descends from the other.
   * The live tree is held unsaved rather than written over the stored one, and
   * the person is given the same explicit choice a second tab raises.
   */
  declareConflict(tree: ThoughtTree, history?: TreeHistory): void;
  retry(): void;
  resolveConflict(): Promise<StoredDocument>;
  /** Undo steps were released because they could not be restored or applied. */
  reportHistoryUnavailable(): void;
  /** The person has seen the history notice where recovery lives. */
  acknowledgeHistoryNotice(): void;
  flush(): void;
  dispose(): void;
  getStatus(): PersistenceStatus;
  subscribe(listener: () => void): () => void;
}>;

type PendingDocument = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;

const NO_STORED_DOCUMENT: StoredDocument = Object.freeze({ storedTree: null, storedHistory: null });
/** No row is known: the first save creates one, or meets another tab's as a conflict. */
const UNKNOWN_BASIS: SnapshotBasis = Object.freeze({ writeGeneration: null, journal: emptyHistoryJournal(0) });

export function createPersistenceController(repository: DocumentRepository): PersistenceController {
  let active = true;
  let ready = false;
  let writing = false;
  let activeTreeId: string | null = null;
  let documentEpoch = 0;
  let basis: SnapshotBasis = UNKNOWN_BASIS;
  // Storage pressure lowers durable history for the rest of the document
  // epoch; an explicit retry or a new document restores full retention.
  let retention: HistoryRetention = FULL_HISTORY_RETENTION;
  let pending: PendingDocument | null = null;
  let writingDocument: PendingDocument | null = null;
  let importAttemptSequence = 0;
  let activeImportAttempt: number | null = null;
  let corruptRecovery: Readonly<{
    basis: CorruptSnapshotBasis;
    documentEpoch: number;
    dirtyDocument: PendingDocument;
  }> | null = null;
  let status: PersistenceStatus = Object.freeze({
    phase: "loading",
    persistedRevision: null,
    dirtyRevision: null,
    errorCode: null,
    historyNotice: null,
  });
  const listeners = new Set<() => void>();
  // Async repository writes may overlap a publish() call; reading through this
  // seam prevents compile-time narrowing from erasing that runtime transition.
  const currentPending = (): PendingDocument | null => pending;

  const update = (next: PersistenceStatus) => {
    status = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  const beginDocument = (treeId: string) => {
    activeImportAttempt = null;
    corruptRecovery = null;
    activeTreeId = treeId;
    documentEpoch += 1;
    basis = UNKNOWN_BASIS;
    retention = FULL_HISTORY_RETENTION;
  };

  /**
   * Material before history: when storage refuses the write, the same
   * transaction is retried with fewer durable undo steps before the save is
   * reported as storage-full. Only a snapshot that cannot fit alone fails.
   */
  const saveShedding = async (
    document: PendingDocument,
    bundle: SnapshotBundle,
    saveEpoch: number,
  ): Promise<Readonly<{ saved: RepositoryResult<SnapshotBasis>; retention: HistoryRetention }>> => {
    let attempt = retention;
    for (;;) {
      const saved = await repository.save({
        treeId: document.tree.id,
        treeRevision: document.tree.revision,
        bundle,
        basis,
        history: document.history,
        retention: attempt,
      });
      if (saved.ok || saved.error.code !== "PERSISTENCE_STORAGE_FULL") return { saved, retention: attempt };
      if (!active || saveEpoch !== documentEpoch) return { saved, retention: attempt };
      const next = shedHistoryRetention(document.history, attempt);
      if (next === null) return { saved, retention: attempt };
      attempt = next;
    }
  };

  const drain = async () => {
    if (!active || writing || !ready || pending === null || activeImportAttempt !== null) return;
    writing = true;
    const drainEpoch = documentEpoch;
    while (active && pending !== null) {
      const pendingDocument = pending;
      pending = null;
      writingDocument = pendingDocument;
      const { tree } = pendingDocument;
      update({
        ...status,
        phase: "saving",
        dirtyRevision: tree.revision,
        errorCode: null,
      });
      let bundle;
      try {
        bundle = treeToBundle(tree);
      } catch {
        pending = pendingDocument;
        update({ ...status, phase: "error", dirtyRevision: tree.revision, errorCode: "PERSISTENCE_WRITE_FAILED" });
        break;
      }
      const { saved, retention: savedRetention } = await saveShedding(pendingDocument, bundle, drainEpoch);
      if (!active || drainEpoch !== documentEpoch || tree.id !== activeTreeId) break;
      if (!saved.ok) {
        pending ??= pendingDocument;
        update({ ...status, phase: "error", dirtyRevision: pending.tree.revision, errorCode: saved.error.code });
        break;
      }
      basis = saved.value;
      const shed = savedRetention !== retention;
      retention = savedRetention;
      const queuedAfterWrite = currentPending();
      update({
        phase: queuedAfterWrite === null ? "saved" : "saving",
        persistedRevision: tree.revision,
        dirtyRevision: queuedAfterWrite?.tree.revision ?? null,
        errorCode: null,
        historyNotice: shed ? "released" : status.historyNotice,
      });
    }
    writingDocument = null;
    writing = false;
    if (active && pending !== null && status.phase !== "error") void drain();
  };

  const adoptLoaded = (
    loaded: Readonly<{ tree: ThoughtTree; history: RecoveredHistory; basis: SnapshotBasis }>,
  ): StoredDocument => {
    basis = loaded.basis;
    update({
      phase: "saved",
      persistedRevision: loaded.tree.revision,
      dirtyRevision: null,
      errorCode: null,
      historyNotice: null,
    });
    return Object.freeze({ storedTree: loaded.tree, storedHistory: loaded.history });
  };

  return Object.freeze({
    async start(tree, history = createTreeHistory()) {
      beginDocument(tree.id);
      const startEpoch = documentEpoch;
      const loaded = await repository.load(tree.id);
      if (!active || startEpoch !== documentEpoch) return NO_STORED_DOCUMENT;
      if (!loaded.ok) {
        ready = true;
        pending = Object.freeze({ tree, history });
        update({
          phase: "error",
          persistedRevision: null,
          dirtyRevision: tree.revision,
          errorCode: loaded.error.code,
          historyNotice: null,
        });
        return NO_STORED_DOCUMENT;
      }
      ready = true;
      if (loaded.value === null) {
        pending = Object.freeze({ tree, history });
        void drain();
        return NO_STORED_DOCUMENT;
      }
      return adoptLoaded(loaded.value);
    },

    publish(tree, history = createTreeHistory()) {
      if (tree.id !== activeTreeId) return;
      if (pending?.tree === tree && pending.history === history) return;
      if (writingDocument?.tree === tree && writingDocument.history === history) {
        // The latest publication returned to the exact value already being
        // written. Any different pending value is now stale and must not win
        // merely because it arrived between the two identical publications.
        // If this write fails, drain's failure path requeues writingDocument.
        pending = null;
        return;
      }
      if (pending === null && status.phase === "saved" && status.persistedRevision === tree.revision) return;
      pending = Object.freeze({ tree, history });
      if (ready && status.phase !== "error") void drain();
      else if (ready) update({ ...status, dirtyRevision: tree.revision });
    },

    async prepareImportedTree(tree) {
      const validation = validateThoughtTree(tree);
      if (!validation.ok) return Object.freeze({ ok: false, errorCode: "IMPORT_INVALID_TREE" });

      let bundle;
      try {
        bundle = treeToBundle(tree);
      } catch {
        return Object.freeze({ ok: false, errorCode: "IMPORT_INVALID_TREE" });
      }
      // One preparation owns the persistence seam until it is either activated
      // or explicitly discarded. This prevents two archives from reserving the
      // same missing row and making the newer attempt fail behind the older one.
      if (activeImportAttempt !== null) {
        return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
      }
      // A same-document import cannot race an old in-memory save. Rejecting it
      // keeps the successful CAS generation and the runtime switch coherent.
      if (tree.id === activeTreeId && (writing || pending !== null)) {
        return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
      }
      const attemptId = ++importAttemptSequence;
      activeImportAttempt = attemptId;
      const rejectAttempt = (errorCode: ImportedDocumentRejection["errorCode"]): ImportedDocumentRejection => {
        if (activeImportAttempt === attemptId) {
          activeImportAttempt = null;
          if (active && pending !== null && status.phase !== "error") void drain();
        }
        return Object.freeze({ ok: false, errorCode });
      };
      const loaded = await repository.load(tree.id);
      if (!active || activeImportAttempt !== attemptId) return rejectAttempt("PERSISTENCE_UNAVAILABLE");
      if (!loaded.ok) return rejectAttempt(importRepositoryError(loaded.error.code));

      if (loaded.value !== null && tree.id === activeTreeId && (writing || pending !== null)) {
        return rejectAttempt("IMPORT_CONFLICT");
      }
      // Replace is an explicit document-boundary authorization. A valid older
      // bundle with the same tree id may therefore replace the current row; the
      // repository owns its CAS, empty-history write, and rollback capability.
      const reserved = await repository.reserveImportedSnapshot(
        tree.id,
        tree.revision,
        bundle,
        loaded.value?.basis.writeGeneration ?? null,
      );
      if (!active || activeImportAttempt !== attemptId) {
        if (reserved.ok) await repository.rollbackImportedSnapshot(reserved.value);
        return rejectAttempt("PERSISTENCE_UNAVAILABLE");
      }
      if (!reserved.ok) return rejectAttempt(importRepositoryError(reserved.error.code));
      return Object.freeze({
        ok: true,
        attemptId,
        createdSnapshot: loaded.value === null,
        tree,
        writeGeneration: reserved.value.basis.writeGeneration,
        reservation: reserved.value,
      });
    },

    activateImportedDocument(prepared) {
      if (activeImportAttempt !== prepared.attemptId) return;
      // Late writes from the previous document are ignored by their epoch once
      // this switch takes effect; the imported tree already has a successful CAS.
      beginDocument(prepared.tree.id);
      ready = true;
      basis = prepared.reservation.basis;
      pending = null;
      update({
        phase: "saved",
        persistedRevision: prepared.tree.revision,
        dirtyRevision: null,
        errorCode: null,
        historyNotice: null,
      });
    },

    async discardImportedDocument(prepared) {
      if (activeImportAttempt !== prepared.attemptId) return null;
      // Keep the attempt owner while rollback is in flight. A local commit made
      // during preparation stays queued until the previous row is restored and
      // its new monotonic generation becomes the controller's CAS basis.
      const rolledBack = await repository.rollbackImportedSnapshot(prepared.reservation);
      if (activeImportAttempt !== prepared.attemptId) {
        return active ? null : "PERSISTENCE_UNAVAILABLE";
      }
      activeImportAttempt = null;
      if (!rolledBack.ok || rolledBack.value.status === "stale") {
        const errorCode = rolledBack.ok ? "PERSISTENCE_CONFLICT" : rolledBack.error.code;
        if (active && pending !== null) {
          update({
            ...status,
            phase: "error",
            dirtyRevision: pending.tree.revision,
            errorCode,
          });
        }
        return errorCode;
      }
      // Rollback restores the exact row the import replaced, journal included.
      // Only when that row is the one this basis describes does the restored
      // generation become the CAS basis; otherwise another tab wrote it, and
      // the next save must meet that newer row as a conflict.
      const previousGeneration = prepared.reservation.previous?.writeGeneration ?? null;
      if (prepared.tree.id === activeTreeId && previousGeneration === basis.writeGeneration) {
        basis = Object.freeze({ writeGeneration: rolledBack.value.writeGeneration, journal: basis.journal });
      }
      if (active && pending !== null && status.phase !== "error") void drain();
      return null;
    },

    async exportCorruptRecovery() {
      corruptRecovery = null;
      if (
        !active ||
        !ready ||
        activeTreeId === null ||
        pending === null ||
        status.errorCode !== "PERSISTENCE_CORRUPT"
      ) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      const recoveryEpoch = documentEpoch;
      const dirtyDocument = pending;
      const exported = await repository.exportCorrupt(activeTreeId);
      if (
        !active ||
        recoveryEpoch !== documentEpoch ||
        pending !== dirtyDocument ||
        status.errorCode !== "PERSISTENCE_CORRUPT"
      ) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      if (!exported.ok) return Object.freeze({ ok: false, errorCode: exported.error.code });
      corruptRecovery = Object.freeze({
        basis: exported.value.basis,
        documentEpoch: recoveryEpoch,
        dirtyDocument,
      });
      const copy = new Uint8Array(exported.value.bytes.byteLength);
      copy.set(exported.value.bytes);
      return Object.freeze({
        ok: true,
        bytes: copy,
        fileName: `${activeTreeId}.matter-recovery.json`,
      });
    },

    async replaceCorrupt() {
      const recovery = corruptRecovery;
      if (
        !active ||
        recovery === null ||
        recovery.documentEpoch !== documentEpoch ||
        recovery.basis.treeId !== activeTreeId ||
        status.errorCode !== "PERSISTENCE_CORRUPT" ||
        pending === null
      ) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      const replacement = pending;
      let bundle;
      try {
        bundle = treeToBundle(replacement.tree);
      } catch {
        return Object.freeze({ ok: false, errorCode: "PERSISTENCE_WRITE_FAILED" });
      }
      const replaced = await repository.replaceCorrupt({
        treeId: replacement.tree.id,
        treeRevision: replacement.tree.revision,
        bundle,
        history: replacement.history,
        retention,
      }, recovery.basis);
      if (!replaced.ok) {
        corruptRecovery = null;
        update({ ...status, errorCode: replaced.error.code });
        return Object.freeze({ ok: false, errorCode: replaced.error.code });
      }
      corruptRecovery = null;
      if (!active || recovery.documentEpoch !== documentEpoch || replacement.tree.id !== activeTreeId) {
        return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      }
      basis = replaced.value;
      if (pending === replacement) pending = null;
      const queued = pending;
      update({
        ...status,
        phase: queued === null ? "saved" : "saving",
        persistedRevision: replacement.tree.revision,
        dirtyRevision: queued?.tree.revision ?? null,
        errorCode: null,
      });
      if (queued !== null) void drain();
      return Object.freeze({ ok: true });
    },

    declareConflict(tree, history = createTreeHistory()) {
      if (!active || !ready || tree.id !== activeTreeId) return;
      pending = Object.freeze({ tree, history });
      update({
        ...status,
        phase: "error",
        dirtyRevision: tree.revision,
        errorCode: "PERSISTENCE_CONFLICT",
      });
    },

    retry() {
      if (!active || !ready || pending === null) return;
      if (status.errorCode === "PERSISTENCE_CONFLICT" || status.errorCode === "PERSISTENCE_CORRUPT") return;
      retention = FULL_HISTORY_RETENTION;
      update({ ...status, phase: "saving", errorCode: null });
      void drain();
    },

    async resolveConflict() {
      if (!active || !ready || pending === null || status.errorCode !== "PERSISTENCE_CONFLICT") {
        return NO_STORED_DOCUMENT;
      }
      const dirtyDocument = pending;
      const loaded = await repository.load(dirtyDocument.tree.id);
      if (!active) return NO_STORED_DOCUMENT;
      if (!loaded.ok || loaded.value === null) {
        update({
          ...status,
          phase: "error",
          dirtyRevision: pending?.tree.revision ?? dirtyDocument.tree.revision,
          errorCode: loaded.ok ? "PERSISTENCE_CONFLICT" : loaded.error.code,
        });
        return NO_STORED_DOCUMENT;
      }
      // A commit after the explicit reload gesture wins locally. It keeps the
      // conflict unresolved rather than being silently discarded by hydration.
      if (pending !== dirtyDocument) return NO_STORED_DOCUMENT;
      pending = null;
      retention = FULL_HISTORY_RETENTION;
      return adoptLoaded(loaded.value);
    },

    reportHistoryUnavailable() {
      if (!active || status.historyNotice === "unavailable") return;
      update({ ...status, historyNotice: "unavailable" });
    },

    acknowledgeHistoryNotice() {
      if (!active || status.historyNotice === null) return;
      update({ ...status, historyNotice: null });
    },

    flush() {
      if (active && ready && status.phase !== "error") void drain();
    },

    dispose() {
      active = false;
      writingDocument = null;
      activeImportAttempt = null;
      corruptRecovery = null;
      listeners.clear();
      repository.close();
    },

    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function importRepositoryError(code: RepositoryErrorCode): ImportedDocumentRejection["errorCode"] {
  return code === "PERSISTENCE_CONFLICT" ? "IMPORT_CONFLICT" : code;
}
