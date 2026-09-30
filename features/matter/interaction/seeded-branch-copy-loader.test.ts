import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RECOVERY, type ChunkRecoveryHost } from "./chunk-recovery";
import { createTestRecoveryHost } from "./chunk-recovery-test-host";

// Holds the recovery host for the current test. Injected at module init via
// the vi.mock below, so no test-only setter export is needed.
let _testHost: ChunkRecoveryHost | null = null;

vi.mock("./chunk-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chunk-recovery")>();
  return {
    ...actual,
    createChunkRecovery: (retry: () => void) =>
      actual.createChunkRecovery(retry, _testHost),
  };
});

afterEach(() => {
  _testHost = null;
  vi.doUnmock("../material/seeded-branch-copy");
  vi.resetModules();
});

describe("Seeded branch copy loader", () => {
  it("delivers the richer resolver to subscribers on successful load", async () => {
    const richerResolver = vi.fn();
    vi.doMock("../material/seeded-branch-copy", () => ({ seededBranchTexts: richerResolver }));
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");
    expect(readSeededBranchCopyLoadStatus()).toBe("pending");

    const received: unknown[] = [];
    const cleanup = subscribeSeededBranchCopyResolver((r) => received.push(r));
    await vi.dynamicImportSettled();

    expect(readSeededBranchCopyLoadStatus()).toBe("ok");
    expect(received).toEqual([richerResolver]);
    cleanup();
  });

  it("sets failed receipt and stays on five-locale floor when chunk rejects", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("../material/seeded-branch-copy", () => { throw new Error("offline"); });
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");

    const received: unknown[] = [];
    const cleanup = subscribeSeededBranchCopyResolver((r) => received.push(r));
    await vi.dynamicImportSettled();

    expect(readSeededBranchCopyLoadStatus()).toBe("failed");
    expect(received).toHaveLength(0);
    expect(clock.timers).toBe(1);
    expect(clock.listening).toBe(true);
    cleanup();
  });

  it("retries on a recovery signal and delivers to all active subscribers", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("../material/seeded-branch-copy", () => { throw new Error("offline"); });
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const cleanupA = subscribeSeededBranchCopyResolver((r) => receivedA.push(r));
    await vi.dynamicImportSettled();
    const cleanupB = subscribeSeededBranchCopyResolver((r) => receivedB.push(r));

    expect(readSeededBranchCopyLoadStatus()).toBe("failed");

    const richerResolver = vi.fn();
    vi.doMock("../material/seeded-branch-copy", () => ({ seededBranchTexts: richerResolver }));
    clock.signal();
    await vi.dynamicImportSettled();

    expect(readSeededBranchCopyLoadStatus()).toBe("ok");
    expect(receivedA).toEqual([richerResolver]);
    expect(receivedB).toEqual([richerResolver]);
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
    cleanupA();
    cleanupB();
  });

  it("retries after the backoff elapses", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("../material/seeded-branch-copy", () => { throw new Error("offline"); });
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");

    const received: unknown[] = [];
    const cleanup = subscribeSeededBranchCopyResolver((r) => received.push(r));
    await vi.dynamicImportSettled();
    expect(readSeededBranchCopyLoadStatus()).toBe("failed");

    const richerResolver = vi.fn();
    vi.doMock("../material/seeded-branch-copy", () => ({ seededBranchTexts: richerResolver }));
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    await vi.dynamicImportSettled();

    expect(readSeededBranchCopyLoadStatus()).toBe("ok");
    expect(received).toEqual([richerResolver]);
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
    cleanup();
  });

  it("releases timers and listeners when the last subscriber unsubscribes", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("../material/seeded-branch-copy", () => { throw new Error("offline"); });
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");

    const cleanupA = subscribeSeededBranchCopyResolver(() => undefined);
    await vi.dynamicImportSettled();
    const cleanupB = subscribeSeededBranchCopyResolver(() => undefined);
    expect(readSeededBranchCopyLoadStatus()).toBe("failed");
    expect(clock.timers).toBe(1);

    // Removing one subscriber does not release yet.
    cleanupA();
    expect(clock.timers).toBe(1);

    // The last subscriber leaving releases timers and listeners.
    cleanupB();
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
  });

  it("delivers from cached import when subscribed after a successful load", async () => {
    const richerResolver = vi.fn();
    vi.doMock("../material/seeded-branch-copy", () => ({ seededBranchTexts: richerResolver }));
    const { readSeededBranchCopyLoadStatus, subscribeSeededBranchCopyResolver } =
      await import("./seeded-branch-copy-loader");

    const firstReceived: unknown[] = [];
    const cleanup = subscribeSeededBranchCopyResolver((r) => firstReceived.push(r));
    await vi.dynamicImportSettled();
    expect(readSeededBranchCopyLoadStatus()).toBe("ok");
    cleanup();

    // A second subscriber after success gets the resolver via the cached import.
    const secondReceived: unknown[] = [];
    const cleanup2 = subscribeSeededBranchCopyResolver((r) => secondReceived.push(r));
    await vi.dynamicImportSettled();
    expect(secondReceived).toEqual([richerResolver]);
    cleanup2();
  });
});
