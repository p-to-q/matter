import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import {
  STORAGE_SCHEMA_VERSION,
  type CorruptSnapshotExport,
  type DocumentRepository,
  type ImportedSnapshotReservation,
  type LoadedSnapshot,
  type RepositoryResult,
  type SnapshotBasis,
  type SnapshotWrite,
} from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import { holdsUnsavedPersonMaterial } from "./persistence-status";
import { treeToBundle } from "./snapshot-codec";
import { createTreeHistory, type TreeHistory } from "../tree/history";
import type { ThoughtTree } from "../tree/model";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import {
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  type HistoryRetention,
  type PersistedHistoryJournal,
} from "./history-journal";

const EMPTY_RECOVERED = Object.freeze({ history: createTreeHistory(), released: false });
/** The store accepted a row and restored every stored step. */
const KEPT_HISTORY = Object.freeze({ historyReleased: false });

describe("persistence controller", () => {
  it("reads the first stored row as a candidate and adopts it only once the store takes it", async () => {
    const tree = createSeededDocument().tree;
    const repository = fakeRepository(stored(tree, 3));
    const controller = createPersistenceController(repository.port);

    const candidate = await controller.start(tree);
    expect(candidate).toMatchObject({ tree, history: EMPTY_RECOVERED, replaces: null });
    // Reading the row adopts nothing: it names no basis and no saved revision.
    expect(controller.getStatus()).toMatchObject({ phase: "loading", persistedRevision: null });

    const hydrate = vi.fn(() => KEPT_HISTORY);
    expect(controller.adoptStored(candidate!, hydrate)).toBe("adopted");
    expect(hydrate).toHaveBeenCalledExactlyOnceWith(candidate);
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: tree.revision,
      dirtyRevision: null,
      errorCode: null,
      historyNotice: null,
      unsaved: false,
      replaceableByImport: false,
      upgradeBlocked: false,
      conflictOrigin: null,
    });
  });

  it("starts the adopted row's notice with the steps the store could not restore", async () => {
    const tree = createSeededDocument().tree;
    const controller = createPersistenceController(fakeRepository(stored(tree, 3)).port);
    const candidate = await controller.start(tree);

    expect(controller.adoptStored(candidate!, () => ({ historyReleased: true }))).toBe("adopted");
    expect(controller.getStatus()).toMatchObject({ phase: "saved", historyNotice: "unavailable" });
  });

  it("never adopts the first row the store refused, and never hydrates one that went stale", async () => {
    const tree = createSeededDocument().tree;
    const refusing = controlledRepository(stored(tree, 3));
    const refused = createPersistenceController(refusing.port);
    const first = await refused.start(tree);
    expect(refused.adoptStored(first!, () => null)).toBe("refused");
    // The caller holds the material it kept as a conflict; nothing is written
    // against the unadopted row.
    const live = { ...tree, revision: tree.revision + 1 };
    refused.declareConflict(live, undefined, "load-window");
    await Promise.resolve();
    expect(refused.getStatus()).toMatchObject({
      phase: "error",
      persistedRevision: null,
      errorCode: "PERSISTENCE_CONFLICT",
      conflictOrigin: "load-window",
    });
    expect(refusing.pending).toHaveLength(0);

    const superseding = controlledRepository(stored(tree, 3));
    const superseded = createPersistenceController(superseding.port);
    const candidate = await superseded.start(tree);
    superseded.observeStoredGeneration({
      treeId: tree.id,
      writeGeneration: 4,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION + 1,
    });
    const hydrate = vi.fn(() => KEPT_HISTORY);
    expect(superseded.adoptStored(candidate!, hydrate)).toBe("stale");
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("holds a diverged load window unsaved instead of choosing a winner", async () => {
    const seeded = createSeededDocument().tree;
    // The person's last session, already on disk and further along.
    const storedTree = { ...seeded, revision: seeded.revision + 5 };
    const repository = controlledRepository(stored(storedTree, 4));
    const controller = createPersistenceController(repository.port);

    await expect(controller.start(seeded)).resolves.toMatchObject({
      tree: storedTree,
      history: EMPTY_RECOVERED,
      replaces: null,
    });
    // What they committed while the read was still in flight. Its revision is
    // higher than the stored one and means nothing: it counts from the seed.
    const live = { ...seeded, revision: seeded.revision + 9 };
    controller.declareConflict(live, undefined, "load-window");

    // No other tab is involved; the surface must not claim one. The stored row
    // was read but never adopted.
    expect(controller.getStatus()).toEqual({
      phase: "error",
      persistedRevision: null,
      dirtyRevision: live.revision,
      errorCode: "PERSISTENCE_CONFLICT",
      historyNotice: null,
      unsaved: true,
      replaceableByImport: false,
      upgradeBlocked: false,
      conflictOrigin: "load-window",
    });
    // The stored session is untouched: nothing was written over it.
    expect(repository.pending).toHaveLength(0);
    expect(repository.savedRevisions).toEqual([]);

    // A later commit does not quietly resume saving over the stored session.
    controller.publish({ ...live, revision: live.revision + 1 });
    await Promise.resolve();
    expect(repository.savedRevisions).toEqual([]);

    // The gesture Archive offers resolves it, and only once the store took the row.
    const candidate = await controller.resolveConflict();
    expect(candidate).toMatchObject({ tree: storedTree, history: EMPTY_RECOVERED });
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_CONFLICT", conflictOrigin: "load-window" });
    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("adopted");
    expect(controller.getStatus()).toMatchObject({
      phase: "saved",
      persistedRevision: storedTree.revision,
      errorCode: null,
      conflictOrigin: null,
      unsaved: false,
      replaceableByImport: false,
    });
  });

  it("coalesces revisions published during one write into the latest snapshot", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
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
    await startAccepted(controller, tree, history);
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
    await startAccepted(controller, tree, history);
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
    await startAccepted(controller, tree, history);
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

  it("holds material unsaved where IndexedDB is unavailable, as in a private window, and retries on request", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    repository.port = {
      ...repository.port,
      load: async () => ({ ok: false, error: { code: "PERSISTENCE_UNAVAILABLE", message: "no database" } }),
    };
    const controller = createPersistenceController(repository.port);

    await expect(controller.start(tree)).resolves.toBeNull();
    // The untouched seed waits to be written, but nothing the person made is unsaved.
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      errorCode: "PERSISTENCE_UNAVAILABLE",
      dirtyRevision: tree.revision,
      unsaved: false,
      replaceableByImport: false,
    });
    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]).toMatchObject({ treeRevision: tree.revision, expectedGeneration: null });
  });

  it("marks material unsaved until its write lands and announces the committed generation", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const announceGeneration = vi.fn();
    const controller = createPersistenceController(repository.port, { announceGeneration });
    await startAccepted(controller, tree);
    const edited = { ...tree, revision: tree.revision + 1 };
    controller.publish(edited);
    await waitFor(() => repository.pending.length === 1);
    expect(controller.getStatus()).toMatchObject({ phase: "saving", unsaved: true });

    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: true, value: 2 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus().unsaved).toBe(false);
    expect(announceGeneration.mock.calls).toEqual([1, 2].map((writeGeneration) => [{
      treeId: tree.id,
      writeGeneration,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    }]));
  });

  it("prepares a newer row for a clean tab and adopts it only after the store accepts it", async () => {
    const tree = createSeededDocument().tree;
    const newer = { ...tree, revision: tree.revision + 4 };
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);

    const generation = (writeGeneration: number, treeId = tree.id) =>
      ({ treeId, writeGeneration, storageSchemaVersion: STORAGE_SCHEMA_VERSION });
    expect(controller.observeStoredGeneration(generation(2))).toBe("ignored");
    expect(controller.observeStoredGeneration(generation(9, "another_tree"))).toBe("ignored");
    expect(controller.observeStoredGeneration(generation(3))).toBe("refresh");

    repository.setLoaded(stored(newer, 3));
    const candidate = await controller.prepareRefresh();
    expect(candidate).toMatchObject({ tree: newer, history: EMPTY_RECOVERED, replaces: null });
    // Reading the row changes nothing: the basis still names the old row.
    expect(controller.getStatus()).toMatchObject({ phase: "saved", persistedRevision: tree.revision });
    expect(controller.observeStoredGeneration(generation(3))).toBe("refresh");

    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("adopted");
    expect(controller.getStatus()).toMatchObject({ phase: "saved", persistedRevision: newer.revision });
    expect(controller.observeStoredGeneration(generation(3))).toBe("ignored");
  });

  it("keeps the old basis when the store refuses a prepared row, so the next save meets the newer one", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    repository.setLoaded(stored({ ...tree, revision: tree.revision + 3 }, 3));
    const candidate = await controller.prepareRefresh();
    expect(candidate).not.toBeNull();

    // The store refused hydration because a commit landed first; that commit
    // is published and must be written against the row this tab last saw.
    const local = { ...tree, revision: tree.revision + 1 };
    controller.publish(local);
    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("stale");
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]).toMatchObject({ treeRevision: local.revision, expectedGeneration: 2 });
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_CONFLICT");
    expect(controller.getStatus()).toMatchObject({ unsaved: true, conflictOrigin: "another-tab" });
  });

  it("never adopts a candidate prepared for an earlier document", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    repository.setLoaded(stored({ ...tree, revision: tree.revision + 3 }, 3));
    const candidate = await controller.prepareRefresh();

    await startAccepted(controller, tree);
    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("stale");
  });

  it("holds unsaved material as a conflict when a newer generation arrives", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    const local = { ...tree, revision: tree.revision + 1 };
    controller.publish(local);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => controller.getStatus().phase === "error");

    expect(controller.observeStoredGeneration({
      treeId: tree.id,
      writeGeneration: 3,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    })).toBe("conflict");
    expect(controller.getStatus()).toMatchObject({
      errorCode: "PERSISTENCE_CONFLICT",
      conflictOrigin: "another-tab",
      dirtyRevision: local.revision,
      unsaved: true,
      replaceableByImport: false,
    });
    await expect(controller.prepareRefresh()).resolves.toBeNull();
  });

  it("lets an in-flight write meet a newer generation through its own compare-and-swap", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    controller.publish({ ...tree, revision: tree.revision + 1 });
    await waitFor(() => repository.pending.length === 1);

    expect(controller.observeStoredGeneration({
      treeId: tree.id,
      writeGeneration: 3,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    })).toBe("conflict");
    expect(controller.getStatus().phase).toBe("saving");
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_CONFLICT");
  });

  it("turns a refresh into a conflict when a local commit lands during its read", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    repository.setLoaded(stored({ ...tree, revision: tree.revision + 3 }, 3));
    repository.deferLoad();

    const refreshing = controller.prepareRefresh();
    controller.publish({ ...tree, revision: tree.revision + 1 });
    repository.settleLoad();
    await expect(refreshing).resolves.toBeNull();
    // The local write is in flight; its compare-and-swap raises the conflict.
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_CONFLICT");
    expect(controller.getStatus().unsaved).toBe(true);
  });

  it("treats a missing row this tab saved as cleared storage, never as another copy", async () => {
    const tree = createSeededDocument().tree;
    const cleared = async (act: (
      controller: ReturnType<typeof createPersistenceController>,
      repository: ReturnType<typeof controlledRepository>,
    ) => Promise<unknown>) => {
      const repository = controlledRepository(stored(tree, 2));
      const controller = createPersistenceController(repository.port);
      await startAccepted(controller, tree);
      repository.setLoaded(null);
      await act(controller, repository);
      expect(controller.getStatus()).toMatchObject({ phase: "error", errorCode: "PERSISTENCE_CLEARED" });
      // Terminal: nothing retries into the empty store behind the person's back.
      controller.retry();
      controller.publish({ ...tree, revision: tree.revision + 1 });
      await Promise.resolve();
      expect(repository.pending).toHaveLength(0);
    };

    await cleared(async (controller) => {
      await expect(controller.checkStoredGeneration()).resolves.toBe("cleared");
    });
    await cleared(async (controller) => {
      await expect(controller.prepareRefresh()).resolves.toBeNull();
    });
    await cleared(async (controller) => {
      controller.declareConflict({ ...tree, revision: tree.revision + 1 });
      await expect(controller.resolveConflict()).resolves.toBeNull();
    });

    // Before this tab has saved anything, a missing row is only a first run.
    const fresh = controlledRepository();
    const controller = createPersistenceController(fresh.port);
    await startAccepted(controller, tree);
    await expect(controller.checkStoredGeneration()).resolves.toBe("ignored");
    expect(controller.getStatus().errorCode).toBeNull();
  });

  it("reads the stored generation when the page returns and treats it like a broadcast", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const readGeneration = vi.fn<DocumentRepository["readGeneration"]>()
      .mockResolvedValueOnce({ ok: true, value: { writeGeneration: 2, storageSchemaVersion: 1 } })
      .mockResolvedValueOnce({ ok: true, value: { writeGeneration: 5, storageSchemaVersion: 1 } })
      .mockResolvedValueOnce({ ok: false, error: { code: "PERSISTENCE_SUPERSEDED", message: "newer" } });
    const controller = createPersistenceController({ ...repository.port, readGeneration });
    await startAccepted(controller, tree);

    await expect(controller.checkStoredGeneration()).resolves.toBe("ignored");
    await expect(controller.checkStoredGeneration()).resolves.toBe("refresh");
    await expect(controller.checkStoredGeneration()).resolves.toBe("superseded");
    expect(controller.getStatus()).toMatchObject({ phase: "error", errorCode: "PERSISTENCE_SUPERSEDED" });
  });

  it("treats a newer schema as terminal: nothing retries, drains, or imports", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);

    expect(controller.observeStoredGeneration({
      treeId: tree.id,
      writeGeneration: 3,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION + 1,
    })).toBe("superseded");
    controller.publish({ ...tree, revision: tree.revision + 1 });
    controller.retry();
    await Promise.resolve();
    expect(repository.savedRevisions).toEqual([]);
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      errorCode: "PERSISTENCE_SUPERSEDED",
      unsaved: true,
      replaceableByImport: false,
    });
    await expect(controller.prepareImportedTree(tree)).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_SUPERSEDED",
    });
  });

  it("reports a blocked upgrade and keeps a cleared database terminal over later write failures", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    let emit: ((event: "upgrade-blocked" | "upgrade-ready" | "superseded" | "cleared") => void) | null = null;
    const controller = createPersistenceController({
      ...repository.port,
      subscribeLifecycle(listener) {
        emit = listener;
        return () => undefined;
      },
    });
    const starting = controller.start(tree);
    emit!("upgrade-blocked");
    expect(controller.getStatus()).toMatchObject({ phase: "loading", upgradeBlocked: true });
    emit!("upgrade-ready");
    expect(controller.getStatus().upgradeBlocked).toBe(false);
    await starting;
    await waitFor(() => repository.pending.length === 1);

    emit!("cleared");
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_WRITE_FAILED", message: "closed" } });
    await waitFor(() => repository.pending.length === 0);
    await Promise.resolve();
    expect(controller.getStatus()).toMatchObject({ phase: "error", errorCode: "PERSISTENCE_CLEARED" });
  });

  it("reclaims derived storage once before shedding any durable undo step", async () => {
    const tree = createSeededDocument().tree;
    const history = historyOfBytes([40, 30, 20, 10]);
    const repository = controlledRepository();
    const reclaimDerivedStorage = vi.fn(async () => true);
    const controller = createPersistenceController({ ...repository.port, reclaimDerivedStorage });
    await startAccepted(controller, tree, history);
    await waitFor(() => repository.pending.length === 1);

    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    expect(reclaimDerivedStorage).toHaveBeenCalledOnce();
    expect(repository.pending[0]?.retention).toBe(FULL_HISTORY_RETENTION);
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    expect(reclaimDerivedStorage).toHaveBeenCalledOnce();
    expect(repository.pending[0]?.retention).toEqual({ maxUndoBytes: 50, keepRedo: true });
  });

  it("refuses to import over unsaved material unless storage refused it and the person confirmed", async () => {
    const tree = createSeededDocument().tree;
    const imported = { ...tree, revision: tree.revision + 2 };
    const reservation = importReservation(imported, 3, tree, 2);
    const repository = controlledRepository(stored(tree, 2));
    const reserveImportedSnapshot = vi.fn(async () => ({ ok: true as const, value: reservation }));
    const load = vi.fn(repository.port.load);
    const controller = createPersistenceController({ ...repository.port, load, reserveImportedSnapshot });
    await startAccepted(controller, tree);
    const local = { ...tree, revision: tree.revision + 1 };
    controller.publish(local);
    await waitFor(() => repository.pending.length === 1);

    // A write still in flight can never be replaced.
    expect(controller.getStatus().replaceableByImport).toBe(false);
    await expect(controller.prepareImportedTree(imported, { replaceUnsaved: true })).resolves.toEqual({
      ok: false,
      errorCode: "IMPORT_SAVING",
    });
    repository.settleNext(storageFull());
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_STORAGE_FULL");
    // The status offers exactly the replacement this controller will honor.
    expect(controller.getStatus()).toMatchObject({ unsaved: true, replaceableByImport: true });
    await expect(controller.prepareImportedTree(imported)).resolves.toEqual({
      ok: false,
      errorCode: "IMPORT_DIRTY",
    });

    load.mockClear();
    const prepared = await controller.prepareImportedTree(imported, { replaceUnsaved: true });
    expect(prepared).toMatchObject({ ok: true, writeGeneration: 3 });
    // The refused material never reached storage: the loaded row stays the basis.
    expect(reserveImportedSnapshot).toHaveBeenCalledWith(imported.id, imported.revision, treeToBundle(imported), 2);
    expect(load).not.toHaveBeenCalled();
    if (!prepared.ok) return;
    controller.activateImportedDocument(prepared);
    expect(controller.getStatus()).toMatchObject({
      phase: "saved",
      persistedRevision: imported.revision,
      errorCode: null,
      unsaved: false,
      replaceableByImport: false,
    });
  });

  it("offers archive replacement only for material storage refused, never over a conflict", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    controller.publish({ ...tree, revision: tree.revision + 1 });
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_WRITE_FAILED", message: "failed" } });
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_WRITE_FAILED");
    expect(controller.getStatus().replaceableByImport).toBe(true);

    controller.observeStoredGeneration({ treeId: tree.id, writeGeneration: 3, storageSchemaVersion: STORAGE_SCHEMA_VERSION });
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_CONFLICT", replaceableByImport: false });
  });

  it("counts only material the person made as unsaved, and lets authorship answer before the first load", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    // Before reconciliation the controller has received nothing yet.
    expect(holdsUnsavedPersonMaterial(controller.getStatus(), false, true)).toBe(true);
    expect(holdsUnsavedPersonMaterial(controller.getStatus(), false, false)).toBe(false);

    await startAccepted(controller, tree);
    await waitFor(() => repository.pending.length === 1);
    // The first save of untouched material is in flight but puts nothing at risk.
    expect(controller.getStatus()).toMatchObject({ phase: "saving", unsaved: false });
    const relocalized = { ...tree, revision: tree.revision + 1 };
    controller.publish(relocalized, undefined, false);
    expect(controller.getStatus().unsaved).toBe(false);
    const edited = { ...tree, revision: tree.revision + 2 };
    controller.publish(edited, undefined, true);
    expect(controller.getStatus().unsaved).toBe(true);
    expect(holdsUnsavedPersonMaterial(controller.getStatus(), true, false)).toBe(true);
  });

  it("keeps the refused material and its error when the replacing import cannot be stored", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository(stored(tree, 2));
    const controller = createPersistenceController({
      ...repository.port,
      reserveImportedSnapshot: async () => storageFull() as RepositoryResult<ImportedSnapshotReservation>,
    });
    await startAccepted(controller, tree);
    const local = { ...tree, revision: tree.revision + 1 };
    controller.publish(local);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_STORAGE_FULL");
    const before = controller.getStatus();

    await expect(controller.prepareImportedTree(tree, { replaceUnsaved: true })).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_STORAGE_FULL",
    });
    expect(controller.getStatus()).toEqual(before);
    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.treeRevision).toBe(local.revision);
  });

  it("writes the inverse journal against the basis the previous save returned", async () => {
    const tree = createSeededDocument().tree;
    const history: TreeHistory = createTreeHistory();
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);

    await startAccepted(controller, tree, history);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.history).toBe(history);
    const returnedJournal = emptyHistoryJournal(3);
    repository.settleNext({ ok: true, value: { writeGeneration: 1, journal: returnedJournal } });
    await waitFor(() => controller.getStatus().phase === "saved");

    controller.publish({ ...tree, revision: tree.revision + 1 }, history);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.basis).toEqual({ writeGeneration: 1, journal: returnedJournal });
    expect(repository.pending[0]?.basis.journal).toBe(returnedJournal);
  });

  it("retains the latest dirty tree on conflict until explicit reload resolves it", async () => {
    const tree = createSeededDocument().tree;
    const newer = { ...tree, revision: tree.revision + 8 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
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

    repository.setLoaded(stored(newer, 7));
    const candidate = await controller.resolveConflict();
    expect(candidate).toMatchObject({ tree: newer, history: EMPTY_RECOVERED });
    expect(repository.loads).toBe(2);
    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("adopted");
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
    await startAccepted(controller, tree);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().phase === "error");
    repository.setLoaded(stored(tree, 4));
    repository.deferLoad();
    const resolving = controller.resolveConflict();
    const newerLocal = { ...tree, revision: tree.revision + 2 };
    controller.publish(newerLocal);
    repository.settleLoad();
    await expect(resolving).resolves.toBeNull();
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      dirtyRevision: newerLocal.revision,
      errorCode: "PERSISTENCE_CONFLICT",
    });
  });

  it("refuses a reload candidate once a newer local commit replaced what it would reload over", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } });
    await waitFor(() => controller.getStatus().phase === "error");
    repository.setLoaded(stored(tree, 4));
    const candidate = await controller.resolveConflict();
    expect(candidate?.replaces?.tree).toBe(tree);

    controller.publish({ ...tree, revision: tree.revision + 2 });
    expect(controller.adoptStored(candidate!, () => KEPT_HISTORY)).toBe("stale");
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_CONFLICT", unsaved: true });
  });

  it("names why an import cannot replace material that is not yet saved", async () => {
    const tree = createSeededDocument().tree;
    const imported = { ...tree, revision: tree.revision + 2 };

    const conflicted = controlledRepository(stored(tree, 2));
    const conflictController = createPersistenceController(conflicted.port);
    await startAccepted(conflictController, tree);
    conflictController.declareConflict({ ...tree, revision: tree.revision + 1 });
    await expect(conflictController.prepareImportedTree(imported)).resolves.toEqual({
      ok: false,
      errorCode: "IMPORT_CONFLICT",
    });

    const corrupt = controlledRepository();
    corrupt.port = {
      ...corrupt.port,
      load: async () => ({ ok: false, error: { code: "PERSISTENCE_CORRUPT", message: "damaged" } }),
    };
    const corruptController = createPersistenceController(corrupt.port);
    await startAccepted(corruptController, tree);
    await expect(corruptController.prepareImportedTree(imported)).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_CORRUPT",
    });
  });

  it("retains the latest dirty snapshot after storage fills and drains it on retry", async () => {
    const tree = createSeededDocument().tree;
    const second = { ...tree, revision: tree.revision + 1 };
    const latest = { ...tree, revision: tree.revision + 2 };
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
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
      historyNotice: null,
      unsaved: false,
      replaceableByImport: false,
      upgradeBlocked: false,
      conflictOrigin: null,
    });
    expect(repository.savedRevisions).toEqual([tree.revision, latest.revision]);
  });

  it("sheds durable undo steps before material, keeps that retention, and restores it on retry", async () => {
    const tree = createSeededDocument().tree;
    const history = historyOfBytes([40, 30, 20, 10]);
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree, history);
    await waitFor(() => repository.pending.length === 1);

    expect(repository.pending[0]?.retention).toBe(FULL_HISTORY_RETENTION);
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.retention).toEqual({ maxUndoBytes: 50, keepRedo: true });
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toMatchObject({
      persistedRevision: tree.revision,
      errorCode: null,
      historyNotice: "released",
    });

    controller.publish({ ...tree, revision: tree.revision + 1 }, history);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.retention).toEqual({ maxUndoBytes: 50, keepRedo: true });
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.retention).toEqual({ maxUndoBytes: 0, keepRedo: true });
    repository.settleNext(storageFull());
    await waitFor(() => controller.getStatus().phase === "error");
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_STORAGE_FULL" });

    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.retention).toBe(FULL_HISTORY_RETENTION);
  });

  it("saves a history-only change at an unchanged revision and skips the history it already holds", async () => {
    const tree = createSeededDocument().tree;
    const loadedHistory = historyOfBytes([10, 20]);
    const repository = controlledRepository({
      ...stored(tree, 2),
      history: { history: loadedHistory, released: false },
    });
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);

    controller.publish(tree, loadedHistory);
    await Promise.resolve();
    expect(repository.pending).toHaveLength(0);
    const released: TreeHistory = createTreeHistory();
    controller.publish(tree, released);
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.history).toBe(released);
    repository.settleNext({ ok: true, value: 3 });
    await waitFor(() => controller.getStatus().phase === "saved");
    controller.publish(tree, released);
    await Promise.resolve();
    expect(repository.pending).toHaveLength(0);
  });

  it("ends a released notice after a full save, and never lets a shed hide an unread unavailable one", async () => {
    const tree = createSeededDocument().tree;
    const history = historyOfBytes([40, 30, 20, 10]);
    const repository = controlledRepository();
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree, history);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: true, value: 1 });
    await waitFor(() => controller.getStatus().historyNotice === "released");

    // Retry restores full retention; the next save keeps every step again.
    controller.publish({ ...tree, revision: tree.revision + 1 }, history);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => controller.getStatus().phase === "error");
    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.retention).toBe(FULL_HISTORY_RETENTION);
    repository.settleNext({ ok: true, value: 2 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus().historyNotice).toBeNull();

    controller.reportHistoryUnavailable();
    controller.publish({ ...tree, revision: tree.revision + 2 }, history);
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext(storageFull());
    await waitFor(() => repository.pending.length === 1);
    repository.settleNext({ ok: true, value: 3 });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus().historyNotice).toBe("unavailable");
  });

  it("carries one history notice until it is acknowledged or a new document begins", async () => {
    const tree = createSeededDocument().tree;
    const repository = fakeRepository(stored(tree, 2));
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, tree);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.reportHistoryUnavailable();
    controller.reportHistoryUnavailable();
    expect(controller.getStatus().historyNotice).toBe("unavailable");
    expect(listener).toHaveBeenCalledTimes(1);
    controller.acknowledgeHistoryNotice();
    expect(controller.getStatus().historyNotice).toBeNull();

    controller.reportHistoryUnavailable();
    const reloaded = createPersistenceController(fakeRepository(stored(tree, 2)).port);
    await startAccepted(reloaded, tree);
    expect(reloaded.getStatus().historyNotice).toBeNull();
  });

  it("CAS-reserves a different valid same-id bundle after explicit archive replacement", async () => {
    const imported = createSeededDocument().tree;
    const storedTree = { ...imported, revision: imported.revision + 3 };
    const reservation = importReservation(imported, 4, storedTree, 3);
    const reserveImportedSnapshot = vi.fn(async () => ({ ok: true as const, value: reservation }));
    const repository: DocumentRepository = {
      ...inertPort(),
      load: async () => ({ ok: true, value: stored(storedTree, 3) }),
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
    const repository = controlledRepository(stored(imported, 3));
    repository.port = {
      ...repository.port,
      reserveImportedSnapshot: async () => ({ ok: true, value: reservation }),
    };
    const controller = createPersistenceController(repository.port);
    await startAccepted(controller, imported);
    controller.reportHistoryUnavailable();

    const prepared = await controller.prepareImportedTree(imported);
    expect(prepared).toMatchObject({ ok: true, tree: imported, writeGeneration: 4 });
    if (!prepared.ok) throw new Error("import preparation rejected");
    controller.activateImportedDocument(prepared);
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: imported.revision,
      dirtyRevision: null,
      errorCode: null,
      historyNotice: null,
      unsaved: false,
      replaceableByImport: false,
      upgradeBlocked: false,
      conflictOrigin: null,
    });

    controller.publish({ ...imported, revision: imported.revision + 1 });
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.basis).toBe(reservation.basis);
  });

  it("rolls a stale prepared import back before draining a newer local commit", async () => {
    const imported = createSeededDocument().tree;
    const current = { ...imported, revision: imported.revision + 3 };
    const newer = { ...current, revision: current.revision + 1 };
    const reservation = importReservation(imported, 4, current, 3);
    let settleReserve!: (result: RepositoryResult<ImportedSnapshotReservation>) => void;
    let settleRollback!: (result: Awaited<ReturnType<DocumentRepository["rollbackImportedSnapshot"]>>) => void;
    let settleSave!: (result: RepositoryResult<SnapshotBasis>) => void;
    const reserveImportedSnapshot = vi.fn(() => new Promise<RepositoryResult<ImportedSnapshotReservation>>((resolve) => {
      settleReserve = resolve;
    }));
    const rollbackImportedSnapshot = vi.fn(() => new Promise<Awaited<ReturnType<DocumentRepository["rollbackImportedSnapshot"]>>>((resolve) => {
      settleRollback = resolve;
    }));
    const save = vi.fn<DocumentRepository["save"]>(() => new Promise<RepositoryResult<SnapshotBasis>>((resolve) => {
      settleSave = resolve;
    }));
    const loaded = stored(current, 3);
    const repository: DocumentRepository = {
      ...inertPort(),
      load: async () => ({ ok: true, value: loaded }),
      save,
      reserveImportedSnapshot,
      rollbackImportedSnapshot,
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);
    await startAccepted(controller, current);
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
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      treeId: newer.id,
      treeRevision: newer.revision,
      bundle: treeToBundle(newer),
      // The restored row carries the same journal the loaded basis described.
      basis: { writeGeneration: 5, journal: loaded.basis.journal },
    });
    settleSave({ ok: true, value: { writeGeneration: 6, journal: loaded.basis.journal } });
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toMatchObject({ persistedRevision: newer.revision, errorCode: null });
    expect(switchDocument).not.toHaveBeenCalled();
  });

  it("does not adopt a rolled-back generation for a row this tab never described", async () => {
    const imported = createSeededDocument().tree;
    const current = { ...imported, revision: imported.revision + 3 };
    // Another tab wrote generation 7 between this tab's load and the import.
    const reservation = importReservation(imported, 8, current, 7);
    const save = vi.fn(async (write: SnapshotWrite): Promise<RepositoryResult<SnapshotBasis>> => ({
      ok: true,
      value: { writeGeneration: (write.basis.writeGeneration ?? 0) + 1, journal: write.basis.journal },
    }));
    const repository: DocumentRepository = {
      ...inertPort(),
      load: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: stored(current, 3) })
        .mockResolvedValue({ ok: true, value: stored(current, 7) }),
      save,
      reserveImportedSnapshot: async () => ({ ok: true, value: reservation }),
      rollbackImportedSnapshot: async () => ({ ok: true, value: { status: "rolled-back", writeGeneration: 9 } }),
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);
    await startAccepted(controller, current);
    const prepared = await controller.prepareImportedTree(imported);
    if (!prepared.ok) throw new Error("import preparation rejected");
    await expect(controller.discardImportedDocument(prepared)).resolves.toBeNull();

    controller.publish({ ...current, revision: current.revision + 1 });
    await waitFor(() => save.mock.calls.length === 1);
    expect(save.mock.calls[0]?.[0].basis.writeGeneration).toBe(3);
  });

  it("requires an exact corrupt export before atomically replacing local storage", async () => {
    const tree = createSeededDocument().tree;
    const history = createTreeHistory();
    const basis = { treeId: tree.id, serialized: "{\"damaged\":true}" };
    const replacedBasis = { writeGeneration: 6, journal: emptyHistoryJournal(1) };
    const repository: DocumentRepository = {
      ...inertPort(),
      load: async () => ({
        ok: false,
        error: { code: "PERSISTENCE_CORRUPT", message: "damaged" },
      }),
      save: vi.fn(),
      exportCorrupt: vi.fn(async (): Promise<RepositoryResult<CorruptSnapshotExport>> => ({
        ok: true as const,
        value: { basis, bytes: new TextEncoder().encode(basis.serialized) },
      })),
      replaceCorrupt: vi.fn(async () => ({ ok: true as const, value: replacedBasis })),
      close: () => undefined,
    };
    const controller = createPersistenceController(repository);

    await startAccepted(controller, tree, history);
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
    expect(repository.replaceCorrupt).toHaveBeenCalledWith({
      treeId: tree.id,
      treeRevision: tree.revision,
      bundle: treeToBundle(tree),
      history,
      retention: FULL_HISTORY_RETENTION,
    }, basis);
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: tree.revision,
      dirtyRevision: null,
      errorCode: null,
      historyNotice: null,
      unsaved: false,
      replaceableByImport: false,
      upgradeBlocked: false,
      conflictOrigin: null,
    });
  });

  it("sheds undo to replace a corrupt row under storage pressure and keeps Replace open when it cannot", async () => {
    const tree = createSeededDocument().tree;
    const history = historyOfBytes([40, 30, 20, 10]);
    const basis = { treeId: tree.id, serialized: "{\"damaged\":true}" };
    const replacedBasis = { writeGeneration: 6, journal: emptyHistoryJournal(1) };
    const replaceCorrupt = vi.fn<DocumentRepository["replaceCorrupt"]>(async () =>
      storageFull() as RepositoryResult<SnapshotBasis>);
    // The damaged row still holds generation 5: a save against no row meets it.
    const save = vi.fn<DocumentRepository["save"]>(async () => ({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT", message: "row exists" },
    }));
    const reserveImportedSnapshot = vi.fn(inertPort().reserveImportedSnapshot);
    const controller = createPersistenceController({
      ...inertPort(),
      load: async () => ({ ok: false, error: { code: "PERSISTENCE_CORRUPT", message: "damaged" } }),
      save,
      exportCorrupt: async () => ({
        ok: true,
        value: { basis, bytes: new TextEncoder().encode(basis.serialized) },
      }),
      replaceCorrupt,
      reserveImportedSnapshot,
      close: () => undefined,
    });
    const seen: string[] = [];
    controller.subscribe(() => seen.push(`${controller.getStatus().errorCode}/${controller.getStatus().conflictOrigin}`));
    await startAccepted(controller, tree, history);
    const edited = { ...tree, revision: tree.revision + 1 };
    controller.publish(edited, history, true);
    await controller.exportCorruptRecovery();

    // Storage refuses every retention, material alone included.
    await expect(controller.replaceCorrupt()).resolves.toEqual({ ok: false, errorCode: "PERSISTENCE_STORAGE_FULL" });
    expect(replaceCorrupt.mock.calls.map(([write]) => write.retention)).toEqual([
      FULL_HISTORY_RETENTION,
      { maxUndoBytes: 50, keepRedo: true },
      { maxUndoBytes: 0, keepRedo: true },
    ]);
    // Still a damaged row: nothing may save or import against a generation
    // this tab never read, and the recovery basis is kept for another Replace.
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      errorCode: "PERSISTENCE_CORRUPT",
      unsaved: true,
      replaceableByImport: false,
    });
    controller.retry();
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    await expect(controller.prepareImportedTree(tree, { replaceUnsaved: true })).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_CORRUPT",
    });
    expect(reserveImportedSnapshot).not.toHaveBeenCalled();

    // Some space came back: the second Replace keeps half the undo bytes.
    replaceCorrupt.mockClear();
    replaceCorrupt
      .mockResolvedValueOnce(storageFull() as RepositoryResult<SnapshotBasis>)
      .mockResolvedValueOnce({ ok: true, value: replacedBasis });
    await expect(controller.replaceCorrupt()).resolves.toEqual({ ok: true });
    expect(replaceCorrupt.mock.calls.map(([write]) => write.retention)).toEqual([
      FULL_HISTORY_RETENTION,
      { maxUndoBytes: 50, keepRedo: true },
    ]);
    expect(replaceCorrupt.mock.calls[1]?.[1]).toBe(basis);
    expect(controller.getStatus()).toMatchObject({
      phase: "saved",
      persistedRevision: edited.revision,
      errorCode: null,
      historyNotice: "released",
      unsaved: false,
    });
    // The next save continues from the replaced row with the shed retention.
    controller.publish({ ...tree, revision: tree.revision + 2 }, history);
    await waitFor(() => save.mock.calls.length === 1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ basis: replacedBasis, retention: { maxUndoBytes: 50, keepRedo: true } });
    expect(seen.some((entry) => entry.includes("another-tab"))).toBe(false);
  });

  it("names a conflict met by a first save after a failed load a difference, never another tab", async () => {
    const tree = createSeededDocument().tree;
    const repository = controlledRepository();
    const controller = createPersistenceController({
      ...repository.port,
      load: async () => ({ ok: false, error: { code: "PERSISTENCE_UNAVAILABLE", message: "closed" } }),
    });
    await startAccepted(controller, tree);
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_UNAVAILABLE" });
    controller.publish({ ...tree, revision: tree.revision + 1 });
    controller.retry();
    await waitFor(() => repository.pending.length === 1);
    expect(repository.pending[0]?.expectedGeneration).toBeNull();
    // Storage opened this time and holds a row this tab never read.
    repository.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "row exists" } });
    await waitFor(() => controller.getStatus().errorCode === "PERSISTENCE_CONFLICT");
    expect(controller.getStatus().conflictOrigin).toBe("load-window");

    // With a row this tab saved, a failed compare is another tab's newer copy.
    const saved = controlledRepository(stored(tree, 2));
    const savedController = createPersistenceController(saved.port);
    await startAccepted(savedController, tree);
    savedController.publish({ ...tree, revision: tree.revision + 1 });
    await waitFor(() => saved.pending.length === 1);
    saved.settleNext({ ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "newer" } });
    await waitFor(() => savedController.getStatus().errorCode === "PERSISTENCE_CONFLICT");
    expect(savedController.getStatus().conflictOrigin).toBe("another-tab");
  });

  it("invalidates a corrupt export when newer local material arrives", async () => {
    const tree = createSeededDocument().tree;
    let settleExport!: (result: RepositoryResult<CorruptSnapshotExport>) => void;
    const repository: DocumentRepository = {
      ...inertPort(),
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
    await startAccepted(controller, tree);

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

/** Starts as a tab does: a stored row becomes the basis once the store takes it. */
async function startAccepted(
  controller: ReturnType<typeof createPersistenceController>,
  tree: ThoughtTree,
  history?: TreeHistory,
) {
  const candidate = await controller.start(tree, history);
  if (candidate !== null) expect(controller.adoptStored(candidate, () => KEPT_HISTORY)).toBe("adopted");
  return candidate;
}

function stored(
  tree: ThoughtTree,
  writeGeneration: number,
  journal: PersistedHistoryJournal = emptyHistoryJournal(0),
): LoadedSnapshot {
  return Object.freeze({
    tree,
    history: EMPTY_RECOVERED,
    basis: Object.freeze({ writeGeneration, journal }),
  });
}

/** A history whose entries only carry byte counts; the controller never reads mementos. */
function historyOfBytes(bytes: readonly number[]): TreeHistory {
  const entries = bytes.map((retainedInverseBytes, index) => ({
    commandId: `step_${index}`,
    source: "human" as const,
    inverse: {} as TreeHistory["entries"][number]["inverse"],
    retainedInverseBytes,
  }));
  return { entries, redoEntries: [] };
}

function storageFull(): RepositoryResult<number> {
  return { ok: false, error: { code: "PERSISTENCE_STORAGE_FULL", message: "storage full" } };
}

function fakeRepository(loaded: LoadedSnapshot | null) {
  const port: DocumentRepository = {
    ...inertPort(),
    load: async (): Promise<RepositoryResult<LoadedSnapshot | null>> => ({ ok: true, value: loaded }),
    save: async ({ basis }) => ({
      ok: true,
      value: { writeGeneration: (basis.writeGeneration ?? 0) + 1, journal: basis.journal },
    }),
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
    basis: SnapshotBasis;
    history: TreeHistory;
    retention: HistoryRetention;
    settle: (result: RepositoryResult<SnapshotBasis>) => void;
  };
  const pending: Pending[] = [];
  const savedRevisions: number[] = [];
  let loads = 0;
  const port: DocumentRepository = {
    ...inertPort(),
    load: async () => {
      loads += 1;
      if (!deferNextLoad) return { ok: true, value: loaded };
      deferNextLoad = false;
      return new Promise<RepositoryResult<LoadedSnapshot | null>>((settle) => {
        pendingLoad = settle;
      });
    },
    save: async ({ treeRevision, basis, history, retention }) => {
      savedRevisions.push(treeRevision);
      return new Promise<RepositoryResult<SnapshotBasis>>((settle) => pending.push({
        treeRevision,
        expectedGeneration: basis.writeGeneration,
        basis,
        history,
        retention,
        settle,
      }));
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
    /** A bare generation settles with the journal the write was based on. */
    settleNext(result: RepositoryResult<number | SnapshotBasis>) {
      const write = pending.shift();
      if (write === undefined) throw new Error("no pending write");
      if (!result.ok) {
        write.settle(result);
        return;
      }
      write.settle({
        ok: true,
        value: typeof result.value === "number"
          ? { writeGeneration: result.value, journal: write.basis.journal }
          : result.value,
      });
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
    }),
    previous: previousTree === null || previousGeneration === null
      ? null
      : Object.freeze({
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          treeId: previousTree.id,
          treeRevision: previousTree.revision,
          writeGeneration: previousGeneration,
          bundle: treeToBundle(previousTree),
        }),
    basis: Object.freeze({ writeGeneration, journal: emptyHistoryJournal(1) }),
  });
}

function inertPort(): Pick<
  DocumentRepository,
  | "exportCorrupt"
  | "replaceCorrupt"
  | "reserveImportedSnapshot"
  | "rollbackImportedSnapshot"
  | "readGeneration"
  | "reclaimDerivedStorage"
  | "subscribeLifecycle"
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
    readGeneration: async () => ({ ok: true, value: null }),
    reclaimDerivedStorage: async () => false,
    subscribeLifecycle: () => () => undefined,
  };
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (assertion()) return;
    await Promise.resolve();
  }
  throw new Error("condition did not settle");
}
