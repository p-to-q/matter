import type { DocumentRepository, RepositoryErrorCode } from "./document-repository";
import { treeToBundle } from "./snapshot-codec";
import type { ThoughtTree } from "../tree/model";

export type PersistenceStatus = Readonly<{
  phase: "loading" | "saved" | "saving" | "error";
  persistedRevision: number | null;
  dirtyRevision: number | null;
  errorCode: RepositoryErrorCode | null;
}>;

export type PersistenceController = Readonly<{
  start(tree: ThoughtTree): Promise<Readonly<{ storedTree: ThoughtTree | null }>>;
  publish(tree: ThoughtTree): void;
  retry(): void;
  resolveConflict(): Promise<Readonly<{ storedTree: ThoughtTree | null }>>;
  flush(): void;
  dispose(): void;
  getStatus(): PersistenceStatus;
  subscribe(listener: () => void): () => void;
}>;

export function createPersistenceController(repository: DocumentRepository): PersistenceController {
  let active = true;
  let ready = false;
  let writing = false;
  let baseGeneration: number | null = null;
  let pending: ThoughtTree | null = null;
  let status: PersistenceStatus = Object.freeze({
    phase: "loading",
    persistedRevision: null,
    dirtyRevision: null,
    errorCode: null,
  });
  const listeners = new Set<() => void>();
  // Async repository writes may overlap a publish() call; reading through this
  // seam prevents compile-time narrowing from erasing that runtime transition.
  const currentPending = (): ThoughtTree | null => pending;

  const update = (next: PersistenceStatus) => {
    status = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  const drain = async () => {
    if (!active || writing || !ready || pending === null) return;
    writing = true;
    while (active && pending !== null) {
      const tree = pending;
      pending = null;
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
        pending = tree;
        update({ ...status, phase: "error", dirtyRevision: tree.revision, errorCode: "PERSISTENCE_WRITE_FAILED" });
        break;
      }
      const saved = await repository.save(tree.id, tree.revision, bundle, baseGeneration);
      if (!active) break;
      if (!saved.ok) {
        pending ??= tree;
        update({ ...status, phase: "error", dirtyRevision: pending.revision, errorCode: saved.error.code });
        break;
      }
      baseGeneration = saved.value;
      const queuedAfterWrite = currentPending();
      update({
        phase: queuedAfterWrite === null ? "saved" : "saving",
        persistedRevision: tree.revision,
        dirtyRevision: queuedAfterWrite?.revision ?? null,
        errorCode: null,
      });
    }
    writing = false;
    if (active && pending !== null && status.phase !== "error") void drain();
  };

  return Object.freeze({
    async start(tree) {
      const loaded = await repository.load(tree.id);
      if (!active) return Object.freeze({ storedTree: null });
      if (!loaded.ok) {
        ready = true;
        pending = tree;
        update({ phase: "error", persistedRevision: null, dirtyRevision: tree.revision, errorCode: loaded.error.code });
        return Object.freeze({ storedTree: null });
      }
      ready = true;
      baseGeneration = loaded.value?.writeGeneration ?? null;
      if (loaded.value === null) {
        pending = tree;
        void drain();
        return Object.freeze({ storedTree: null });
      }
      update({ phase: "saved", persistedRevision: loaded.value.tree.revision, dirtyRevision: null, errorCode: null });
      return Object.freeze({ storedTree: loaded.value.tree });
    },

    publish(tree) {
      if (pending === null && status.phase === "saved" && status.persistedRevision === tree.revision) return;
      pending = tree;
      if (ready && status.phase !== "error") void drain();
      else if (ready) update({ ...status, dirtyRevision: tree.revision });
    },

    retry() {
      if (!active || !ready || pending === null) return;
      if (status.errorCode === "PERSISTENCE_CONFLICT") return;
      update({ ...status, phase: "saving", errorCode: null });
      void drain();
    },

    async resolveConflict() {
      if (!active || !ready || pending === null || status.errorCode !== "PERSISTENCE_CONFLICT") {
        return Object.freeze({ storedTree: null });
      }
      const dirtyTree = pending;
      const loaded = await repository.load(dirtyTree.id);
      if (!active) return Object.freeze({ storedTree: null });
      if (!loaded.ok || loaded.value === null) {
        update({
          ...status,
          phase: "error",
          dirtyRevision: pending?.revision ?? dirtyTree.revision,
          errorCode: loaded.ok ? "PERSISTENCE_CONFLICT" : loaded.error.code,
        });
        return Object.freeze({ storedTree: null });
      }
      // A commit after the explicit reload gesture wins locally. It keeps the
      // conflict unresolved rather than being silently discarded by hydration.
      if (pending !== dirtyTree) return Object.freeze({ storedTree: null });
      pending = null;
      baseGeneration = loaded.value.writeGeneration;
      update({
        phase: "saved",
        persistedRevision: loaded.value.tree.revision,
        dirtyRevision: null,
        errorCode: null,
      });
      return Object.freeze({ storedTree: loaded.value.tree });
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
