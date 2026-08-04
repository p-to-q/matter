import { describe, expect, it } from "vitest";
import { createRootedMaterialFixture } from "../fixtures/rooted-material";
import type {
  DocumentRepository,
  LoadedSnapshot,
  RepositoryResult,
} from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import type { SnapshotBundle } from "./snapshot-codec";

describe("persistence controller", () => {
  it("loads a stored tree and reports the persisted revision", async () => {
    const tree = createRootedMaterialFixture().tree;
    const repository = fakeRepository({ tree, writeGeneration: 3 });
    const controller = createPersistenceController(repository.port);

    await expect(controller.start(tree)).resolves.toEqual({ storedTree: tree });
    expect(controller.getStatus()).toEqual({
      phase: "saved",
      persistedRevision: tree.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("coalesces revisions published during one write into the latest snapshot", async () => {
    const tree = createRootedMaterialFixture().tree;
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

  it("retains the latest dirty tree on conflict until explicit reload resolves it", async () => {
    const tree = createRootedMaterialFixture().tree;
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
    await expect(controller.resolveConflict()).resolves.toEqual({ storedTree: newer });
    expect(repository.loads).toBe(2);
    await waitFor(() => controller.getStatus().phase === "saved");
    expect(controller.getStatus()).toMatchObject({
      persistedRevision: newer.revision,
      dirtyRevision: null,
      errorCode: null,
    });
  });

  it("keeps a newer local publish dirty while conflict reload is in flight", async () => {
    const tree = createRootedMaterialFixture().tree;
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
    await expect(resolving).resolves.toEqual({ storedTree: null });
    expect(controller.getStatus()).toMatchObject({
      phase: "error",
      dirtyRevision: newerLocal.revision,
      errorCode: "PERSISTENCE_CONFLICT",
    });
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
    save: async (_treeId: string, treeRevision: number, bundle: SnapshotBundle, expectedGeneration) => {
      void bundle;
      savedRevisions.push(treeRevision);
      return new Promise<RepositoryResult<number>>((settle) => pending.push({ treeRevision, expectedGeneration, settle }));
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
