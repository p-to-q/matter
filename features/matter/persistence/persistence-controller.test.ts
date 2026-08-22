import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import {
  STORAGE_SCHEMA_VERSION,
  type CorruptSnapshotExport,
  type DocumentRepository,
  type ImportedSnapshotReservation,
  type LoadedSnapshot,
  type RepositoryResult,
} from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import { treeToBundle, type SnapshotBundle } from "./snapshot-codec";
import { createTreeHistory, type TreeHistory } from "../tree/history";
import { createDocumentImportCoordinator } from "./document-import-coordinator";

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

  it("does not write an exact tree and history reference twice while it is in flight", async () => {
    const tree = createSeededDocument().tree;
    const history = createTreeHistory();
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree, history);
    await waitFor(() => repository.pending.length === 1);

    controller.publish(tree, history);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().phase === "saved");

    expect(repository.savedRevisions).toEqual([tree.revision]);
    expect(repository.pending).toHaveLength(0);
  });

  it("lets the last exact publication cancel a newer stale pending value", async () => {
    const tree = createSeededDocument().tree;
    const history = createTreeHistory();
    const newer = { ...tree, revision: tree.revision + 1 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree, history);
    await waitFor(() => repository.pending.length === 1);

    controller.publish(newer, history);
    controller.publish(tree, history);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().phase === "saved");

    expect(repository.savedRevisions).toEqual([tree.revision]);
    expect(repository.pending).toHaveLength(0);
    expect(controller.getStatus().persistedRevision).toBe(tree.revision);
  });

  it("coalesces one hundred real revision publications into the first and latest write", async () => {
    const tree = createSeededDocument().tree;
    const rootId = tree.rootId!;
    const history = createTreeHistory();
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree, history);
    await waitFor(() => repository.pending.length === 1);

    let latest = tree;
    for (let revision = 1; revision <= 100; revision += 1) {
      latest = {
        ...tree,
        revision: tree.revision + revision,
        nodes: {
          ...tree.nodes,
          [rootId]: {
            ...tree.nodes[rootId],
            text: `${tree.nodes[rootId].text} ${revision}`,
            updatedAt: "2026-08-22T12:00:00.000Z",
          },
        },
      };
      controller.publish(latest, history);
    }

    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.treeRevision).toBe(latest.revision);
    repository.settleNext({ ok: true, value: 2 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(repository.savedRevisions).toEqual([tree.revision, latest.revision]);
  });

  it("flushes the latest hidden-page candidate without forking the active write", async () => {
    const tree = createSeededDocument().tree;
    const latest = { ...tree, revision: tree.revision + 1 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await controller.start(tree);
    await waitFor(() => repository.pending.length === 1);
    controller.publish(latest);

    controller.flush();
    expect(repository.pending).toHaveLength(1);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.treeRevision).toBe(latest.revision);
    repository.settleNext({ ok: true, value: 2 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(repository.savedRevisions).toEqual([tree.revision, latest.revision]);
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

  it("CAS-reserves a different valid same-id bundle after explicit archive replacement", async () => {
    const imported = createSeededDocument().tree;
    const stored = { ...imported, revision: imported.revision + 3 };
    const reservation = importReservation(imported, 4, stored, 3);
    const reserveImportedSnapshot = vi.fn(async () => ({ ok: true as const, value: reservation }));
    const repository: DocumentRepository = {
      ...unsupportedRecovery(),
      load: async () => ({ ok: true, value: { tree: stored, writeGeneration: 3 } }),
      save: vi.fn(),
      reserveImportedSnapshot,
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    await expect(controller.prepareImportedTree(imported)).resolves.toMatchObject({
      ok: true,
      createdSnapshot: false,
      tree: imported,
      writeGeneration: 4,
      reservation,
    });
    expect(reserveImportedSnapshot).toHaveBeenCalledWith(
      imported.id,
      imported.revision,
      treeToBundle(imported),
      3,
    );
  });

  it("keeps an exact same-id archive import working and activates its empty-history generation", async () => {
    const imported = createSeededDocument().tree;
    const reservation = importReservation(imported, 4, imported, 3);
    const repository: DocumentRepository = {
      ...unsupportedRecovery(),
      load: async () => ({ ok: true, value: { tree: imported, writeGeneration: 3 } }),
      save: vi.fn(),
      reserveImportedSnapshot: async () => ({ ok: true, value: reservation }),
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    const prepared = await controller.prepareImportedTree(imported);
    expect(prepared).toMatchObject({ ok: true, tree: imported, writeGeneration: 4 });
    if (!prepared.ok) throw new Error("import preparation rejected");
    expect(prepared.reservation.imported.history).toEqual(createTreeHistory());
    controller.activateImportedDocument(prepared);
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: imported.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("rolls a stale prepared import back before draining a newer local commit", async () => {
    const imported = createSeededDocument().tree;
    const current = { ...imported, revision: imported.revision + 3 };
    const newer = { ...current, revision: current.revision + 1 };
    const reservation = importReservation(imported, 4, current, 3);
    let settleReserve!: (result: RepositoryResult<ImportedSnapshotReservation>) => void;
    let settleRollback!: (result: Awaited<ReturnType<DocumentRepository["rollbackImportedSnapshot"]>>) => void;
    let settleSave!: (result: RepositoryResult<number>) => void;
    const reserveImportedSnapshot = vi.fn(() => new Promise<RepositoryResult<ImportedSnapshotReservation>>((resolve) => {
      settleReserve = resolve;
    }));
    const rollbackImportedSnapshot = vi.fn(() => new Promise<Awaited<ReturnType<DocumentRepository["rollbackImportedSnapshot"]>>>((resolve) => {
      settleRollback = resolve;
    }));
    const save = vi.fn(() => new Promise<RepositoryResult<number>>((resolve) => {
      settleSave = resolve;
    }));
    const repository: DocumentRepository = {
      ...unsupportedRecovery(),
      load: async () => ({ ok: true, value: { tree: current, writeGeneration: 3 } }),
      save,
      reserveImportedSnapshot,
      rollbackImportedSnapshot,
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);
    await controller.start(current);
    const basis = { treeId: current.id, revision: current.revision, documentEpoch: 4 };
    let currentBasis = basis;
    const switchDocument = vi.fn();
    const coordinator = createDocumentImportCoordinator(controller, switchDocument, () => currentBasis);

    const importing = coordinator.importValidatedTree(imported, basis);
    await waitFor(() => reserveImportedSnapshot.mock.calls.length === 1);
    controller.publish(newer);
    currentBasis = { ...basis, revision: newer.revision };
    settleReserve({ ok: true, value: reservation });
    await waitFor(() => rollbackImportedSnapshot.mock.calls.length === 1);
    expect(save).not.toHaveBeenCalled();

    settleRollback({ ok: true, value: { status: "rolled-back", writeGeneration: 5 } });
    await expect(importing).resolves.toEqual({ status: "rejected", errorCode: "IMPORT_STALE" });
    await waitFor(() => save.mock.calls.length === 1);
    expect(save).toHaveBeenCalledWith(
      newer.id,
      newer.revision,
      treeToBundle(newer),
      5,
      expect.anything(),
    );
    settleSave({ ok: true, value: 6 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toMatchObject({ persistedRevision: newer.revision, errorCode: null });
    expect(switchDocument).not.toHaveBeenCalled();
  });

  it("requires an exact corrupt export before atomically replacing local storage", async () => {
    const tree = createSeededDocument().tree;
    const history = { entries: [], retainedInverseBytes: 0 };
    const basis = { treeId: tree.id, serialized: "{\"damaged\":true}" };
    const repository: DocumentRepository = {
      ...unsupportedRecovery(),
      load: async () => ({
        ok: false,
        error: { code: "PERSISTENCE_CORRUPT", message: "damaged" },
      }),
      save: vi.fn(),
      exportCorrupt: vi.fn(async (): Promise<RepositoryResult<CorruptSnapshotExport>> => ({
        ok: true as const,
        value: { basis, bytes: new TextEncoder().encode(basis.serialized) },
      })),
      replaceCorrupt: vi.fn(async () => ({ ok: true as const, value: 6 })),
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    await controller.start(tree, history);
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      errorCode: "PERSISTENCE_CORRUPT",
    });
    controller.retry();
    expect(repository.save).not.toHaveBeenCalled();
    await expect(controller.replaceCorrupt()).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_CONFLICT",
    });

    const exported = await controller.exportCorruptRecovery();
    expect(exported).toMatchObject({ ok: true, fileName: `${tree.id}.matter-recovery.json` });
    await expect(controller.replaceCorrupt()).resolves.toEqual({ ok: true });
    expect(repository.replaceCorrupt).toHaveBeenCalledWith(
      tree.id,
      tree.revision,
      expect.anything(),
      history,
      basis,
    );
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: tree.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("invalidates a corrupt export when newer local material arrives", async () => {
    const tree = createSeededDocument().tree;
    let settleExport!: (result: RepositoryResult<CorruptSnapshotExport>) => void;
    const repository: DocumentRepository = {
      ...unsupportedRecovery(),
      load: async () => ({
        ok: false,
        error: { code: "PERSISTENCE_CORRUPT", message: "damaged" },
      }),
      save: vi.fn(),
      exportCorrupt: vi.fn((): Promise<RepositoryResult<CorruptSnapshotExport>> => new Promise((resolve) => {
        settleExport = resolve;
      })),
      replaceCorrupt: vi.fn(),
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);
    await controller.start(tree);

    const exporting = controller.exportCorruptRecovery();
    controller.publish({ ...tree, revision: tree.revision + 1 });
    settleExport({
      ok: true,
      value: {
        basis: { treeId: tree.id, serialized: "{}" },
        bytes: new Uint8Array([123, 125]),
      },
    });

    await expect(exporting).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_CONFLICT",
    });
    await expect(controller.replaceCorrupt()).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_CONFLICT",
    });
    expect(repository.replaceCorrupt).not.toHaveBeenCalled();
  });
});

function fakeRepository(loaded: LoadedSnapshot | null) {
  const port: DocumentRepository = {
    ...unsupportedRecovery(),
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
    ...unsupportedRecovery(),
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

function importReservation(
  imported: ReturnType<typeof createSeededDocument>["tree"],
  writeGeneration: number,
  previousTree: ReturnType<typeof createSeededDocument>["tree"] | null,
  previousGeneration: number | null,
): ImportedSnapshotReservation {
  return Object.freeze({
    treeId: imported.id,
    imported: Object.freeze({
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      treeId: imported.id,
      treeRevision: imported.revision,
      writeGeneration,
      bundle: treeToBundle(imported),
      history: createTreeHistory(),
    }),
    previous: previousTree === null || previousGeneration === null
      ? null
      : Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId: previousTree.id,
          treeRevision: previousTree.revision,
          writeGeneration: previousGeneration,
          bundle: treeToBundle(previousTree),
          history: createTreeHistory(),
        }),
  });
}

function unsupportedRecovery(): Pick<
  DocumentRepository,
  "exportCorrupt" | "replaceCorrupt" | "reserveImportedSnapshot" | "rollbackImportedSnapshot"
> {
  return {
    exportCorrupt: async () => ({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE", message: "unsupported" },
    }),
    replaceCorrupt: async () => ({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE", message: "unsupported" },
    }),
    reserveImportedSnapshot: async () => ({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE", message: "unsupported" },
    }),
    rollbackImportedSnapshot: async () => ({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE", message: "unsupported" },
    }),
  };
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (assertion()) return;
    await Promise.resolve();
  }
  throw new Error("condition did not settle");
}
