import {
  STORAGE_SCHEMA_VERSION,
  type CorruptSnapshotBasis,
  type DocumentRepository,
  type ImportedSnapshotReservation,
  type RepositoryErrorCode,
  type RepositoryResult,
  type SnapshotBasis,
} from "./document-repository";
import type { DocumentGeneration } from "./document-generation-channel";
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
import { LOADING_PERSISTENCE_STATUS } from "./persistence-status";

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
  /**
   * This tab holds material the person made, or an import, that no stored row
   * holds yet. Material nobody touched (the seed, a stored row, their seed
   * relocalization) is never unsaved, even while its write waits or fails.
   */
  unsaved: boolean;
  /**
   * Storage refused this tab's pending material and no write is in flight, so
   * a same-document archive may replace it once the person confirms.
   */
  replaceableByImport: boolean;
  /** This newer build waits for an older Matter tab to close its database. */
  upgradeBlocked: boolean;
  /**
   * Why a conflict holds the material: another tab saved a newer row, or this
   * page changed material while stored material was still loading.
   */
  conflictOrigin: ConflictOrigin | null;
}>;

export type ConflictOrigin = "another-tab" | "load-window";

/**
 * What a newer stored generation means for this tab: nothing, a silent
 * refresh (no unsaved work), a conflict (unsaved work), or a terminal newer
 * schema or cleared row.
 */
export type StoredGenerationDecision = "ignored" | "refresh" | "conflict" | "superseded" | "cleared";

/**
 * A stored row that has been read but not adopted: the first load's row,
 * another tab's newer row, or the row an explicit reload chose. The runtime
 * store must accept it first; only then does its generation become the save
 * basis, so a refused hydration can never let a later save overwrite that row.
 */
export type StoredCandidate = Readonly<{
  tree: ThoughtTree;
  history: RecoveredHistory;
  basis: SnapshotBasis;
  documentEpoch: number;
  /** The unsaved material an explicit conflict resolution replaces. */
  replaces: Readonly<{ tree: ThoughtTree; history: TreeHistory }> | null;
}>;

/**
 * `adopted`: the store took the row and it is the save basis. `stale`: the
 * candidate no longer describes what this tab holds, and nothing was hydrated.
 * `refused`: the store kept newer material; the caller holds it as a conflict.
 */
export type StoredAdoption = "adopted" | "stale" | "refused";

/**
 * What the store did with a candidate it accepted: whether any stored undo
 * step could not be restored with the row's material.
 */
export type StoreHydration = Readonly<{ historyReleased: boolean }>;

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
  errorCode:
    | "IMPORT_INVALID_TREE"
    | "IMPORT_CONFLICT"
    | "IMPORT_DIRTY"
    | "IMPORT_SAVING"
    | Exclude<RepositoryErrorCode, "PERSISTENCE_CONFLICT">;
}>;

export type ImportOptions = Readonly<{
  /**
   * The person confirmed that this archive replaces material storage refused.
   * Only honored for the same document after a full or failed write, with no
   * write in flight.
   */
  replaceUnsaved?: boolean;
}>;

export type PersistenceController = Readonly<{
  /**
   * Reads the stored row for the material this document instance began with.
   * Returns it as a candidate the store must accept before `adoptStored`
   * makes it the basis; `null` when there is no row (the first save creates
   * one) or storage failed (the status says why).
   */
  start(tree: ThoughtTree, history?: TreeHistory): Promise<StoredCandidate | null>;
  /**
   * Hands over the latest material. `authored`: the person changed this
   * document instance since it began (store authorship); only such material
   * counts as unsaved.
   */
  publish(tree: ThoughtTree, history?: TreeHistory, authored?: boolean): void;
  prepareImportedTree(
    tree: ThoughtTree,
    options?: ImportOptions,
  ): Promise<ImportedDocumentPreparation | ImportedDocumentRejection>;
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
  declareConflict(tree: ThoughtTree, history?: TreeHistory, origin?: ConflictOrigin, authored?: boolean): void;
  retry(): void;
  /** Reads the stored row the person chose to reload over unsaved material. */
  resolveConflict(): Promise<StoredCandidate | null>;
  /** Another tab committed a row; classifies what that means here. */
  observeStoredGeneration(generation: DocumentGeneration): StoredGenerationDecision;
  /** Reads the stored generation (a returning page) and classifies it. */
  checkStoredGeneration(): Promise<StoredGenerationDecision>;
  /**
   * Reads a newer stored row for a tab with no unsaved work. A local commit
   * that lands during the read turns the refresh into a conflict instead.
   */
  prepareRefresh(): Promise<StoredCandidate | null>;
  /**
   * Replaces this tab's document by a candidate in one synchronous step.
   * `hydrate` is the store's compare-and-swap; it runs only while nothing has
   * changed since the candidate was read (`null`: the store refused), and the
   * row becomes the save basis only once the store accepted it. Steps the
   * store could not restore start the adopted row's history notice.
   */
  adoptStored(
    candidate: StoredCandidate,
    hydrate: (candidate: StoredCandidate) => StoreHydration | null,
  ): StoredAdoption;
  /** Undo steps were released because they could not be restored or applied. */
  reportHistoryUnavailable(): void;
  /** The person has seen the history notice where recovery lives. */
  acknowledgeHistoryNotice(): void;
  dispose(): void;
  getStatus(): PersistenceStatus;
  subscribe(listener: () => void): () => void;
}>;

export type PersistenceControllerOptions = Readonly<{
  /** Tells other tabs about every row this tab commits. */
  announceGeneration?: (generation: DocumentGeneration) => void;
}>;

type PendingDocument = Readonly<{ tree: ThoughtTree; history: TreeHistory; authored: boolean }>;
type StatusFields = Omit<PersistenceStatus, "unsaved" | "replaceableByImport">;
type TerminalCode = "PERSISTENCE_SUPERSEDED" | "PERSISTENCE_CLEARED";

/** No row is known: the first save creates one, or meets another tab's as a conflict. */
const UNKNOWN_BASIS: SnapshotBasis = Object.freeze({ writeGeneration: null, journal: emptyHistoryJournal(0) });
/** Storage refused material, not the row's basis: an archive may replace it. */
const REPLACEABLE_ERRORS: ReadonlySet<RepositoryErrorCode | null> = new Set([
  "PERSISTENCE_STORAGE_FULL",
  "PERSISTENCE_WRITE_FAILED",
]);

export function createPersistenceController(
  repository: DocumentRepository,
  options: PersistenceControllerOptions = {},
): PersistenceController {
  let active = true;
  let ready = false;
  let writing = false;
  let activeTreeId: string | null = null;
  let documentEpoch = 0;
  let basis: SnapshotBasis = UNKNOWN_BASIS;
  // The history the basis row holds, so a history-only change is still saved.
  let persistedHistory: TreeHistory | null = null;
  // Storage pressure lowers durable history for the rest of the document
  // epoch; an explicit retry or a new document restores full retention.
  let retention: HistoryRetention = FULL_HISTORY_RETENTION;
  let pending: PendingDocument | null = null;
  let writingDocument: PendingDocument | null = null;
  let importAttemptSequence = 0;
  let activeImportAttempt: number | null = null;
  // A newer schema or a deleted database ends durability for this tab. It is
  // never cleared: every later write would target storage this build no
  // longer owns.
  let terminal: TerminalCode | null = null;
  let corruptRecovery: Readonly<{
    basis: CorruptSnapshotBasis;
    documentEpoch: number;
    dirtyDocument: PendingDocument;
  }> | null = null;
  let status: PersistenceStatus = LOADING_PERSISTENCE_STATUS;
  const listeners = new Set<() => void>();
  // Async repository writes may overlap a publish() call; reading through this
  // seam prevents compile-time narrowing from erasing that runtime transition.
  const currentPending = (): PendingDocument | null => pending;
  // Whether any write or import is outstanding, touched or not. Control flow
  // (refresh, adoption, conflicts) depends on this; the reported `unsaved`
  // counts only material the person made.
  const hasOutstandingWrite = () => pending !== null || writing || activeImportAttempt !== null;
  const holdsUnsavedMaterial = () =>
    pending?.authored === true ||
    (writing && writingDocument?.authored === true) ||
    activeImportAttempt !== null;
  // Storage refused the pending material and nothing is writing it: the one
  // state in which an archive may replace unsaved material.
  const importMayReplace = (errorCode: RepositoryErrorCode | null) =>
    pending !== null && !writing && activeImportAttempt === null && REPLACEABLE_ERRORS.has(errorCode);

  // A compare that fails while this tab never read or wrote a row (a first
  // save after a failed load, a corrupt row that changed) proves only that
  // stored material differs from the page, not that another tab exists.
  const unattributedConflictOrigin = (): ConflictOrigin =>
    basis.writeGeneration === null ? "load-window" : "another-tab";

  const update = (next: StatusFields) => {
    const errorCode = terminal ?? next.errorCode;
    status = Object.freeze({
      ...next,
      phase: terminal === null ? next.phase : "error",
      errorCode,
      conflictOrigin: errorCode === "PERSISTENCE_CONFLICT"
        ? next.conflictOrigin ?? unattributedConflictOrigin()
        : null,
      unsaved: holdsUnsavedMaterial(),
      replaceableByImport: importMayReplace(errorCode),
    });
    for (const listener of listeners) listener();
  };
  const syncDerivedStatus = () => {
    if (
      active &&
      (status.unsaved !== holdsUnsavedMaterial() || status.replaceableByImport !== importMayReplace(status.errorCode))
    ) update(status);
  };

  const enterTerminal = (code: RepositoryErrorCode): boolean => {
    if (code !== "PERSISTENCE_SUPERSEDED" && code !== "PERSISTENCE_CLEARED") return false;
    if (terminal === null) {
      terminal = code;
      corruptRecovery = null;
      if (active) update({ ...status, upgradeBlocked: false });
    }
    return true;
  };

  const unsubscribeLifecycle = repository.subscribeLifecycle((event) => {
    if (!active) return;
    if (event === "superseded") enterTerminal("PERSISTENCE_SUPERSEDED");
    else if (event === "cleared") enterTerminal("PERSISTENCE_CLEARED");
    else update({ ...status, upgradeBlocked: event === "upgrade-blocked" });
  });

  const announce = (treeId: string, writeGeneration: number | null) => {
    if (writeGeneration === null) return;
    options.announceGeneration?.({ treeId, writeGeneration, storageSchemaVersion: STORAGE_SCHEMA_VERSION });
  };

  const beginDocument = (treeId: string) => {
    activeImportAttempt = null;
    corruptRecovery = null;
    activeTreeId = treeId;
    documentEpoch += 1;
    basis = UNKNOWN_BASIS;
    persistedHistory = null;
    retention = FULL_HISTORY_RETENTION;
  };

  /**
   * Material before history: when storage refuses a write, the same
   * transaction is retried once after reclaiming recomputable caches, then
   * with fewer durable undo steps. Only a snapshot that cannot fit alone is
   * reported as storage-full. Every write of material and its journal (an
   * ordinary save and a corrupt-row replacement) goes through this one loop.
   */
  const writeShedding = async (
    history: TreeHistory,
    write: (attempt: HistoryRetention) => Promise<RepositoryResult<SnapshotBasis>>,
    stillCurrent: () => boolean,
  ): Promise<Readonly<{ saved: RepositoryResult<SnapshotBasis>; retention: HistoryRetention }>> => {
    let attempt = retention;
    let reclaimed = false;
    for (;;) {
      const saved = await write(attempt);
      if (saved.ok || saved.error.code !== "PERSISTENCE_STORAGE_FULL") return { saved, retention: attempt };
      if (!stillCurrent()) return { saved, retention: attempt };
      if (!reclaimed) {
        reclaimed = true;
        if (await repository.reclaimDerivedStorage()) continue;
      }
      const next = shedHistoryRetention(history, attempt);
      if (next === null) return { saved, retention: attempt };
      attempt = next;
    }
  };

  const saveShedding = (document: PendingDocument, bundle: SnapshotBundle, saveEpoch: number) =>
    writeShedding(
      document.history,
      (attempt) => repository.save({
        treeId: document.tree.id,
        treeRevision: document.tree.revision,
        bundle,
        basis,
        history: document.history,
        retention: attempt,
      }),
      () => active && saveEpoch === documentEpoch,
    );

  const drain = async () => {
    if (!active || writing || !ready || pending === null || activeImportAttempt !== null || terminal !== null) return;
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
        enterTerminal(saved.error.code);
        update({ ...status, phase: "error", dirtyRevision: pending.tree.revision, errorCode: saved.error.code });
        break;
      }
      basis = saved.value;
      persistedHistory = pendingDocument.history;
      const shed = savedRetention !== retention;
      retention = savedRetention;
      announce(tree.id, saved.value.writeGeneration);
      const queuedAfterWrite = currentPending();
      update({
        ...status,
        phase: queuedAfterWrite === null ? "saved" : "saving",
        persistedRevision: tree.revision,
        dirtyRevision: queuedAfterWrite?.tree.revision ?? null,
        errorCode: null,
        historyNotice: nextHistoryNotice(status.historyNotice, shed, savedRetention),
      });
    }
    writingDocument = null;
    writing = false;
    syncDerivedStatus();
    if (active && pending !== null && status.phase !== "error") void drain();
  };

  const adoptLoaded = (
    loaded: Readonly<{ tree: ThoughtTree; history: RecoveredHistory; basis: SnapshotBasis }>,
    historyReleased: boolean,
  ): void => {
    basis = loaded.basis;
    // Steps released while reading (an unreadable or missing record, an
    // unusable manifest) are still named by the row. Until a save writes the
    // smaller journal, every reload would find the same damage and announce it
    // again, so a released read never counts as the history storage holds.
    persistedHistory = loaded.history.released ? null : loaded.history.history;
    update({
      ...status,
      phase: "saved",
      persistedRevision: loaded.tree.revision,
      dirtyRevision: null,
      errorCode: null,
      historyNotice: historyReleased ? "unavailable" : null,
    });
  };

  // Nothing that could make a read row stale has happened since it was read:
  // same document, no terminal storage, and no local material or conflict
  // beyond the one an explicit reload replaces.
  const candidateCurrent = (candidate: StoredCandidate): boolean => {
    if (!active || candidate.documentEpoch !== documentEpoch || terminal !== null) return false;
    return candidate.replaces === null
      ? !hasOutstandingWrite() && status.errorCode === null
      : pending === candidate.replaces && !writing && status.errorCode === "PERSISTENCE_CONFLICT";
  };

  const holdConflict = (origin: ConflictOrigin) => {
    if (pending === null) return;
    update({
      ...status,
      phase: "error",
      dirtyRevision: pending.tree.revision,
      errorCode: "PERSISTENCE_CONFLICT",
      conflictOrigin: origin,
    });
  };

  // A row this tab held a generation for is gone: storage was cleared, here or
  // by the browser. Treating it as someone else's newer copy would dead-end.
  const rowCleared = () => basis.writeGeneration !== null && enterTerminal("PERSISTENCE_CLEARED");

  const dirtyImportError = (): ImportedDocumentRejection["errorCode"] => {
    if (writing) return "IMPORT_SAVING";
    if (status.errorCode === "PERSISTENCE_CONFLICT") return "IMPORT_CONFLICT";
    if (status.errorCode === "PERSISTENCE_CORRUPT") return "PERSISTENCE_CORRUPT";
    return "IMPORT_DIRTY";
  };

  const candidateFrom = (
    loaded: Readonly<{ tree: ThoughtTree; history: RecoveredHistory; basis: SnapshotBasis }>,
    replaces: PendingDocument | null,
  ): StoredCandidate => Object.freeze({
    tree: loaded.tree,
    history: loaded.history,
    basis: loaded.basis,
    documentEpoch,
    replaces,
  });

  const observe = (generation: DocumentGeneration): StoredGenerationDecision => {
    if (!active) return "ignored";
    if (generation.storageSchemaVersion > STORAGE_SCHEMA_VERSION) {
      enterTerminal("PERSISTENCE_SUPERSEDED");
      return "superseded";
    }
    if (!ready || terminal !== null || generation.treeId !== activeTreeId) return "ignored";
    if (basis.writeGeneration !== null && generation.writeGeneration <= basis.writeGeneration) return "ignored";
    if (status.errorCode === "PERSISTENCE_CONFLICT") return "conflict";
    // An in-flight write or import meets the newer row through its own CAS.
    if (writing || activeImportAttempt !== null) return "conflict";
    if (pending !== null) {
      holdConflict("another-tab");
      return "conflict";
    }
    return "refresh";
  };

  return Object.freeze({
    async start(tree, history = createTreeHistory()) {
      beginDocument(tree.id);
      const startEpoch = documentEpoch;
      const loaded = await repository.load(tree.id);
      if (!active || startEpoch !== documentEpoch) return null;
      ready = true;
      // The material a document instance begins with is nobody's change yet.
      if (!loaded.ok) {
        pending = Object.freeze({ tree, history, authored: false });
        enterTerminal(loaded.error.code);
        update({
          ...status,
          phase: "error",
          persistedRevision: null,
          dirtyRevision: tree.revision,
          errorCode: loaded.error.code,
          historyNotice: null,
        });
        return null;
      }
      if (loaded.value === null) {
        pending = Object.freeze({ tree, history, authored: false });
        void drain();
        return null;
      }
      // Read, not adopted: the phase stays loading until the store takes it.
      return candidateFrom(loaded.value, null);
    },

    publish(tree, history = createTreeHistory(), authored = true) {
      if (tree.id !== activeTreeId) return;
      if (pending?.tree === tree && pending.history === history) return;
      if (writingDocument?.tree === tree && writingDocument.history === history) {
        // The latest publication returned to the exact value already being
        // written. Any different pending value is now stale and must not win
        // merely because it arrived between the two identical publications.
        // If this write fails, drain's failure path requeues writingDocument.
        pending = null;
        syncDerivedStatus();
        return;
      }
      // An unchanged revision is skipped only with the history last saved or
      // loaded whole: a step released at read, at attach, or at use changes
      // history alone, and storage must stop offering it (and its notice) on
      // the next reload.
      if (
        pending === null &&
        status.phase === "saved" &&
        status.persistedRevision === tree.revision &&
        sameDurableHistory(history, persistedHistory)
      ) return;
      pending = Object.freeze({ tree, history, authored });
      if (ready && status.phase !== "error") void drain();
      else if (ready) update({ ...status, dirtyRevision: tree.revision });
      syncDerivedStatus();
    },

    async prepareImportedTree(tree, importOptions = {}) {
      const validation = validateThoughtTree(tree);
      if (!validation.ok) return Object.freeze({ ok: false, errorCode: "IMPORT_INVALID_TREE" });

      let bundle;
      try {
        bundle = treeToBundle(tree);
      } catch {
        return Object.freeze({ ok: false, errorCode: "IMPORT_INVALID_TREE" });
      }
      if (terminal !== null) return Object.freeze({ ok: false, errorCode: terminal });
      // One preparation owns the persistence seam until it is either activated
      // or explicitly discarded. This prevents two archives from reserving the
      // same missing row and making the newer attempt fail behind the older one.
      if (activeImportAttempt !== null) {
        return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
      }
      // A same-document import cannot race an old in-memory save. Unsaved
      // material storage refused may be replaced only by explicit choice, and
      // only while nothing is being written.
      const sameDocument = tree.id === activeTreeId;
      const dirty = sameDocument && (writing || pending !== null);
      const replacingUnsaved = dirty &&
        importOptions.replaceUnsaved === true &&
        importMayReplace(status.errorCode);
      if (dirty && !replacingUnsaved) {
        return Object.freeze({ ok: false, errorCode: dirtyImportError() });
      }
      const attemptId = ++importAttemptSequence;
      activeImportAttempt = attemptId;
      syncDerivedStatus();
      const rejectAttempt = (errorCode: ImportedDocumentRejection["errorCode"]): ImportedDocumentRejection => {
        if (activeImportAttempt === attemptId) {
          activeImportAttempt = null;
          syncDerivedStatus();
          if (active && pending !== null && status.phase !== "error") void drain();
        }
        return Object.freeze({ ok: false, errorCode });
      };
      let expectedGeneration: number | null;
      if (replacingUnsaved) {
        // The refused material never reached storage, so the row this tab
        // last loaded or saved remains the CAS basis for the replacement.
        expectedGeneration = basis.writeGeneration;
      } else {
        const loaded = await repository.load(tree.id);
        if (!active || activeImportAttempt !== attemptId) return rejectAttempt("PERSISTENCE_UNAVAILABLE");
        if (!loaded.ok) {
          enterTerminal(loaded.error.code);
          return rejectAttempt(importRepositoryError(loaded.error.code));
        }
        if (loaded.value !== null && sameDocument && (writing || pending !== null)) {
          return rejectAttempt(dirtyImportError());
        }
        expectedGeneration = loaded.value?.basis.writeGeneration ?? null;
      }
      // Replace is an explicit document-boundary authorization. A valid older
      // bundle with the same tree id may therefore replace the current row; the
      // repository owns its CAS, empty-history write, and rollback capability.
      const reserved = await repository.reserveImportedSnapshot(
        tree.id,
        tree.revision,
        bundle,
        expectedGeneration,
      );
      if (!active || activeImportAttempt !== attemptId) {
        if (reserved.ok) await repository.rollbackImportedSnapshot(reserved.value);
        return rejectAttempt("PERSISTENCE_UNAVAILABLE");
      }
      if (!reserved.ok) {
        enterTerminal(reserved.error.code);
        return rejectAttempt(importRepositoryError(reserved.error.code));
      }
      return Object.freeze({
        ok: true,
        attemptId,
        createdSnapshot: expectedGeneration === null,
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
      persistedHistory = createTreeHistory();
      pending = null;
      update({
        ...status,
        phase: "saved",
        persistedRevision: prepared.tree.revision,
        dirtyRevision: null,
        errorCode: null,
        historyNotice: null,
      });
      announce(prepared.tree.id, basis.writeGeneration);
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
        enterTerminal(errorCode);
        if (active && pending !== null) {
          update({
            ...status,
            phase: "error",
            dirtyRevision: pending.tree.revision,
            errorCode,
          });
        }
        syncDerivedStatus();
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
      announce(prepared.tree.id, rolledBack.value.writeGeneration);
      syncDerivedStatus();
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
      if (!exported.ok && enterTerminal(exported.error.code)) {
        return Object.freeze({ ok: false, errorCode: exported.error.code });
      }
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
      const { saved: replaced, retention: replacedRetention } = await writeShedding(
        replacement.history,
        (attempt) => repository.replaceCorrupt({
          treeId: replacement.tree.id,
          treeRevision: replacement.tree.revision,
          bundle,
          history: replacement.history,
          retention: attempt,
        }, recovery.basis),
        () => active && recovery.documentEpoch === documentEpoch && corruptRecovery === recovery,
      );
      if (!replaced.ok) {
        const errorCode = replaced.error.code;
        if (enterTerminal(errorCode)) return Object.freeze({ ok: false, errorCode });
        if (!active || recovery.documentEpoch !== documentEpoch || corruptRecovery !== recovery) {
          return Object.freeze({ ok: false, errorCode });
        }
        if (errorCode === "PERSISTENCE_CONFLICT") {
          // The stored row is no longer the one the person exported.
          corruptRecovery = null;
          update({ ...status, errorCode });
        }
        // Storage refused the replacement (full even without history, or a
        // failed write): the damaged row is still exactly the exported one.
        // The recovery basis and the corrupt status stay, so Replace can be
        // tried again, while Retry and archive replacement, which would
        // compare against a generation this tab never read, stay closed.
        return Object.freeze({ ok: false, errorCode });
      }
      corruptRecovery = null;
      if (!active || recovery.documentEpoch !== documentEpoch || replacement.tree.id !== activeTreeId) {
        return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      }
      basis = replaced.value;
      persistedHistory = replacement.history;
      const shed = replacedRetention !== retention;
      retention = replacedRetention;
      announce(replacement.tree.id, replaced.value.writeGeneration);
      if (pending === replacement) pending = null;
      const queued = pending;
      update({
        ...status,
        phase: queued === null ? "saved" : "saving",
        persistedRevision: replacement.tree.revision,
        dirtyRevision: queued?.tree.revision ?? null,
        errorCode: null,
        historyNotice: nextHistoryNotice(status.historyNotice, shed, replacedRetention),
      });
      if (queued !== null) void drain();
      return Object.freeze({ ok: true });
    },

    declareConflict(tree, history = createTreeHistory(), origin = "another-tab", authored = true) {
      if (!active || !ready || tree.id !== activeTreeId) return;
      pending = Object.freeze({ tree, history, authored });
      holdConflict(origin);
    },

    retry() {
      if (!active || !ready || pending === null || activeImportAttempt !== null) return;
      if (
        terminal !== null ||
        status.errorCode === "PERSISTENCE_CONFLICT" ||
        status.errorCode === "PERSISTENCE_CORRUPT"
      ) return;
      retention = FULL_HISTORY_RETENTION;
      update({ ...status, phase: "saving", errorCode: null });
      void drain();
    },

    async resolveConflict() {
      if (!active || !ready || pending === null || status.errorCode !== "PERSISTENCE_CONFLICT") {
        return null;
      }
      const dirtyDocument = pending;
      const resolveEpoch = documentEpoch;
      const loaded = await repository.load(dirtyDocument.tree.id);
      if (!active || resolveEpoch !== documentEpoch) return null;
      if (!loaded.ok) {
        enterTerminal(loaded.error.code);
        update({ ...status, errorCode: loaded.error.code });
        return null;
      }
      if (loaded.value === null) {
        enterTerminal("PERSISTENCE_CLEARED");
        return null;
      }
      // A commit after the explicit reload gesture wins locally. It keeps the
      // conflict unresolved rather than being silently discarded by hydration.
      if (pending !== dirtyDocument) return null;
      return candidateFrom(loaded.value, dirtyDocument);
    },

    observeStoredGeneration: observe,

    async checkStoredGeneration() {
      if (!active || !ready || activeTreeId === null || terminal !== null) return "ignored";
      const treeId = activeTreeId;
      const read = await repository.readGeneration(treeId);
      if (!read.ok) {
        if (!enterTerminal(read.error.code)) return "ignored";
        return read.error.code === "PERSISTENCE_CLEARED" ? "cleared" : "superseded";
      }
      if (read.value === null) return rowCleared() ? "cleared" : "ignored";
      return observe(Object.freeze({ treeId, ...read.value }));
    },

    async prepareRefresh() {
      if (
        !active ||
        !ready ||
        activeTreeId === null ||
        terminal !== null ||
        status.errorCode !== null ||
        hasOutstandingWrite()
      ) return null;
      const refreshEpoch = documentEpoch;
      const loaded = await repository.load(activeTreeId);
      if (!active || refreshEpoch !== documentEpoch) return null;
      if (!loaded.ok) {
        enterTerminal(loaded.error.code);
        return null;
      }
      if (loaded.value === null) {
        rowCleared();
        return null;
      }
      if (basis.writeGeneration !== null && loaded.value.basis.writeGeneration <= basis.writeGeneration) {
        return null;
      }
      if (hasOutstandingWrite()) {
        if (!writing) holdConflict("another-tab");
        return null;
      }
      return candidateFrom(loaded.value, null);
    },

    adoptStored(candidate, hydrate) {
      if (!candidateCurrent(candidate)) return "stale";
      const hydrated = hydrate(candidate);
      if (hydrated === null) return "refused";
      if (candidate.replaces !== null) pending = null;
      retention = FULL_HISTORY_RETENTION;
      adoptLoaded(candidate, hydrated.historyReleased);
      return "adopted";
    },

    reportHistoryUnavailable() {
      if (!active || status.historyNotice === "unavailable") return;
      update({ ...status, historyNotice: "unavailable" });
    },

    acknowledgeHistoryNotice() {
      if (!active || status.historyNotice === null) return;
      update({ ...status, historyNotice: null });
    },

    dispose() {
      active = false;
      writingDocument = null;
      activeImportAttempt = null;
      corruptRecovery = null;
      listeners.clear();
      unsubscribeLifecycle();
      repository.close();
    },

    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function sameDurableHistory(history: TreeHistory, persisted: TreeHistory | null): boolean {
  if (persisted === null) return false;
  return history === persisted || (
    history.entries.length === 0 && history.redoEntries.length === 0 &&
    persisted.entries.length === 0 && persisted.redoEntries.length === 0
  );
}

/**
 * A shed never hides an unread "unavailable" notice, and "released" ends once
 * a save keeps the whole history again.
 */
function nextHistoryNotice(
  current: HistoryNotice | null,
  shed: boolean,
  savedRetention: HistoryRetention,
): HistoryNotice | null {
  if (shed) return current === "unavailable" ? current : "released";
  return current === "released" && savedRetention === FULL_HISTORY_RETENTION ? null : current;
}

function importRepositoryError(code: RepositoryErrorCode): ImportedDocumentRejection["errorCode"] {
  return code === "PERSISTENCE_CONFLICT" ? "IMPORT_CONFLICT" : code;
}
