import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import type {
  DocumentRepository,
  LoadedSnapshot,
  RepositoryResult,
} from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import type { SnapshotBundle } from "./snapshot-codec";
import type { TreeHistory } from "../tree/history";

describe("persistence controller", () => {
  it("loads a stored tree and reports the persisted revision", async () => {
    const tree = createSeededDocument().tree;
    const repository = fakeRepository({ tree, writeGeneration: 3 });
    const controller = createPersistenceController(repository.port);

    await expect(controller.start(tree)).resolves.toEqual({ storedTree: tree, storedHistory: null });
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: tree.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("holds a diverged load window unsaved instead of choosing a winner", async () => {
    const seeded = createSeededDocument().tree;
    // The person's last session, already on disk and further along.
    const stored = { ...seeded, revision: seeded.revision + 5 };
    const repository = controlledRepository({ tree: stored, writeGeneration: 4 });
    const controller = createPersistenceController(repository.port);

    await expect(controller.start(seeded)).resolves.toEqual({
      storedTree: stored,
      storedHistory: null,
    });
    // What they committed while the read was still in flight. Its revision is
    // higher than the stored one and means nothing: it counts from the seed.
    const live = { ...seeded, revision: seeded.revision + 9 };
    controller.declareConflict(live);

    expect(controller.getStatus()).toEqual({
      phase: "error",
      persistedRevision: stored.revision,
      dirtyRevision: live.revision,
      errorCode: "PERSISTENCE_CONFLICT",
    });
    // The stored session is untouched: nothing was written over it.
    expect(repository.pending).toHaveLength(0);
    expect(repository.savedRevisions).toEqual([]);

    // A later commit does not quietly resume saving over the stored session.
    controller.publish({ ...live, revision: live.revision + 1 });
    await Promise.resolve();
    expect(repository.savedRevisions).toEqual([]);

    // The gesture the index footer already offers resolves it, and only then.
    await expect(controller.resolveConflict()).resolves.toEqual({
      storedTree: stored,
      storedHistory: null,
    });
    expect(controller.getStatus()).toMatchObject({
      phase: "saved",
      persistedRevision: stored.revision,
      errorCode: null,
    });
  });

  it("coalesces revisions published during one write into the latest snapshot", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.expectedGeneration).toBeNull();
    const second = { ...tree, revision: tree.revision + 1 };
    const third = { ...tree, revision: tree.revision + 2 };
    controller.publish(second);
    controller.publish(third);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.treeRevision).toBe(third.revision);
    repository.settleNext({ ok: true, value: 2 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(repository.savedRevisions).toEqual([tree.revision, third.revision]);
  });

  it("writes the inverse journal with the same snapshot transaction", async () => {
    const tree = createSeededDocument().tree;
    const history: TreeHistory = { entries: [], retainedInverseBytes: 0 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);

    await controller.start(tree, history);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.history).toEqual(history);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().phase === "saved");
  });

  it("retains the latest dirty tree on conflict until explicit reload resolves it", async () => {
    const tree = createSeededDocument().tree;
    const newer = { ...tree, revision: tree.revision + 8 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT", message: "conflict" },
    });
    await waitFor(() => controller.getStatus().phase === "error");
    expect(controller.getStatus()).toMatchObject({
      dirtyRevision: tree.revision,
      errorCode: "PERSISTENCE_CONFLICT",
    });
    controller.retry();
    await Promise.resolve();
    expect(repository.pending).toHaveLength(0);

    repository.setLoaded({ tree: newer, writeGeneration: 7 });
    await expect(controller.resolveConflict()).resolves.toEqual({ storedTree: newer, storedHistory: null });
    expect(repository.loads).toBe(2);
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toMatchObject({
      persistedRevision: newer.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("keeps a newer local publish dirty while conflict reload is in flight", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().phase === "error");
    repository.setLoaded({ tree, writeGeneration: 4 });
    repository.deferLoad();
    const resolving = controller.resolveConflict();
    const newerLocal = { ...tree, revision: tree.revision + 2 };
    controller.publish(newerLocal);
    repository.settleLoad();
    await expect(resolving).resolves.toEqual({ storedTree: null, storedHistory: null });
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      dirtyRevision: newerLocal.revision,
      errorCode: "PERSISTENCE_CONFLICT",
    });
  });

  it("retains the latest dirty snapshot after storage fills and drains it on retry", async () => {
    const tree = createSeededDocument().tree;
    const second = { ...tree, revision: tree.revision + 1 };
    const latest = { ...tree, revision: tree.revision + 2 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree);
    await waitFor(() => repository.pending.length === 1);

    controller.publish(second);
    controller.publish(latest);
    repository.settleNext({
      ok: false,
      error: { code: "PERSISTENCE_STORAGE_FULL", message: "storage full" },
    });
    await waitFor(() => controller.getStatus().phase === "error");
    expect(controller.getStatus()).toMatchObject({
      persistedRevision: null,
      dirtyRevision: latest.revision,
      errorCode: "PERSISTENCE_STORAGE_FULL",
    });
    expect(repository.savedRevisions).toEqual([tree.revision]);

    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]).toMatchObject({
      treeRevision: latest.revision,
      expectedGeneration: null,
    });
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: latest.revision,
      dirtyRevision: null,
      errorCode: null,
    });
    expect(repository.savedRevisions).toEqual([tree.revision, latest.revision]);
  });

  it("CAS-saves a foreign imported tree before it becomes the active persistence document", async () => {
    const current = createSeededDocument().tree;
    const imported = { ...createSeededDocument().tree, id: "imported_tree" };
    const saves: Array<{ treeId: string; expectedGeneration: number | null }> = [];
    const repository: DocumentRepository = {
      load: async () => ({ ok: true, value: null }),
      save: async (treeId, _revision, _bundle, expectedGeneration) => {
        saves.push({ treeId, expectedGeneration });
        return { ok: true, value: 8 };
      },
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);
    await controller.start(current);
    const prepared = await controller.prepareImportedTree(imported);

    expect(prepared).toEqual({ ok: true, tree: imported, writeGeneration: 8 });
    expect(saves.some((save) => save.treeId === "imported_tree" && save.expectedGeneration === null)).toBe(true);
    if (!prepared.ok) throw new Error("import preparation rejected");
    controller.activateImportedDocument(prepared);
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: imported.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("rejects a same-id import whose stored bundle differs without saving", async () => {
    const imported = { ...createSeededDocument().tree, id: "existing_tree" };
    const stored = { ...imported, revision: imported.revision + 1 };
    const save = vi.fn();
    const repository: DocumentRepository = {
      load: async () => ({ ok: true, value: { tree: stored, writeGeneration: 3 } }),
      save,
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    await expect(controller.prepareImportedTree(imported)).resolves.toEqual({
      ok: false,
      errorCode: "IMPORT_CONFLICT",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("reserves a new generation for an identical same-id import", async () => {
    const imported = { ...createSeededDocument().tree, id: "existing_tree" };
    const save = vi.fn(async () => ({ ok: true as const, value: 4 }));
    const repository: DocumentRepository = {
      load: async () => ({ ok: true, value: { tree: imported, writeGeneration: 3 } }),
      save,
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    await expect(controller.prepareImportedTree(imported)).resolves.toEqual({
      ok: true,
      tree: imported,
      writeGeneration: 4,
    });
    expect(save).toHaveBeenCalledWith(
      "existing_tree",
      imported.revision,
      expect.anything(),
      3,
      expect.anything(),
    );
  });
});

function fakeRepository(loaded: LoadedSnapshot | null) {
  const port: DocumentRepository = {
    load: async (): Promise<RepositoryResult<LoadedSnapshot | null>> => ({ ok: true, value: loaded }),
    save: async (_treeId, _revision, _bundle, generation) => ({ ok: true, value: (generation ?? 0) + 1 }),
    close: () => undefined,
  };
  return { port };
}

function controlledRepository(initialLoaded: LoadedSnapshot | null = null) {
  let loaded = initialLoaded;
  let pendingLoad: ((result: RepositoryResult<LoadedSnapshot | null>) => void) | null = null;
  let deferNextLoad = false;
  type Pending = {
    treeRevision: number;
    expectedGeneration: number | null;
    history: TreeHistory | undefined;
    settle: (result: RepositoryResult<number>) => void;
  };
  const pending: Pending[] = [];
  const savedRevisions: number[] = [];
  let loads = 0;
  const port: DocumentRepository = {
    load: async () => {
      loads += 1;
      if (!deferNextLoad) return { ok: true, value: loaded };
      deferNextLoad = false;
      return new Promise<RepositoryResult<LoadedSnapshot | null>>((settle) => {
        pendingLoad = settle;
      });
    },
    save: async (_treeId: string, treeRevision: number, bundle: SnapshotBundle, expectedGeneration, history) => {
      void bundle;
      savedRevisions.push(treeRevision);
      return new Promise<RepositoryResult<number>>((settle) => pending.push({ treeRevision, expectedGeneration, history, settle }));
    },
    close: () => undefined,
  };
  return {
    port,
    pending,
    savedRevisions,
    get loads() {
      return loads;
    },
    setLoaded(value: LoadedSnapshot | null) {
      loaded = value;
    },
    deferLoad() {
      deferNextLoad = true;
    },
    settleLoad() {
      if (pendingLoad === null) throw new Error("no pending load");
      const settle = pendingLoad;
      pendingLoad = null;
      settle({ ok: true, value: loaded });
    },
    settleNext(result: RepositoryResult<number>) {
      const write = pending.shift();
      if (write === undefined) throw new Error("no pending write");
      write.settle(result);
    },
  };
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (assertion()) return;
    await Promise.resolve();
  }
  throw new Error("condition did not settle");
}
