import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RECOVERY } from "../interaction/chunk-recovery";
import { createTestRecoveryHost } from "../interaction/chunk-recovery-test-host";

afterEach(() => {
  vi.doUnmock("./wiki-runtime-core");
  vi.resetModules();
});

describe("Wiki authority loader", () => {
  it("starts the authority and sets ok receipt on successful import", async () => {
    const start = vi.fn().mockResolvedValue({ phase: "ready" });
    vi.doMock("./wiki-runtime-core", () => ({ startMatterWikiAuthority: start }));
    const { readWikiAuthorityLoadStatus, useWikiAuthority } = await import("./use-wiki-authority");
    expect(readWikiAuthorityLoadStatus()).toBe("pending");

    // The hook triggers the first load attempt; call the underlying function
    // directly (the hook body delegates to it).
    useWikiAuthority();
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("ok");
    expect(start).toHaveBeenCalled();
  });

  it("sets failed receipt and arms retry when wiki-runtime-core rejects", async () => {
    const clock = createTestRecoveryHost();
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus, useWikiAuthority, _setWikiAuthorityRecoveryHost } =
      await import("./use-wiki-authority");
    _setWikiAuthorityRecoveryHost(clock.host);

    useWikiAuthority();
    await vi.dynamicImportSettled();

    expect(readWikiAuthorityLoadStatus()).toBe("failed");
    expect(clock.timers).toBe(1);
    expect(clock.listening).toBe(true);
  });

  it("retries authority load on a recovery signal", async () => {
    const clock = createTestRecoveryHost();
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus, useWikiAuthority, _setWikiAuthorityRecoveryHost } =
      await import("./use-wiki-authority");
    _setWikiAuthorityRecoveryHost(clock.host);

    useWikiAuthority();
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
    vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
    const { readWikiAuthorityLoadStatus, useWikiAuthority, _setWikiAuthorityRecoveryHost } =
      await import("./use-wiki-authority");
    _setWikiAuthorityRecoveryHost(clock.host);

    useWikiAuthority();
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
