import type { ChunkRecoveryHost } from "./chunk-recovery";

/** A deterministic clock, timer, and signal source for chunk-recovery tests. */
export function createTestRecoveryHost() {
  let now = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const signals = new Set<() => void>();
  const host: ChunkRecoveryHost = Object.freeze({
    now: () => now,
    setTimeout(callback, delayMs) {
      const timer = { at: now + delayMs, callback };
      timers.add(timer);
      return timer;
    },
    clearTimeout(handle) {
      timers.delete(handle as { at: number; callback: () => void });
    },
    subscribeRecoverySignals(listener) {
      signals.add(listener);
      return () => {
        signals.delete(listener);
      };
    },
  });
  return {
    host,
    advance(ms: number) {
      now += ms;
      for (const timer of [...timers].sort((left, right) => left.at - right.at)) {
        if (timer.at > now || !timers.has(timer)) continue;
        timers.delete(timer);
        timer.callback();
      }
    },
    /** The network came back, or the page became visible. */
    signal() {
      for (const listener of [...signals]) listener();
    },
    get timers() {
      return timers.size;
    },
    get listening() {
      return signals.size > 0;
    },
  };
}
