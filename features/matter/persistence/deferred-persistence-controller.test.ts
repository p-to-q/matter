import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { createTreeHistory } from "../tree/history";
import { createDeferredPersistenceController, ENGINE_RETRY_DELAYS_MS } from "./deferred-persistence-controller";
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

  it("stays loading while a failed engine fetch retries on its backoff, then says the code could not load", async () => {
    const tree = createSeededDocument().tree;
    const retry = retryEnvironment();
    let failuresLeft = Number.POSITIVE_INFINITY;
    const created = vi.fn((options: PersistenceControllerOptions) =>
      createPersistenceController(repository(null), options));
    const load = vi.fn(async () => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("chunk load failed");
      }
      return { createIndexedDbPersistenceController: created };
    });
    const facade = createDeferredPersistenceController({}, load, retry.environment);
    let startSettled = false;
    const started = facade.start(tree).then((value) => {
      startSettled = true;
      return value;
    });

    // Every backoff wait of the grace keeps the loading status.
    for (const delay of ENGINE_RETRY_DELAYS_MS) {
      await vi.waitFor(() => expect(retry.timers).toHaveLength(1));
      expect(retry.timers[0]?.delayMs).toBe(delay);
      expect(facade.getStatus()).toBe(LOADING_PERSISTENCE_STATUS);
      retry.fire();
    }
    await vi.waitFor(() => expect(facade.getStatus().phase).toBe("error"));
    expect(load).toHaveBeenCalledTimes(ENGINE_RETRY_DELAYS_MS.length + 1);
    // Its own answer: the code did not load, not "this browser does not save".
    expect(facade.getStatus()).toEqual({
      ...LOADING_PERSISTENCE_STATUS,
      phase: "error",
      errorCode: "PERSISTENCE_ENGINE_UNAVAILABLE",
    });
    expect(retry.timers).toHaveLength(0);
    expect(startSettled).toBe(false);
    // Other asynchronous calls answer once the grace ends; none hangs.
    await expect(facade.prepareImportedTree(tree)).resolves.toEqual({
      ok: false,
      errorCode: "PERSISTENCE_UNAVAILABLE",
    });

    // Back online: one quiet fetch, and the line stays until it lands.
    load.mockClear();
    retry.recover();
    expect(facade.getStatus().errorCode).toBe("PERSISTENCE_ENGINE_UNAVAILABLE");
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(retry.timers).toHaveLength(0);
    expect(facade.getStatus().errorCode).toBe("PERSISTENCE_ENGINE_UNAVAILABLE");

    // Visible again, and the network is back this time.
    failuresLeft = 0;
    retry.recover();
    await expect(started).resolves.toBeNull();
    expect(created).toHaveBeenCalledOnce();
    expect(facade.getStatus().errorCode).toBeNull();
    // The engine arrived: nothing listens for recovery any longer.
    expect(retry.listening).toBe(false);
  });

  it("lets a returning connection cut a backoff wait short, and Retry restart the grace", async () => {
    const tree = createSeededDocument().tree;
    const retry = retryEnvironment();
    let failuresLeft = 1;
    const created = vi.fn((options: PersistenceControllerOptions) =>
      createPersistenceController(repository(null), options));
    const load = vi.fn(async () => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("chunk load failed");
      }
      return { createIndexedDbPersistenceController: created };
    });
    const facade = createDeferredPersistenceController({}, load, retry.environment);
    const started = facade.start(tree);
    await vi.waitFor(() => expect(retry.timers).toHaveLength(1));

    retry.recover();
    await expect(started).resolves.toBeNull();
    expect(retry.cleared).toBe(1);
    expect(retry.timers).toHaveLength(0);
    expect(created).toHaveBeenCalledOnce();

    // Retry after the grace ended shows loading again and fetches at once.
    const again = retryEnvironment();
    let failing = true;
    const flaky = vi.fn(async () => {
      if (failing) throw new Error("chunk load failed");
      return { createIndexedDbPersistenceController: created };
    });
    const retried = createDeferredPersistenceController({}, flaky, again.environment);
    void retried.start(tree);
    for (let index = 0; index < ENGINE_RETRY_DELAYS_MS.length; index += 1) {
      await vi.waitFor(() => expect(again.timers).toHaveLength(1));
      again.fire();
    }
    await vi.waitFor(() => expect(retried.getStatus().phase).toBe("error"));
    failing = false;
    retried.retry();
    expect(retried.getStatus()).toBe(LOADING_PERSISTENCE_STATUS);
    await vi.waitFor(() => expect(created).toHaveBeenCalledTimes(2));
    expect(retried.getStatus().errorCode).toBeNull();
    expect(again.timers).toHaveLength(0);
  });

  it("releases its backoff timer and recovery listeners when disposed during the grace", async () => {
    const retry = retryEnvironment();
    const load = vi.fn(async () => {
      throw new Error("chunk load failed");
    });
    const facade = createDeferredPersistenceController({}, load, retry.environment);
    const started = facade.start(createSeededDocument().tree);
    await vi.waitFor(() => expect(retry.timers).toHaveLength(1));
    expect(retry.listening).toBe(true);

    facade.dispose();
    expect(retry.timers).toHaveLength(0);
    expect(retry.listening).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    retry.recover();
    expect(load).toHaveBeenCalledOnce();
    void started;
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

/** Timers the test fires by hand, and one recovery signal (online or visible). */
function retryEnvironment() {
  let nextHandle = 0;
  const timers: { handle: number; delayMs: number; callback: () => void }[] = [];
  let recovery: (() => void) | null = null;
  const state = {
    timers,
    cleared: 0,
    get listening() {
      return recovery !== null;
    },
    environment: {
      setTimeout(callback: () => void, delayMs: number) {
        nextHandle += 1;
        timers.push({ handle: nextHandle, delayMs, callback });
        return nextHandle;
      },
      clearTimeout(handle: unknown) {
        const index = timers.findIndex((timer) => timer.handle === handle);
        if (index >= 0) {
          timers.splice(index, 1);
          state.cleared += 1;
        }
      },
      listenForRecovery(listener: () => void) {
        recovery = listener;
        return () => {
          if (recovery === listener) recovery = null;
        };
      },
    },
    fire() {
      const timer = timers.shift();
      if (timer === undefined) throw new Error("no timer");
      timer.callback();
    },
    recover() {
      recovery?.();
    },
  };
  return state;
}

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
