/**
 * Owns when a lazy chunk that failed to load is tried again. A failed fetch
 * (offline, a flaky network, a deployment that moved on) must not disable a
 * feature for the rest of the session, and must not become a polling loop
 * either. After each failure the owner waits out an exponential backoff, then
 * retries once; after a bounded number of such timed retries only evidence
 * that loading may now succeed tries again: the network coming back, the page
 * becoming visible, or the owner's own next demand once the backoff elapsed.
 * Timers and listeners exist only while a failure is unresolved and someone
 * still waits for the chunk.
 */
export const CHUNK_RECOVERY = Object.freeze({
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxTimedRetries: 6,
});

export type ChunkRecoveryHost = Readonly<{
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Listens for the network returning or the page becoming visible. */
  subscribeRecoverySignals: (listener: () => void) => () => void;
}>;

export type ChunkRecovery = Readonly<{
  /** A load failed: arm one backed-off retry and listen for recovery signals. */
  failed: () => void;
  /** A load succeeded: forget failures and release every timer and listener. */
  succeeded: () => void;
  /** Whether a demand-driven attempt may start now, outside the backoff window. */
  mayAttempt: () => boolean;
  /** Nobody waits for the chunk any more: release timers and listeners. */
  release: () => void;
}>;

export function createChunkRecovery(
  retry: () => void,
  host: ChunkRecoveryHost | null = browserChunkRecoveryHost(),
): ChunkRecovery {
  let failures = 0;
  let timedRetries = 0;
  let nextAttemptAtMs = 0;
  let timer: unknown = null;
  let unsubscribe: (() => void) | null = null;
  const clearTimer = () => {
    if (timer !== null) host?.clearTimeout(timer);
    timer = null;
  };
  const release = () => {
    clearTimer();
    unsubscribe?.();
    unsubscribe = null;
  };
  return Object.freeze({
    failed() {
      if (host === null) return;
      failures += 1;
      const delayMs = Math.min(
        CHUNK_RECOVERY.initialDelayMs * 2 ** (failures - 1),
        CHUNK_RECOVERY.maxDelayMs,
      );
      nextAttemptAtMs = host.now() + delayMs;
      // Past the bound, a retry that is still pending is kept, not replaced.
      if (timedRetries < CHUNK_RECOVERY.maxTimedRetries) {
        clearTimer();
        timedRetries += 1;
        timer = host.setTimeout(() => {
          timer = null;
          retry();
        }, delayMs);
      }
      unsubscribe ??= host.subscribeRecoverySignals(() => {
        // Evidence that loading may succeed earns an immediate attempt.
        clearTimer();
        nextAttemptAtMs = 0;
        retry();
      });
    },
    succeeded() {
      failures = 0;
      timedRetries = 0;
      nextAttemptAtMs = 0;
      release();
    },
    mayAttempt: () => host === null || host.now() >= nextAttemptAtMs,
    release,
  });
}

function browserChunkRecoveryHost(): ChunkRecoveryHost | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const pageWindow = window;
  const pageDocument = document;
  return Object.freeze({
    now: () => performance.now(),
    setTimeout: (callback, delayMs) => pageWindow.setTimeout(callback, delayMs),
    clearTimeout: (handle) => pageWindow.clearTimeout(handle as number),
    subscribeRecoverySignals(listener) {
      const onVisibility = () => {
        if (pageDocument.visibilityState === "visible") listener();
      };
      pageWindow.addEventListener("online", listener);
      pageDocument.addEventListener("visibilitychange", onVisibility);
      return () => {
        pageWindow.removeEventListener("online", listener);
        pageDocument.removeEventListener("visibilitychange", onVisibility);
      };
    },
  });
}
