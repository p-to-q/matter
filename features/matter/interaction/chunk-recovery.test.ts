import { describe, expect, it, vi } from "vitest";
import { CHUNK_RECOVERY, createChunkRecovery } from "./chunk-recovery";
import { createTestRecoveryHost } from "./chunk-recovery-test-host";

describe("chunk recovery", () => {
  it("retries once per failure after an exponential, capped backoff", () => {
    const clock = createTestRecoveryHost();
    const retry = vi.fn();
    const recovery = createChunkRecovery(retry, clock.host);

    recovery.failed();
    expect(recovery.mayAttempt()).toBe(false);
    clock.advance(CHUNK_RECOVERY.initialDelayMs - 1);
    expect(retry).not.toHaveBeenCalled();
    clock.advance(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(recovery.mayAttempt()).toBe(true);

    recovery.failed();
    clock.advance(CHUNK_RECOVERY.initialDelayMs * 2 - 1);
    expect(retry).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(retry).toHaveBeenCalledTimes(2);

    for (let failure = 3; failure <= 10; failure += 1) recovery.failed();
    clock.advance(CHUNK_RECOVERY.maxDelayMs * 2);
    // Each failure re-arms only one pending retry.
    expect(retry).toHaveBeenCalledTimes(3);
  });

  it("stops timed retries after the bound, but still answers recovery signals", () => {
    const clock = createTestRecoveryHost();
    const retry = vi.fn();
    const recovery = createChunkRecovery(retry, clock.host);

    for (let index = 0; index < CHUNK_RECOVERY.maxTimedRetries; index += 1) {
      recovery.failed();
      clock.advance(CHUNK_RECOVERY.maxDelayMs);
    }
    expect(retry).toHaveBeenCalledTimes(CHUNK_RECOVERY.maxTimedRetries);
    recovery.failed();
    expect(clock.timers).toBe(0);
    clock.advance(CHUNK_RECOVERY.maxDelayMs * 10);
    expect(retry).toHaveBeenCalledTimes(CHUNK_RECOVERY.maxTimedRetries);
    // Demand still waits out the backoff it was given, then may try.
    expect(recovery.mayAttempt()).toBe(true);

    // The network returns: one immediate attempt, the backoff forgiven.
    recovery.failed();
    expect(recovery.mayAttempt()).toBe(false);
    clock.signal();
    expect(retry).toHaveBeenCalledTimes(CHUNK_RECOVERY.maxTimedRetries + 1);
    expect(recovery.mayAttempt()).toBe(true);
  });

  it("releases every timer and listener on success or when nobody waits", () => {
    const clock = createTestRecoveryHost();
    const retry = vi.fn();
    const recovery = createChunkRecovery(retry, clock.host);

    recovery.failed();
    expect(clock.timers).toBe(1);
    expect(clock.listening).toBe(true);
    recovery.succeeded();
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
    // Success forgets the failures: the next backoff starts short again.
    recovery.failed();
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    expect(retry).toHaveBeenCalledTimes(1);

    recovery.failed();
    recovery.release();
    clock.signal();
    clock.advance(CHUNK_RECOVERY.maxDelayMs);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a browser host", () => {
    const retry = vi.fn();
    const recovery = createChunkRecovery(retry, null);
    recovery.failed();
    expect(recovery.mayAttempt()).toBe(true);
    recovery.release();
    expect(retry).not.toHaveBeenCalled();
  });
});
