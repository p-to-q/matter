import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { createTreeHistory } from "../tree/history";
import { createDeferredPersistenceController } from "./deferred-persistence-controller";
import type { DocumentRepository, LoadedSnapshot } from "./document-repository";
import { emptyHistoryJournal } from "./history-journal";
import {
  createPersistenceController,
  type PersistenceController,
  type PersistenceControllerOptions,
} from "./persistence-controller";
import { LOADING_PERSISTENCE_STATUS } from "./persistence-status";

describe("deferred persistence controller", () => {
  it("reports the controller's own loading status until its engine arrives", () => {
    const engine = deferredEngine();
    const facade = createDeferredPersistenceController({}, engine.load);

    expect(facade.getStatus()).toBe(LOADING_PERSISTENCE_STATUS);
    expect(facade.getStatus()).toEqual(
      createPersistenceController(repository(null)).getStatus(),
    );
    expect(engine.load).not.toHaveBeenCalled();
  });

  it("replays every call made before the engine arrives in its original order", async () => {
    const calls: string[] = [];
    const recording = recordingController(calls);
    const engine = deferredEngine(() => recording);
    const facade = createDeferredPersistenceController({}, engine.load);
    const tree = createSeededDocument().tree;
    const generation = { treeId: tree.id, writeGeneration: 2, storageSchemaVersion: 1 };

    const started = facade.start(tree);
    facade.publish(tree, undefined, true);
    expect(facade.observeStoredGeneration(generation)).toBe("ignored");
    facade.reportHistoryUnavailable();
    facade.acknowledgeHistoryNotice();
    expect(calls).toEqual([]);

    engine.resolve();
    await expect(started).resolves.toBeNull();
    expect(calls).toEqual([
      "start",
      "publish",
      "observeStoredGeneration",
      "reportHistoryUnavailable",
      "acknowledgeHistoryNotice",
    ]);
    facade.retry();
    expect(calls.at(-1)).toBe("retry");
  });

  it("forwards the controller's first read and every later status to subscribers", async () => {
    const tree = createSeededDocument().tree;
    const loaded: LoadedSnapshot = Object.freeze({
      tree,
      history: Object.freeze({ history: createTreeHistory(), released: false }),
      basis: Object.freeze({ writeGeneration: 3, journal: emptyHistoryJournal(0) }),
    });
    const engine = deferredEngine((options) => createPersistenceController(repository(loaded), options));
    const facade = createDeferredPersistenceController({}, engine.load);
    const listener = vi.fn();
    facade.subscribe(listener);

    const started = facade.start(tree);
    engine.resolve();
    const candidate = await started;
    expect(candidate).toMatchObject({ tree, replaces: null });
    expect(facade.getStatus().phase).toBe("loading");

    expect(facade.adoptStored(candidate!, () => ({ historyReleased: false }))).toBe("adopted");
    expect(facade.getStatus()).toMatchObject({ phase: "saved", persistedRevision: tree.revision });
    expect(listener).toHaveBeenCalled();
  });

  it("reports an engine that cannot load as unavailable storage and fetches it again on Retry", async () => {
    const tree = createSeededDocument().tree;
    let attempts = 0;
    const created = vi.fn((options: PersistenceControllerOptions) =>
      createPersistenceController(repository(null), options));
    const load = vi.fn(async () => {
      attempts += 1;
      if (attempts <= 2) throw new Error("chunk load failed");
      return { createIndexedDbPersistenceController: created };
    });
    const facade = createDeferredPersistenceController({}, load);
    let startSettled = false;
    const started = facade.start(tree).then((value) => {
      startSettled = true;
      return value;
    });

    await vi.waitFor(() => expect(facade.getStatus().phase).toBe("error"));
    expect(facade.getStatus()).toEqual({
      ...LOADING_PERSISTENCE_STATUS,
      phase: "error",
      errorCode: "PERSISTENCE_UNAVAILABLE",
    });
    expect(startSettled).toBe(false);
    // Other asynchronous calls answer for the attempt they joined; none hangs.
    const prepared = facade.prepareImportedTree(tree);
    await expect(prepared).resolves.toEqual({ ok: false, errorCode: "PERSISTENCE_UNAVAILABLE" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(created).not.toHaveBeenCalled();
    expect(startSettled).toBe(false);

    facade.retry();
    expect(facade.getStatus().phase).toBe("loading");
    await expect(started).resolves.toBeNull();
    expect(created).toHaveBeenCalledOnce();
    expect(facade.getStatus().errorCode).toBeNull();
  });

  it("creates no controller once disposed before its engine arrives", async () => {
    const created = vi.fn();
    const engine = deferredEngine(created);
    const facade = createDeferredPersistenceController({}, engine.load);
    void facade.start(createSeededDocument().tree);

    facade.dispose();
    engine.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(created).not.toHaveBeenCalled();
    await expect(facade.start(createSeededDocument().tree)).resolves.toBeNull();
  });
});

function deferredEngine(
  create: (options: PersistenceControllerOptions) => PersistenceController =
    (options) => createPersistenceController(repository(null), options),
) {
  let resolveLoad: (() => void) | null = null;
  const loaded = new Promise<void>((resolve) => {
    resolveLoad = resolve;
  });
  const load = vi.fn(async () => {
    await loaded;
    return { createIndexedDbPersistenceController: create };
  });
  return {
    load,
    resolve: () => resolveLoad?.(),
  };
}

function recordingController(calls: string[]): PersistenceController {
  const record = <T>(name: string, value: T) => () => {
    calls.push(name);
    return value;
  };
  return {
    start: record("start", Promise.resolve(null)),
    publish: record("publish", undefined),
    prepareImportedTree: record("prepareImportedTree", Promise.resolve({
      ok: false as const,
      errorCode: "IMPORT_CONFLICT" as const,
    })),
    activateImportedDocument: record("activateImportedDocument", undefined),
    discardImportedDocument: record("discardImportedDocument", Promise.resolve(null)),
    exportCorruptRecovery: record("exportCorruptRecovery", Promise.resolve({
      ok: false as const,
      errorCode: "PERSISTENCE_CONFLICT" as const,
    })),
    replaceCorrupt: record("replaceCorrupt", Promise.resolve({
      ok: false as const,
      errorCode: "PERSISTENCE_CONFLICT" as const,
    })),
    declareConflict: record("declareConflict", undefined),
    retry: record("retry", undefined),
    resolveConflict: record("resolveConflict", Promise.resolve(null)),
    observeStoredGeneration: record("observeStoredGeneration", "ignored" as const),
    checkStoredGeneration: record("checkStoredGeneration", Promise.resolve("ignored" as const)),
    prepareRefresh: record("prepareRefresh", Promise.resolve(null)),
    adoptStored: record("adoptStored", "stale" as const),
    reportHistoryUnavailable: record("reportHistoryUnavailable", undefined),
    acknowledgeHistoryNotice: record("acknowledgeHistoryNotice", undefined),
    dispose: record("dispose", undefined),
    getStatus: () => LOADING_PERSISTENCE_STATUS,
    subscribe: () => () => undefined,
  };
}

function repository(loaded: LoadedSnapshot | null): DocumentRepository {
  const unsupported = async () => ({
    ok: false as const,
    error: { code: "PERSISTENCE_UNAVAILABLE" as const, message: "unsupported" },
  });
  return {
    load: async () => ({ ok: true, value: loaded }),
    readGeneration: async () => ({ ok: true, value: null }),
    save: async ({ basis }) => ({
      ok: true,
      value: { writeGeneration: (basis.writeGeneration ?? 0) + 1, journal: basis.journal },
    }),
    reclaimDerivedStorage: async () => false,
    reserveImportedSnapshot: unsupported,
    rollbackImportedSnapshot: unsupported,
    exportCorrupt: unsupported,
    replaceCorrupt: unsupported,
    subscribeLifecycle: () => () => undefined,
    close: () => undefined,
  };
}
