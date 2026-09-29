import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiObserveEvidenceEvent } from "../wiki/wiki-model";

type StubProducerResult = Readonly<{
  status: "ok" | "partial" | "censored";
  events: readonly WikiObserveEvidenceEvent[];
  scannedScripts: readonly "latin"[];
}>;
type FitStub = (
  snapshot: unknown,
  request: unknown,
  enabled: unknown,
) => StubProducerResult;
type CollectionStub = (request: unknown, enabled: unknown) => StubProducerResult;

const stubs = vi.hoisted(() => {
  const coordinator = {
    readBasis: vi.fn(() => ({
      stateRevision: 0,
      fitSnapshot: { marker: "hydrated" },
      snapshot: { generation: 0 },
    })),
    start: vi.fn(),
    observe: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    readState: vi.fn(() => null),
    getStatus: vi.fn(() => ({ phase: "loading" as const })),
    retry: vi.fn(),
    decide: vi.fn(),
    resetCorrupt: vi.fn(),
    dispose: vi.fn(),
  };
  const generationChannel = {
    publish: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    close: vi.fn(),
  };
  return {
    coordinator,
    generationChannel,
    refresh: undefined as undefined | (() => Promise<unknown>),
    fit: vi.fn<FitStub>().mockReturnValue({
      status: "ok",
      events: Object.freeze([]),
      scannedScripts: Object.freeze(["latin" as const]),
    }),
    collect: vi.fn<CollectionStub>().mockReturnValue({
      status: "ok",
      events: Object.freeze([]),
      scannedScripts: Object.freeze(["latin" as const]),
    }),
    automaticCollection: true,
    phoneticFitting: true,
  };
});

vi.mock("./wiki-coordinator", () => ({
  createWikiCoordinator: () => stubs.coordinator,
}));
vi.mock("./wiki-generation-channel", () => ({
  createWikiGenerationChannel: () => stubs.generationChannel,
  createWikiGenerationRefreshQueue: (
    _readGeneration: () => number,
    refresh: () => Promise<unknown>,
  ) => {
    stubs.refresh = refresh;
    return { request: vi.fn() };
  },
}));
vi.mock("./wiki-repository", () => ({
  createIndexedDbWikiRepository: () => ({}),
}));
vi.mock("../wiki/wiki-fitting", () => ({
  fitCommittedWikiTextResult: (
    snapshot: unknown,
    request: unknown,
    enabled: unknown,
  ) => stubs.fit(snapshot, request, enabled),
}));
vi.mock("../wiki/wiki-term-collection", () => ({
  collectCommittedWikiTermsResult: (request: unknown, enabled: unknown) =>
    stubs.collect(request, enabled),
}));
vi.mock("./wiki-capability-preferences-reader", () => ({
  isMatterWikiAutomaticCollectionEnabled: () => stubs.automaticCollection,
  isMatterWikiPhoneticFittingEnabled: () => stubs.phoneticFitting,
}));

const RUNTIME_KEY = Symbol.for("ptoq.matter.wiki-runtime");
const ENGLISH_OPPORTUNITY = Object.freeze({
  locale: "en-US",
  channel: "spoken",
  scripts: ["latin"],
});
const LEGACY_RUNTIME_KEYS = Object.freeze([
  Symbol.for("ptoq.matter.wiki-runtime.v7"),
  Symbol.for("ptoq.matter.wiki-runtime.v8"),
]);
const host = globalThis as unknown as { [key: symbol]: unknown };

afterEach(() => {
  const runtimeSlot = host[RUNTIME_KEY] as
    | { runtime?: { dispose?: () => void } }
    | undefined;
  runtimeSlot?.runtime?.dispose?.();
  delete host[RUNTIME_KEY];
  for (const legacyRuntimeKey of LEGACY_RUNTIME_KEYS) {
    delete host[legacyRuntimeKey];
  }
  vi.clearAllMocks();
  stubs.coordinator.start.mockReset();
  stubs.coordinator.observe.mockReset();
  stubs.coordinator.retry.mockReset();
  stubs.coordinator.readBasis.mockReset().mockReturnValue({
    stateRevision: 0,
    fitSnapshot: { marker: "hydrated" },
    snapshot: { generation: 0 },
  });
  stubs.fit.mockReset().mockReturnValue({
    status: "ok",
    events: Object.freeze([]),
    scannedScripts: Object.freeze(["latin" as const]),
  });
  stubs.collect.mockReset().mockReturnValue({
    status: "ok",
    events: Object.freeze([]),
    scannedScripts: Object.freeze(["latin" as const]),
  });
  stubs.refresh = undefined;
  stubs.automaticCollection = true;
  stubs.phoneticFitting = true;
  vi.resetModules();
});

describe("Wiki runtime ownership", () => {
  it("publishes only the conservative product producer release", async () => {
    const runtime = await import("./wiki-runtime-core");

    expect(runtime.matterWikiProjectionPolicy.qualifiedProducerReleases.map((release) =>
      release.identity.producerId)).toEqual([
      "latin-internal-edit-v2",
      "locale-segment-v1",
      "shape-specific-v1",
    ]);
  });

  it.each(LEGACY_RUNTIME_KEYS)(
    "closes legacy runtime %s before installing the stable ABI slot",
    async (legacyRuntimeKey) => {
      const dispose = vi.fn();
      const close = vi.fn();
      host[legacyRuntimeKey] = {
        coordinator: { dispose },
        generationChannel: { close },
      };

      await import("./wiki-runtime-core");

      expect(close).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
      expect(host[legacyRuntimeKey]).toBeUndefined();
      expect(host[RUNTIME_KEY]).toMatchObject({ abi: 13 });
    },
  );

  it("disposes a mismatched stable ABI before replacement", async () => {
    const dispose = vi.fn();
    host[RUNTIME_KEY] = { abi: 12, runtime: { dispose } };

    await import("./wiki-runtime-core");

    expect(dispose).toHaveBeenCalledOnce();
    expect(host[RUNTIME_KEY]).toMatchObject({ abi: 13 });
  });

  it("announces each successfully hydrated generation only once", async () => {
    stubs.coordinator.start.mockResolvedValue({
      phase: "ready",
      generation: 8,
      stateRevision: 4,
    });
    stubs.coordinator.retry
      .mockResolvedValueOnce({ phase: "ready", generation: 8, stateRevision: 4 })
      .mockResolvedValueOnce({ phase: "ready", generation: 9, stateRevision: 5 })
      .mockResolvedValueOnce({
        phase: "degraded",
        reason: "storage",
        errorCode: "PERSISTENCE_UNAVAILABLE",
      });
    const runtime = await import("./wiki-runtime-core");

    await runtime.startMatterWikiAuthority();
    await runtime.startMatterWikiAuthority();
    await runtime.retryMatterWikiAuthority();
    await runtime.retryMatterWikiAuthority();
    await runtime.retryMatterWikiAuthority();

    expect(stubs.generationChannel.publish.mock.calls).toEqual([[8], [9]]);
  });

  it("routes cross-tab refresh hydration through the same monotonic announcement", async () => {
    stubs.coordinator.retry.mockResolvedValue({
      phase: "ready",
      generation: 12,
      stateRevision: 7,
    });
    await import("./wiki-runtime-core");

    await stubs.refresh?.();
    await stubs.refresh?.();

    expect(stubs.coordinator.retry).toHaveBeenCalledTimes(2);
    expect(stubs.generationChannel.publish.mock.calls).toEqual([[12]]);
  });

  it("keeps the announcement watermark across same-ABI module re-evaluation", async () => {
    stubs.coordinator.start.mockResolvedValue({
      phase: "ready",
      generation: 15,
      stateRevision: 9,
    });
    const first = await import("./wiki-runtime-core");
    await first.startMatterWikiAuthority();

    vi.resetModules();
    const second = await import("./wiki-runtime-core");
    await second.startMatterWikiAuthority();

    expect(stubs.generationChannel.publish.mock.calls).toEqual([[15]]);
  });

  it("hydrates before fitting the first admission and persists it through the FIFO", async () => {
    let resolveStart: ((status: {
      phase: "ready";
      generation: number;
      stateRevision: number;
    }) => void) | undefined;
    stubs.coordinator.start.mockReturnValue(new Promise((resolve) => {
      resolveStart = resolve;
    }));
    stubs.coordinator.observe.mockResolvedValue({
      ok: true,
      changed: false,
      generation: 3,
    });
    const termEvent = Object.freeze({
      type: "observe-evidence" as const,
      source: "recent-material" as const,
      locale: "en-US" as const,
      canonical: "Englebart",
      producer: "locale-segment-v1" as const,
    });
    const fittingEvent = Object.freeze({
      type: "observe-evidence" as const,
      source: "machine-inference" as const,
      locale: "en-US" as const,
      channel: "spoken" as const,
      boundary: "word" as const,
      form: "Englebart",
      canonical: "Engelbart",
      producer: "latin-internal-edit-v2" as const,
    });
    stubs.collect.mockReturnValueOnce({
      status: "ok",
      events: Object.freeze([termEvent]),
      scannedScripts: Object.freeze(["latin" as const]),
    });
    stubs.fit.mockReturnValueOnce({
      status: "ok",
      events: Object.freeze([fittingEvent]),
      scannedScripts: Object.freeze(["latin" as const]),
    });
    const runtime = await import("./wiki-runtime-core");

    runtime.observeMatterWikiCommittedMaterial({
      observed: { locale: "en-US", channel: "spoken", text: "Englebart" },
      committed: { locale: "en-US", channel: "spoken", text: "Englebart" },
    });
    await Promise.resolve();

    expect(stubs.fit).not.toHaveBeenCalled();
    expect(stubs.coordinator.observe).not.toHaveBeenCalled();

    resolveStart?.({ phase: "ready", generation: 3, stateRevision: 2 });
    await vi.waitFor(() => {
      expect(stubs.fit).toHaveBeenCalledWith(
        expect.objectContaining({ marker: "hydrated" }),
        expect.objectContaining({ text: "Englebart" }),
        new Set(["latin-internal-edit-v2"]),
      );
      expect(stubs.coordinator.observe).toHaveBeenCalledWith(
        [fittingEvent],
        {
          term: { disposition: "quiet", opportunity: ENGLISH_OPPORTUNITY },
          alias: { disposition: "observed", opportunity: ENGLISH_OPPORTUNITY },
        },
        { generation: 0, stateRevision: 0 },
      );
    });
  });

  it("rechecks permissions after hydration before admitting a queued turn", async () => {
    let resolveStart: ((status: {
      phase: "ready";
      generation: number;
      stateRevision: number;
    }) => void) | undefined;
    stubs.coordinator.start.mockReturnValue(new Promise((resolve) => {
      resolveStart = resolve;
    }));
    const runtime = await import("./wiki-runtime-core");

    runtime.observeMatterWikiCommittedMaterial({
      observed: { locale: "en-US", channel: "spoken", text: "Englebart" },
      committed: { locale: "en-US", channel: "spoken", text: "Englebart" },
    });
    await Promise.resolve();
    stubs.automaticCollection = false;
    stubs.phoneticFitting = false;
    resolveStart?.({ phase: "ready", generation: 3, stateRevision: 2 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(stubs.collect).not.toHaveBeenCalled();
    expect(stubs.fit).not.toHaveBeenCalled();
    expect(stubs.coordinator.observe).not.toHaveBeenCalled();
  });

  it("re-derives evidence from the latest basis after a compare-and-swap conflict", async () => {
    const termEvent = Object.freeze({
      type: "observe-evidence" as const,
      source: "recent-material" as const,
      locale: "en-US" as const,
      canonical: "Englebart",
      producer: "locale-segment-v1" as const,
    });
    const fittingEvent = Object.freeze({
      type: "observe-evidence" as const,
      source: "machine-inference" as const,
      locale: "en-US" as const,
      channel: "spoken" as const,
      boundary: "word" as const,
      form: "Englebart",
      canonical: "Engelbart",
      producer: "latin-internal-edit-v2" as const,
    });
    stubs.collect.mockReturnValue({
      status: "ok",
      events: Object.freeze([termEvent]),
      scannedScripts: Object.freeze(["latin" as const]),
    });
    stubs.fit
      .mockReturnValueOnce({
        status: "ok",
        events: Object.freeze([fittingEvent]),
        scannedScripts: Object.freeze(["latin" as const]),
      })
      .mockReturnValueOnce({
        status: "ok",
        events: Object.freeze([]),
        scannedScripts: Object.freeze(["latin" as const]),
      });
    stubs.coordinator.start.mockResolvedValue({
      phase: "ready",
      generation: 3,
      stateRevision: 2,
    });
    stubs.coordinator.observe
      .mockImplementationOnce(async () => {
        stubs.coordinator.readBasis.mockReturnValue({
          stateRevision: 3,
          fitSnapshot: { marker: "rebased" },
          snapshot: { generation: 4 },
        });
        return { ok: false as const, code: "STALE_VIEW" as const };
      })
      .mockResolvedValueOnce({
        ok: true,
        changed: true,
        generation: 5,
        stateRevision: 4,
      });
    const runtime = await import("./wiki-runtime-core");

    runtime.observeMatterWikiCommittedMaterial({
      observed: { locale: "en-US", channel: "spoken", text: "Englebart" },
      committed: { locale: "en-US", channel: "spoken", text: "Englebart" },
    });

    await vi.waitFor(() => expect(stubs.coordinator.observe).toHaveBeenCalledTimes(2));
    expect(stubs.fit.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      expect.objectContaining({ marker: "hydrated" }),
      expect.objectContaining({ marker: "rebased" }),
    ]);
    expect(stubs.coordinator.observe.mock.calls.map(([events]) => events)).toEqual([
      [fittingEvent],
      [termEvent],
    ]);
    expect(stubs.coordinator.observe.mock.calls.map((call) => call[2])).toEqual([
      { generation: 0, stateRevision: 0 },
      { generation: 4, stateRevision: 3 },
    ]);
  });

  it("bounds waiting admissions and drops the oldest while hydration is blocked", async () => {
    let resolveStart: ((status: {
      phase: "ready";
      generation: number;
      stateRevision: number;
    }) => void) | undefined;
    stubs.coordinator.start.mockReturnValue(new Promise((resolve) => {
      resolveStart = resolve;
    }));
    stubs.coordinator.observe.mockResolvedValue({
      ok: true,
      changed: false,
      generation: 3,
      stateRevision: 2,
    });
    const runtime = await import("./wiki-runtime-core");

    for (let turn = 0; turn < 40; turn += 1) {
      runtime.observeMatterWikiCommittedMaterial({
        observed: { locale: "en-US", channel: "spoken", text: `turn ${turn}` },
        committed: { locale: "en-US", channel: "spoken", text: `turn ${turn}` },
      });
    }
    await Promise.resolve();
    // One turn is in progress (awaiting hydration); sixteen wait behind it.
    expect(runtime.readMatterWikiAdmissionReceipt()).toMatchObject({
      waitingTurns: 16,
      droppedTurns: 23,
      completedTurns: 0,
    });
    expect(JSON.stringify(runtime.readMatterWikiAdmissionReceipt())).not.toContain("turn");

    resolveStart?.({ phase: "ready", generation: 3, stateRevision: 2 });
    await vi.waitFor(() => expect(runtime.readMatterWikiAdmissionReceipt())
      .toMatchObject({ waitingTurns: 0, completedTurns: 17 }));
    expect(stubs.collect.mock.calls.map(([request]) =>
      (request as { text: string }).text)).toEqual([
      "turn 0",
      ...Array.from({ length: 16 }, (_, index) => `turn ${index + 24}`),
    ]);
  });

  it("honours a permission change before retrying a conflicted admission", async () => {
    stubs.coordinator.start.mockResolvedValue({
      phase: "ready",
      generation: 3,
      stateRevision: 2,
    });
    stubs.coordinator.observe.mockImplementationOnce(async () => {
      stubs.automaticCollection = false;
      stubs.phoneticFitting = false;
      return { ok: false as const, code: "STALE_VIEW" as const };
    });
    const runtime = await import("./wiki-runtime-core");

    runtime.observeMatterWikiCommittedMaterial({
      observed: { locale: "en-US", channel: "spoken", text: "Englebart" },
      committed: { locale: "en-US", channel: "spoken", text: "Englebart" },
    });

    await vi.waitFor(() => expect(stubs.coordinator.observe).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(stubs.fit).toHaveBeenCalledOnce();
    expect(stubs.collect).toHaveBeenCalledOnce();
    expect(stubs.coordinator.observe).toHaveBeenCalledOnce();
  });
});
