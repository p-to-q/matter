import type {
  CorruptSnapshotBasis,
  DocumentRepository,
  ImportedSnapshotReservation,
  RepositoryErrorCode,
} from "./document-repository";
import { treeToBundle } from "./snapshot-codec";
import { validateThoughtTree } from "../tree/invariants";
import type { ThoughtTree } from "../tree/model";
import { createTreeHistory, type TreeHistory } from "../tree/history";

export type PersistenceStatus = Readonly<{
  phase: "loading" | "saved" | "saving" | "error";
  persistedRevision: number | null;
  dirtyRevision: number | null;
  errorCode: RepositoryErrorCode | null;
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
  start(tree: ThoughtTree, history?: TreeHistory): Promise<Readonly<{
    storedTree: ThoughtTree | null;
    storedHistory: unknown | null;
  }>>;
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
  resolveConflict(): Promise<Readonly<{ storedTree: ThoughtTree | null; storedHistory: unknown | null }>>;
  flush(): void;
  dispose(): void;
  getStatus(): PersistenceStatus;
  subscribe(listener: () => void): () => void;
}>;

export function createPersistenceController(repository: DocumentRepository): PersistenceController {
  let active = true;
  let ready = false;
  let writing = false;
  let activeTreeId: string | null = null;
  let documentEpoch = 0;
  let baseGeneration: number | null = null;
  let pending: Readonly<{ tree: ThoughtTree; history: TreeHistory }> | null = null;
  let importAttemptSequence = 0;
  let activeImportAttempt: number | null = null;
  let corruptRecovery: Readonly<{
    basis: CorruptSnapshotBasis;
    documentEpoch: number;
    dirtyDocument: Readonly<{ tree: ThoughtTree; history: TreeHistory }>;
  }> | null = null;
  let status: PersistenceStatus = Object.freeze({
    phase: "loading",
    persistedRevision: null,
    dirtyRevision: null,
    errorCode: null,
  });
  const listeners = new Set<() => void>();
  // Async repository writes may overlap a publish() call; reading through this
  // seam prevents compile-time narrowing from erasing that runtime transition.
  const currentPending = (): Readonly<{ tree: ThoughtTree; history: TreeHistory }> | null => pending;

  const update = (next: PersistenceStatus) => {
    status = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  const drain = async () => {
    if (!active || writing || !ready || pending === null || activeImportAttempt !== null) return;
    writing = true;
    const drainEpoch = documentEpoch;
    while (active && pending !== null) {
      const pendingDocument = pending;
      pending = null;
      const { tree, history } = pendingDocument;
      update({
        phase: "saving",
        persistedRevision: status.persistedRevision,
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
      const saved = await repository.save(tree.id, tree.revision, bundle, baseGeneration, history);
      if (!active || drainEpoch !== documentEpoch || tree.id !== activeTreeId) break;
      if (!saved.ok) {
        pending ??= pendingDocument;
        update({ ...status, phase: "error", dirtyRevision: pending.tree.revision, errorCode: saved.error.code });
        break;
      }
      baseGeneration = saved.value;
      const queuedAfterWrite = currentPending();
      update({
        phase: queuedAfterWrite === null ? "saved" : "saving",
        persistedRevision: tree.revision,
        dirtyRevision: queuedAfterWrite?.tree.revision ?? null,
        errorCode: null,
      });
    }
    writing = false;
    if (active && pending !== null && status.phase !== "error") void drain();
  };

  return Object.freeze({
    async start(tree, history = createTreeHistory()) {
      activeImportAttempt = null;
      corruptRecovery = null;
      activeTreeId = tree.id;
      documentEpoch += 1;
      const startEpoch = documentEpoch;
      const loaded = await repository.load(tree.id);
      if (!active || startEpoch !== documentEpoch) return Object.freeze({ storedTree: null, storedHistory: null });
      if (!loaded.ok) {
        ready = true;
        pending = Object.freeze({ tree, history });
        update({ phase: "error", persistedRevision: null, dirtyRevision: tree.revision, errorCode: loaded.error.code });
        return Object.freeze({ storedTree: null, storedHistory: null });
      }
      ready = true;
      baseGeneration = loaded.value?.writeGeneration ?? null;
      if (loaded.value === null) {
        pending = Object.freeze({ tree, history });
        void drain();
        return Object.freeze({ storedTree: null, storedHistory: null });
      }
      update({ phase: "saved", persistedRevision: loaded.value.tree.revision, dirtyRevision: null, errorCode: null });
      return Object.freeze({ storedTree: loaded.value.tree, storedHistory: loaded.value.history ?? null });
    },

    publish(tree, history = createTreeHistory()) {
      if (tree.id !== activeTreeId) return;
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
        loaded.value?.writeGeneration ?? null,
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
        writeGeneration: reserved.value.imported.writeGeneration,
        reservation: reserved.value,
      });
    },

    activateImportedDocument(prepared) {
      if (activeImportAttempt !== prepared.attemptId) return;
      // Late writes from the previous document are ignored by their epoch once
      // this switch takes effect; the imported tree already has a successful CAS.
      activeImportAttempt = null;
      corruptRecovery = null;
      documentEpoch += 1;
      activeTreeId = prepared.tree.id;
      ready = true;
      baseGeneration = prepared.writeGeneration;
      pending = null;
      update({
        phase: "saved",
        persistedRevision: prepared.tree.revision,
        dirtyRevision: null,
        errorCode: null,
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
      if (prepared.tree.id === activeTreeId) {
        baseGeneration = rolledBack.value.writeGeneration;
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
      const replaced = await repository.replaceCorrupt(
        replacement.tree.id,
        replacement.tree.revision,
        bundle,
        replacement.history,
        recovery.basis,
      );
      if (!replaced.ok) {
        corruptRecovery = null;
        update({ ...status, errorCode: replaced.error.code });
        return Object.freeze({ ok: false, errorCode: replaced.error.code });
      }
      corruptRecovery = null;
      if (!active || recovery.documentEpoch !== documentEpoch || replacement.tree.id !== activeTreeId) {
        return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CONFLICT" });
      }
      baseGeneration = replaced.value;
      if (pending === replacement) pending = null;
      const queued = pending;
      update({
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
        phase: "error",
        persistedRevision: status.persistedRevision,
        dirtyRevision: tree.revision,
        errorCode: "PERSISTENCE_CONFLICT",
      });
    },

    retry() {
      if (!active || !ready || pending === null) return;
      if (status.errorCode === "PERSISTENCE_CONFLICT" || status.errorCode === "PERSISTENCE_CORRUPT") return;
      update({ ...status, phase: "saving", errorCode: null });
      void drain();
    },

    async resolveConflict() {
      if (!active || !ready || pending === null || status.errorCode !== "PERSISTENCE_CONFLICT") {
        return Object.freeze({ storedTree: null, storedHistory: null });
      }
      const dirtyDocument = pending;
      const loaded = await repository.load(dirtyDocument.tree.id);
      if (!active) return Object.freeze({ storedTree: null, storedHistory: null });
      if (!loaded.ok || loaded.value === null) {
        update({
          ...status,
          phase: "error",
          dirtyRevision: pending?.tree.revision ?? dirtyDocument.tree.revision,
          errorCode: loaded.ok ? "PERSISTENCE_CONFLICT" : loaded.error.code,
        });
        return Object.freeze({ storedTree: null, storedHistory: null });
      }
      // A commit after the explicit reload gesture wins locally. It keeps the
      // conflict unresolved rather than being silently discarded by hydration.
      if (pending !== dirtyDocument) return Object.freeze({ storedTree: null, storedHistory: null });
      pending = null;
      baseGeneration = loaded.value.writeGeneration;
      update({
        phase: "saved",
        persistedRevision: loaded.value.tree.revision,
        dirtyRevision: null,
        errorCode: null,
      });
      return Object.freeze({ storedTree: loaded.value.tree, storedHistory: loaded.value.history ?? null });
    },

    flush() {
      if (active && ready && status.phase !== "error") void drain();
    },

    dispose() {
      active = false;
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
