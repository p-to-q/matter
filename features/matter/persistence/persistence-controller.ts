import type { DocumentRepository, RepositoryErrorCode } from "./document-repository";
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
  tree: ThoughtTree;
  writeGeneration: number;
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
    if (!active || writing || !ready || pending === null) return;
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
      // A same-document import cannot race an old in-memory save. Rejecting it
      // keeps the successful CAS generation and the runtime switch coherent.
      if (tree.id === activeTreeId && (writing || pending !== null)) {
        return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
      }
      const loaded = await repository.load(tree.id);
      if (!active) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_UNAVAILABLE" });
      if (!loaded.ok) return Object.freeze({ ok: false, errorCode: importRepositoryError(loaded.error.code) });

      if (loaded.value !== null) {
        if (tree.id === activeTreeId && (writing || pending !== null)) {
          return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
        }
        let storedBundle;
        try {
          storedBundle = treeToBundle(loaded.value.tree);
        } catch {
          return Object.freeze({ ok: false, errorCode: "PERSISTENCE_CORRUPT" });
        }
        if (!bundlesEqual(bundle, storedBundle)) {
          return Object.freeze({ ok: false, errorCode: "IMPORT_CONFLICT" });
        }
        // Reserve a fresh generation even for byte-identical material. This
        // linearizes the later runtime switch against a save that starts after
        // the load, instead of trusting a generation observed in the past.
        const reserved = await repository.save(tree.id, tree.revision, bundle, loaded.value.writeGeneration, loaded.value.history ?? createTreeHistory());
        if (!active) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_UNAVAILABLE" });
        if (!reserved.ok) return Object.freeze({ ok: false, errorCode: importRepositoryError(reserved.error.code) });
        return Object.freeze({ ok: true, tree, writeGeneration: reserved.value });
      }

      const saved = await repository.save(tree.id, tree.revision, bundle, null, createTreeHistory());
      if (!active) return Object.freeze({ ok: false, errorCode: "PERSISTENCE_UNAVAILABLE" });
      if (!saved.ok) {
        return Object.freeze({
          ok: false,
          errorCode: importRepositoryError(saved.error.code),
        });
      }
      return Object.freeze({ ok: true, tree, writeGeneration: saved.value });
    },

    activateImportedDocument(prepared) {
      // Late writes from the previous document are ignored by their epoch once
      // this switch takes effect; the imported tree already has a successful CAS.
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
      if (status.errorCode === "PERSISTENCE_CONFLICT") return;
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

function bundlesEqual(left: ReturnType<typeof treeToBundle>, right: ReturnType<typeof treeToBundle>): boolean {
  const leftPaths = Object.keys(left.files).sort();
  const rightPaths = Object.keys(right.files).sort();
  if (leftPaths.length !== rightPaths.length) return false;
  return leftPaths.every((path, index) =>
    path === rightPaths[index] &&
    left.files[path as keyof typeof left.files] === right.files[path as keyof typeof right.files],
  );
}

function importRepositoryError(code: RepositoryErrorCode): ImportedDocumentRejection["errorCode"] {
  return code === "PERSISTENCE_CONFLICT" ? "IMPORT_CONFLICT" : code;
}
