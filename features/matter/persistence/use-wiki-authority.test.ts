import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RECOVERY, type ChunkRecoveryHost } from "../interaction/chunk-recovery";
import { createTestRecoveryHost } from "../interaction/chunk-recovery-test-host";

// Holds the recovery host for the current test. Injected at module init via
// the vi.mock below, so no test-only setter export is needed.
let _testHost: ChunkRecoveryHost | null = null;
// The retryAuthorityLoad function captured at module init. Used in tests to
// trigger the load without mounting the hook in a React context.
let _capturedRetry: (() => void) | null = null;

vi.mock("../interaction/chunk-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../interaction/chunk-recovery")>();
  return {
    ...actual,
    createChunkRecovery: (retry: () => void) => {
      _capturedRetry = retry;
      return actual.createChunkRecovery(retry, _testHost);
    },
  };
});

afterEach(() => {
  _testHost = null;
  _capturedRetry = null;
  vi.doUnmock("./wiki-runtime-core");
  vi.resetModules();
});

describe("Wiki authority loader", () => {
  it("starts the authority and sets ok receipt on successful import", async () => {
    const start = vi.fn().mockResolvedValue({ phase: "ready" });
    vi.doMock("./wiki-runtime-core", () => ({ startMatterWikiAuthority: start }));
    const { readWikiAuthorityLoadStatus } = await import("./use-wiki-authority");
    expect(readWikiAuthorityLoadStatus()).toBe("pending");

    _capturedRetry?.();
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("ok");
    expect(start).toHaveBeenCalled();
  });

  it("sets failed receipt and arms retry when wiki-runtime-core rejects", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus } = await import("./use-wiki-authority");

    _capturedRetry?.();
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("failed");
    expect(clock.timers).toBe(1);
    expect(clock.listening).toBe(true);
  });

  it("retries authority load on a recovery signal", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus } = await import("./use-wiki-authority");

    _capturedRetry?.();
    await vi.dynamicImportSettled();
    expect(readWikiAuthorityLoadStatus()).toBe("failed");

    const start = vi.fn().mockResolvedValue({ phase: "ready" });
    vi.doMock("./wiki-runtime-core", () => ({ startMatterWikiAuthority: start }));
    clock.signal();
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("ok");
    expect(start).toHaveBeenCalled();
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
  });

  it("retries authority load after the backoff elapses", async () => {
    const clock = createTestRecoveryHost();
    _testHost = clock.host;
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus } = await import("./use-wiki-authority");

    _capturedRetry?.();
    await vi.dynamicImportSettled();

    const start = vi.fn().mockResolvedValue({ phase: "ready" });
    vi.doMock("./wiki-runtime-core", () => ({ startMatterWikiAuthority: start }));
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("ok");
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
  });
});
