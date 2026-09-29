import type {
  PersistenceController,
  PersistenceControllerOptions,
  PersistenceStatus,
} from "./persistence-controller";
import { LOADING_PERSISTENCE_STATUS } from "./persistence-status";

type PersistenceEngine = typeof import("./persistence-engine");
export type PersistenceEngineLoader = () => Promise<
  Pick<PersistenceEngine, "createIndexedDbPersistenceController">
>;

let engineLoad: Promise<PersistenceEngine> | null = null;

/** One shared fetch of the engine chunk; a failed fetch may be attempted again. */
function loadPersistenceEngine(): Promise<PersistenceEngine> {
  if (engineLoad === null) {
    const attempt = import("./persistence-engine");
    engineLoad = attempt;
    attempt.catch(() => {
      if (engineLoad === attempt) engineLoad = null;
    });
  }
  return engineLoad;
}

// The fetch starts when the main chunk evaluates: before hydration, and so
// before the effect that asks for the first stored row. On a warm or fast
// path the engine is present by then and the facade adds no wait.
if (typeof window !== "undefined") void loadPersistenceEngine().catch(() => undefined);

const ENGINE_UNAVAILABLE: PersistenceStatus = Object.freeze({
  ...LOADING_PERSISTENCE_STATUS,
  phase: "error",
  errorCode: "PERSISTENCE_ENGINE_UNAVAILABLE",
});

/**
 * Waits between fetches of an engine that failed to load. A fetch that fails
 * this many times in a row (about 3.5 s) ends the loading grace; later fetches
 * wait for a moment that could change the answer.
 */
export const ENGINE_RETRY_DELAYS_MS: readonly number[] = Object.freeze([500, 1_000, 2_000]);

/** The timers and page signals the facade's retries use; injectable for tests. */
export type EngineRetryEnvironment = Readonly<{
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Calls back when a failed fetch may now succeed: back online, or visible again. */
  listenForRecovery(listener: () => void): () => void;
}>;

/**
 * Stands in for the persistence controller while its storage engine loads, and
 * behaves as a controller whose construction is merely late:
 *
 * - until then it reports the controller's own loading status;
 * - a call made before the engine arrives is replayed on it in its original
 *   order, so `start`, which the owning hook calls first, precedes the rest;
 * - `start` waits for the engine however long that takes. The hook reconciles
 *   nothing until a stored row is read, and its exit guards answer by
 *   authorship until then, so material made meanwhile is guarded and later
 *   meets any stored row through the ordinary load-window rule;
 * - a failed fetch is a network fault, not a browser that cannot save. The
 *   facade stays loading while it fetches again on a short bounded backoff,
 *   then reports PERSISTENCE_ENGINE_UNAVAILABLE and fetches once more, quietly,
 *   whenever the browser comes back online or the page becomes visible; Retry
 *   starts the loading grace again. Any other asynchronous call resolves to
 *   its unavailable answer once the grace ends, and never hangs.
 *
 * No pointer gesture awaits this: while the status is loading the paper keeps
 * durable gestures inert, as it already does while IndexedDB reads.
 */
export function createDeferredPersistenceController(
  options: PersistenceControllerOptions = {},
  loadEngine: PersistenceEngineLoader = loadPersistenceEngine,
  environment: EngineRetryEnvironment = BROWSER_ENGINE_RETRY_ENVIRONMENT,
): PersistenceController {
  let controller: PersistenceController | null = null;
  let disposed = false;
  let loading: Promise<PersistenceController | null> | null = null;
  let status: PersistenceStatus = LOADING_PERSISTENCE_STATUS;
  // Recovery listeners exist only between a failed fetch and the engine's
  // arrival or disposal; the backoff timer only while a grace fetch waits.
  let stopRecovery: (() => void) | null = null;
  let backoff: Readonly<{ handle: unknown; wake: () => void }> | null = null;
  const replay: Array<(attached: PersistenceController) => void> = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const report = (next: PersistenceStatus) => {
    if (status === next) return;
    status = next;
    notify();
  };
  const releaseRetryResources = () => {
    stopRecovery?.();
    stopRecovery = null;
    backoff?.wake();
  };

  const waitBeforeRetry = (delayMs: number) => new Promise<void>((resolve) => {
    const wake = () => {
      if (backoff?.wake === wake) {
        environment.clearTimeout(backoff.handle);
        backoff = null;
      }
      resolve();
    };
    backoff = Object.freeze({ handle: environment.setTimeout(wake, delayMs), wake });
  });

  // Back online or visible again: a grace fetch waiting out its backoff goes
  // now, and after the grace one quiet fetch is made.
  const recover = () => {
    if (disposed || controller !== null) return;
    if (backoff !== null) backoff.wake();
    else if (loading === null) void attach(false);
  };

  const fetchEngine = async (delays: readonly number[]): Promise<PersistenceController | null> => {
    for (let failures = 0; ; failures += 1) {
      let engine: Awaited<ReturnType<PersistenceEngineLoader>>;
      try {
        engine = await loadEngine();
      } catch {
        if (disposed) return null;
        stopRecovery ??= environment.listenForRecovery(recover);
        const delay = delays[failures];
        if (delay === undefined) {
          loading = null;
          report(ENGINE_UNAVAILABLE);
          return null;
        }
        await waitBeforeRetry(delay);
        if (disposed) return null;
        continue;
      }
      loading = null;
      if (disposed) return null;
      releaseRetryResources();
      const attached = engine.createIndexedDbPersistenceController(options);
      controller = attached;
      attached.subscribe(notify);
      for (const call of replay.splice(0)) call(attached);
      notify();
      return attached;
    }
  };

  /**
   * `graced`: the status reads loading while the fetch retries on its backoff.
   * A quiet fetch after the grace keeps the unavailable line until it lands.
   */
  const attach = (graced = true): Promise<PersistenceController | null> => {
    if (controller !== null) return Promise.resolve(controller);
    if (disposed) return Promise.resolve(null);
    if (loading !== null) return loading;
    if (graced) report(LOADING_PERSISTENCE_STATUS);
    const attempt = fetchEngine(graced ? ENGINE_RETRY_DELAYS_MS : []);
    loading = attempt;
    return attempt;
  };

  /** A call the controller would take now, replayed on it once it exists. */
  const later = (call: (attached: PersistenceController) => void) => {
    if (controller !== null) call(controller);
    else if (!disposed) replay.push(call);
  };

  /**
   * An asynchronous call that waits for one engine attempt at most: the grace
   * in progress, or else one quiet fetch that leaves the status as it is.
   */
  const whenAttached = <T>(
    call: (attached: PersistenceController) => Promise<T>,
    unavailable: T,
  ): Promise<T> => {
    if (controller !== null) return call(controller);
    if (disposed) return Promise.resolve(unavailable);
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      replay.push((attached) => {
        if (settled) return;
        settled = true;
        call(attached).then(resolve, reject);
      });
      void attach(false).then((attached) => {
        if (attached !== null || settled) return;
        settled = true;
        resolve(unavailable);
      });
    });
  };

  return Object.freeze({
    start(tree, history) {
      if (controller !== null) return controller.start(tree, history);
      if (disposed) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        replay.push((attached) => {
          attached.start(tree, history).then(resolve, reject);
        });
        void attach();
      });
    },
    publish(tree, history, authored) {
      later((attached) => attached.publish(tree, history, authored));
    },
    prepareImportedTree: (tree, importOptions) => whenAttached(
      (attached) => attached.prepareImportedTree(tree, importOptions),
      Object.freeze({ ok: false as const, errorCode: "PERSISTENCE_UNAVAILABLE" as const }),
    ),
    activateImportedDocument(prepared) {
      later((attached) => attached.activateImportedDocument(prepared));
    },
    discardImportedDocument: (prepared) => whenAttached(
      (attached) => attached.discardImportedDocument(prepared),
      "PERSISTENCE_UNAVAILABLE" as const,
    ),
    exportCorruptRecovery: () => whenAttached(
      (attached) => attached.exportCorruptRecovery(),
      Object.freeze({ ok: false as const, errorCode: "PERSISTENCE_UNAVAILABLE" as const }),
    ),
    replaceCorrupt: () => whenAttached(
      (attached) => attached.replaceCorrupt(),
      Object.freeze({ ok: false as const, errorCode: "PERSISTENCE_UNAVAILABLE" as const }),
    ),
    declareConflict(tree, history, origin, authored) {
      later((attached) => attached.declareConflict(tree, history, origin, authored));
    },
    retry() {
      // Before a controller exists, retrying means fetching its engine again.
      if (controller !== null) controller.retry();
      else void attach();
    },
    resolveConflict: () => whenAttached((attached) => attached.resolveConflict(), null),
    observeStoredGeneration(generation) {
      if (controller !== null) return controller.observeStoredGeneration(generation);
      later((attached) => {
        attached.observeStoredGeneration(generation);
      });
      return "ignored";
    },
    checkStoredGeneration: () => whenAttached(
      (attached) => attached.checkStoredGeneration(),
      "ignored" as const,
    ),
    prepareRefresh: () => whenAttached((attached) => attached.prepareRefresh(), null),
    adoptStored(candidate, hydrate) {
      // A candidate comes only from a controller that exists.
      return controller === null ? "stale" : controller.adoptStored(candidate, hydrate);
    },
    reportHistoryUnavailable() {
      later((attached) => attached.reportHistoryUnavailable());
    },
    acknowledgeHistoryNotice() {
      later((attached) => attached.acknowledgeHistoryNotice());
    },
    dispose() {
      disposed = true;
      releaseRetryResources();
      replay.length = 0;
      listeners.clear();
      controller?.dispose();
    },
    getStatus: () => controller?.getStatus() ?? status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}

const BROWSER_ENGINE_RETRY_ENVIRONMENT: EngineRetryEnvironment = Object.freeze({
  setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  listenForRecovery(listener: () => void) {
    if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
    const onVisibility = () => {
      if (document.visibilityState === "visible") listener();
    };
    window.addEventListener("online", listener);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", listener);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  },
});
