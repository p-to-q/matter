import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import { compileWikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import {
  DEFAULT_WIKI_CAPABILITY_PREFERENCES,
  serializeWikiCapabilityPreferences,
} from "./wiki-capability-preferences";
import { CHUNK_RECOVERY, type ChunkRecoveryHost } from "../interaction/chunk-recovery";
import { createTestRecoveryHost } from "../interaction/chunk-recovery-test-host";

const LEGACY_BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v5");
const BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v6");
const bridgeHost = globalThis as unknown as { [key: symbol]: unknown };

// Holds the recovery host for the current test. The vi.mock below intercepts
// createChunkRecovery at module init time, injecting this host so tests can
// inspect timers/listeners without any exported test-only setter.
let _testHost: ChunkRecoveryHost | null = null;

vi.mock("../interaction/chunk-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../interaction/chunk-recovery")>();
  return {
    ...actual,
    createChunkRecovery: (retry: () => void) =>
      actual.createChunkRecovery(retry, _testHost),
  };
});

afterEach(() => {
  _testHost = null;
  delete bridgeHost[LEGACY_BRIDGE_KEY];
  delete bridgeHost[BRIDGE_KEY];
  vi.doUnmock("./wiki-runtime-core");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Wiki runtime bridge", () => {
  it("matches the canonical empty basis without loading durable configuration", async () => {
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();
    const bridge = await import("./wiki-runtime-bridge");
    const compiled = compileWikiBasis(createEmptyWikiState(), 0);
    if (!compiled.ok) throw new Error(compiled.error.message);

    expect(bridge.readMatterWikiBasis()).toEqual(compiled.basis);
  });

  it("does not reuse a legacy Fast Refresh cell after the basis ABI changes", async () => {
    bridgeHost[LEGACY_BRIDGE_KEY] = Object.freeze({
      current: Object.freeze({ stateRevision: 99 }),
    });
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();

    const bridge = await import("./wiki-runtime-bridge");

    expect(bridge.readMatterWikiBasis()).toMatchObject({
      stateRevision: 0,
      confirmedSnapshot: { generation: 0, rules: [] },
    });
    expect(bridgeHost[BRIDGE_KEY]).toBeDefined();
  });

  it("keeps the Store reader on one published basis across module re-evaluation", async () => {
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();
    const first = await import("./wiki-runtime-bridge");
    const created = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "engle bart",
      canonical: "Engelbart",
    });
    if (!created.ok) throw new Error(created.error.message);
    const compiled = compileWikiBasis(created.state, 1);
    if (!compiled.ok) throw new Error(compiled.error.message);

    expect(first.matterWikiBasisPublication.bindInterpreter(canonicalizeWikiText)
      .publishCompiled(compiled.basis)).toMatchObject({ ok: true });
    const captured = first.readMatterWikiBasis();

    vi.resetModules();
    const second = await import("./wiki-runtime-bridge");
    expect(second.readMatterWikiBasis()).toBe(captured);
    expect(second.readMatterWikiInterpreter()).toBe(canonicalizeWikiText);
    expect(second.matterWikiBasisPublication.bindInterpreter(canonicalizeWikiText)
      .publishCompiled(compiled.basis)).toMatchObject({
      ok: false,
      error: { code: "STALE_GENERATION" },
    });
  });

  it("offers a publishing port only together with the interpreter of its rules", async () => {
    delete bridgeHost[BRIDGE_KEY];
    vi.resetModules();
    const bridge = await import("./wiki-runtime-bridge");

    expect(bridge.readMatterWikiInterpreter()).toBeNull();
    expect("publishCompiled" in bridge.matterWikiBasisPublication).toBe(false);

    const publisher = bridge.matterWikiBasisPublication.bindInterpreter(canonicalizeWikiText);
    expect(bridge.readMatterWikiInterpreter()).toBe(canonicalizeWikiText);
    expect(publisher.read()).toBe(bridge.readMatterWikiBasis());
  });

  it("does not load the runtime when both permissions are already disabled", async () => {
    const serialized = serializeWikiCapabilityPreferences({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      automaticCollection: false,
      phoneticFitting: false,
    });
    vi.stubGlobal("localStorage", {
      getItem: () => serialized,
    });
    const observe = vi.fn();
    vi.doMock("./wiki-runtime-core", () => ({
      observeMatterWikiCommittedMaterial: observe,
    }));
    const bridge = await import("./wiki-runtime-bridge");

    bridge.observeMatterWikiEvidence(ADMISSION);
    await vi.dynamicImportSettled();

    expect(observe).not.toHaveBeenCalled();
  });

  it("forwards no frozen permission snapshot to the lazy runtime", async () => {
    let serialized = serializeWikiCapabilityPreferences(
      DEFAULT_WIKI_CAPABILITY_PREFERENCES,
    );
    vi.stubGlobal("localStorage", {
      getItem: () => serialized,
    });
    const observe = vi.fn();
    vi.doMock("./wiki-runtime-core", () => ({
      observeMatterWikiCommittedMaterial: observe,
    }));
    const bridge = await import("./wiki-runtime-bridge");

    bridge.observeMatterWikiEvidence(ADMISSION);
    serialized = serializeWikiCapabilityPreferences({
      ...DEFAULT_WIKI_CAPABILITY_PREFERENCES,
      automaticCollection: false,
    });
    await vi.dynamicImportSettled();

    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(ADMISSION);
  });

  it("settles one claimed occurrence once with its minted attribution", async () => {
    const settle = vi.fn().mockResolvedValue({
      ok: true,
      changed: true,
      generation: 2,
      stateRevision: 4,
    });
    vi.doMock("./wiki-runtime-core", () => ({
      settleHydratedMatterWikiOccurrence: settle,
    }));
    const bridge = await import("./wiki-runtime-bridge");
    const occurrenceId = bridge.mintMatterWikiOccurrence(ATTRIBUTION);
    expect(occurrenceId).toMatch(/^[0-9a-f]{32}$/u);
    bridge.claimMatterWikiPublication(publicationOf([occurrenceId!]));

    await expect(bridge.settleMatterWikiOccurrence(occurrenceId!, "accepted-implicit"))
      .resolves.toBe("recorded");
    await expect(bridge.settleMatterWikiOccurrence(occurrenceId!, "explicit-confirm"))
      .resolves.toBe("unattributed");
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith({
      occurrenceId,
      outcome: "accepted-implicit",
      rule: ATTRIBUTION.rule,
      origin: "human-admission",
    });
  });

  it("releases a censored or uncommitted occurrence without waking storage", async () => {
    const settle = vi.fn();
    vi.doMock("./wiki-runtime-core", () => ({
      settleHydratedMatterWikiOccurrence: settle,
    }));
    const bridge = await import("./wiki-runtime-bridge");
    const censored = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
    bridge.claimMatterWikiPublication(publicationOf([censored]));
    const uncommitted = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;

    await expect(bridge.settleMatterWikiOccurrence(censored, "censored")).resolves.toBe("neutral");
    await expect(bridge.settleMatterWikiOccurrence(uncommitted, "explicit-confirm"))
      .resolves.toBe("unattributed");
    await vi.dynamicImportSettled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("offers only the edits whose attribution is still claimable as occurrences", async () => {
    const bridge = await import("./wiki-runtime-bridge");
    const kept = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
    const complete = publicationOf([kept]);
    // Every edit still attributable: the very same publication passes through.
    expect(bridge.claimMatterWikiPublication(complete)).toBe(complete);

    const minted = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
    // An id the registry never held (evicted, expired, or never minted).
    const narrowed = bridge.claimMatterWikiPublication(publicationOf([minted, "f".repeat(32)]));
    expect(narrowed.edits.map((edit) => edit.occurrence)).toEqual([minted]);
    expect(Object.isFrozen(narrowed.edits)).toBe(true);
  });

  it("mints no attribution without a secure random source", async () => {
    vi.stubGlobal("crypto", undefined);
    const bridge = await import("./wiki-runtime-bridge");
    expect(bridge.mintMatterWikiOccurrence(ATTRIBUTION)).toBeNull();
  });

  describe("honest loader — observe", () => {
    it("sets failed receipt and skips call during backoff when wiki-runtime-core rejects", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      // localStorage: null → both capabilities enabled (bit 1 | 2 = 3).
      vi.stubGlobal("localStorage", { getItem: () => null });
      vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
      const bridge = await import("./wiki-runtime-bridge");

      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("pending");
      bridge.observeMatterWikiEvidence(ADMISSION);
      await vi.dynamicImportSettled();

      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("failed");
      // Inside the backoff window the next call is skipped (degraded behaviour).
      const observe = vi.fn();
      vi.doMock("./wiki-runtime-core", () => ({ observeMatterWikiCommittedMaterial: observe }));
      bridge.observeMatterWikiEvidence(ADMISSION);
      await vi.dynamicImportSettled();
      expect(observe).not.toHaveBeenCalled();
      expect(clock.timers).toBe(1);
      expect(clock.listening).toBe(true);
    });

    it("retries observe on a recovery signal and clears receipt on success", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      vi.stubGlobal("localStorage", { getItem: () => null });
      vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
      const bridge = await import("./wiki-runtime-bridge");

      bridge.observeMatterWikiEvidence(ADMISSION);
      await vi.dynamicImportSettled();
      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("failed");

      // Recovery signal: the retry imports the (now-unblocked) chunk.
      const observe = vi.fn();
      vi.doMock("./wiki-runtime-core", () => ({ observeMatterWikiCommittedMaterial: observe }));
      clock.signal();
      await vi.dynamicImportSettled();

      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("ok");
      // Timers and listeners released after success.
      expect(clock.timers).toBe(0);
      expect(clock.listening).toBe(false);
    });

    it("retries observe after the backoff elapses", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      vi.stubGlobal("localStorage", { getItem: () => null });
      vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
      const bridge = await import("./wiki-runtime-bridge");

      bridge.observeMatterWikiEvidence(ADMISSION);
      await vi.dynamicImportSettled();
      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("failed");

      const observe = vi.fn();
      vi.doMock("./wiki-runtime-core", () => ({ observeMatterWikiCommittedMaterial: observe }));
      clock.advance(CHUNK_RECOVERY.initialDelayMs);
      await vi.dynamicImportSettled();

      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("ok");
      expect(clock.timers).toBe(0);
      expect(clock.listening).toBe(false);
    });
  });

  describe("honest loader — settle", () => {
    it("sets failed receipt when wiki-runtime-core rejects during settlement", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
      const bridge = await import("./wiki-runtime-bridge");

      const occurrenceId = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
      bridge.claimMatterWikiPublication(publicationOf([occurrenceId]));

      await expect(bridge.settleMatterWikiOccurrence(occurrenceId, "accepted-implicit"))
        .resolves.toBe("failed");
      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("failed");
      expect(clock.timers).toBe(1);
      expect(clock.listening).toBe(true);
    });

    it("retries settle chunk on a recovery signal after a load failure", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      vi.doMock("./wiki-runtime-core", () => { throw new Error("offline"); });
      const bridge = await import("./wiki-runtime-bridge");

      const occurrenceId = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
      bridge.claimMatterWikiPublication(publicationOf([occurrenceId]));
      await bridge.settleMatterWikiOccurrence(occurrenceId, "accepted-implicit");

      const settle = vi.fn().mockResolvedValue({ ok: true, changed: true, generation: 1, stateRevision: 1 });
      vi.doMock("./wiki-runtime-core", () => ({ settleHydratedMatterWikiOccurrence: settle }));
      clock.signal();
      await vi.dynamicImportSettled();

      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("ok");
      expect(clock.timers).toBe(0);
      expect(clock.listening).toBe(false);
    });

    it("does not arm retry for settle runtime errors after the chunk loaded", async () => {
      const clock = createTestRecoveryHost();
      _testHost = clock.host;
      const settle = vi.fn().mockRejectedValue(new Error("runtime error"));
      vi.doMock("./wiki-runtime-core", () => ({ settleHydratedMatterWikiOccurrence: settle }));
      const bridge = await import("./wiki-runtime-bridge");

      const occurrenceId = bridge.mintMatterWikiOccurrence(ATTRIBUTION)!;
      bridge.claimMatterWikiPublication(publicationOf([occurrenceId]));
      await expect(bridge.settleMatterWikiOccurrence(occurrenceId, "accepted-implicit"))
        .resolves.toBe("failed");

      // Chunk loaded fine — status is ok and no retry was armed.
      expect(bridge.readWikiRuntimeCoreLoadStatus()).toBe("ok");
      expect(clock.timers).toBe(0);
      expect(clock.listening).toBe(false);
    });
  });
});

function publicationOf(occurrences: readonly string[]): MaterialLexicalOccurrencePublication {
  return Object.freeze({
    treeId: "tree_1",
    documentEpoch: 1,
    nodeId: "thought_1",
    nodeUpdatedAt: "2026-09-30T00:00:00.000Z",
    stage: "admission" as const,
    channel: "spoken" as const,
    locale: "zh-CN" as const,
    edits: Object.freeze(occurrences.map((occurrence, index) => Object.freeze({
      start: index * 2,
      end: index * 2 + 1,
      occurrence,
      sourceText: "p",
    }))),
  });
}

const ATTRIBUTION = Object.freeze({
  rule: Object.freeze({
    locale: "zh-CN" as const,
    channel: "spoken" as const,
    boundary: "word" as const,
    form: "P to Q",
    canonical: "[p → q]",
    appliedAtRevision: 0,
  }),
  origin: "human-admission" as const,
});

const ADMISSION_TEXT = Object.freeze({
  locale: "en-US" as const,
  channel: "spoken" as const,
  text: "Englebart spoke",
});
const ADMISSION = Object.freeze({
  observed: ADMISSION_TEXT,
  committed: ADMISSION_TEXT,
});
