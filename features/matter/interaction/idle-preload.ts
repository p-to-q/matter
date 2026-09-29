/**
 * A pointer gesture must never wait on a code fetch at the moment it lands.
 * Code that only a later gesture needs stays out of the initial graph and is
 * started here: once the page is idle after first paint, or earlier when an
 * intent signal names it.
 *
 * Loaders must be idempotent, which a dynamic import is. A failure is ignored
 * here because the gesture path repeats the same import and owns its error;
 * preloading is an optimization, never a precondition.
 */
export type Preload = () => Promise<unknown>;

type IdleHost = Readonly<{
  requestIdleCallback?: (callback: () => void, options?: Readonly<{ timeout: number }>) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (handle: number) => void;
}>;

/** Idle is bounded: a busy page still starts the loads within this delay. */
export const IDLE_PRELOAD_TIMEOUT_MS = 1_500;
/** Without an idle callback, a short delay keeps the loads behind first paint. */
const FALLBACK_DELAY_MS = 250;

/** Starts one load now, for an intent signal. */
export function preloadNow(load: Preload): void {
  try {
    void load().catch(() => undefined);
  } catch {
    // A loader that throws synchronously is as optional as one that rejects.
  }
}

/**
 * Schedules the loads for the next idle period. Call it from an effect, which
 * runs after paint; the returned cleanup cancels loads not yet started.
 */
export function preloadWhenIdle(
  loads: readonly Preload[],
  host: IdleHost | null = browserIdleHost(),
): () => void {
  if (host === null || loads.length === 0) return () => undefined;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    for (const load of loads) preloadNow(load);
  };
  if (typeof host.requestIdleCallback === "function") {
    const handle = host.requestIdleCallback(start, { timeout: IDLE_PRELOAD_TIMEOUT_MS });
    return () => {
      started = true;
      host.cancelIdleCallback?.(handle);
    };
  }
  const handle = host.setTimeout(start, FALLBACK_DELAY_MS);
  return () => {
    started = true;
    host.clearTimeout(handle);
  };
}

function browserIdleHost(): IdleHost | null {
  if (typeof window === "undefined") return null;
  const idleWindow = window as Window & {
    requestIdleCallback?: IdleHost["requestIdleCallback"];
    cancelIdleCallback?: IdleHost["cancelIdleCallback"];
  };
  return Object.freeze({
    requestIdleCallback: typeof idleWindow.requestIdleCallback === "function"
      ? idleWindow.requestIdleCallback.bind(idleWindow)
      : undefined,
    cancelIdleCallback: typeof idleWindow.cancelIdleCallback === "function"
      ? idleWindow.cancelIdleCallback.bind(idleWindow)
      : undefined,
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  });
}
