import { describe, expect, it, vi } from "vitest";
import type { WikiRepository } from "./wiki-repository";
import { createWikiCoordinator } from "./wiki-coordinator";
import {
  applyWikiEvent,
  createEmptyWikiState,
  WIKI_WITH_PROVISIONAL,
} from "../wiki/wiki-evidence";
import { WikiBasisOwner } from "../wiki/wiki-basis-owner";
import type { WikiState } from "../wiki/wiki-model";

const DECISION = Object.freeze({
  type: "confirm-rule" as const,
  locale: "en-US" as const,
  channel: "spoken" as const,
  boundary: "word" as const,
  form: "code x",
  canonical: "Codex",
});

const OBSERVATION = Object.freeze({
  type: "observe-evidence" as const,
  locale: "en-US" as const,
  channel: "spoken" as const,
  boundary: "word" as const,
  form: "Englebart",
  canonical: "Engelbart",
  source: "machine-inference" as const,
});

describe("Wiki coordinator", () => {
  it("serves an empty basis while hydration completes", async () => {
    let resolveLoad!: (value: Awaited<ReturnType<WikiRepository["load"]>>) => void;
    const repository = fakeRepository();
    repository.load.mockReturnValue(new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const coordinator = createWikiCoordinator(repository);

    const started = coordinator.start();
    expect(coordinator.readBasis()).toEqual(expect.objectContaining({
      stateRevision: 0,
      snapshot: expect.objectContaining({ generation: 0, rules: [] }),
    }));
    resolveLoad({ ok: true, value: null });
    await expect(started).resolves.toMatchObject({ phase: "ready", generation: 0 });
    expect(coordinator.readBasis().snapshot.rules).toEqual([]);
  });

  it("keeps material on an empty basis when initial storage is unavailable", async () => {
    const repository = fakeRepository();
    repository.load.mockResolvedValue({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE", message: "unavailable" },
    });
    const coordinator = createWikiCoordinator(repository);

    await expect(coordinator.start()).resolves.toMatchObject({
      phase: "degraded",
      reason: "storage",
    });
    expect(coordinator.readBasis().snapshot.rules).toEqual([]);
  });

  it("publishes only after the durable CAS completes", async () => {
    let resolveSave!: (value: Awaited<ReturnType<WikiRepository["save"]>>) => void;
    const repository = fakeRepository();
    repository.save.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const owner = new WikiBasisOwner();
    const coordinator = createWikiCoordinator(repository, owner);
    await coordinator.start();

    const deciding = coordinator.decide(DECISION);
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
    expect(owner.read().snapshot.rules).toEqual([]);
    resolveSave({ ok: true, value: 1 });
    await expect(deciding).resolves.toMatchObject({ ok: true, changed: true });
    expect(owner.read().snapshot.rules).toEqual([
      expect.objectContaining({ form: "code x", canonical: "Codex" }),
    ]);
  });

  it("keeps the previous basis when persistence fails", async () => {
    const durable = applyWikiEvent(createEmptyWikiState(), DECISION);
    if (!durable.ok) throw new Error(durable.error.message);
    const repository = fakeRepository();
    repository.load.mockResolvedValue({
      ok: true,
      value: { state: durable.state, writeGeneration: 4 },
    });
    repository.save.mockResolvedValue({
      ok: false,
      error: { code: "PERSISTENCE_STORAGE_FULL", message: "full" },
    });
    const owner = new WikiBasisOwner();
    const coordinator = createWikiCoordinator(repository, owner);
    await coordinator.start();

    await expect(coordinator.decide({
      ...DECISION,
      form: "open eye",
      canonical: "OpenAI",
    })).resolves.toEqual({
      ok: false,
      code: "PERSISTENCE_FAILED",
    });
    expect(owner.read().snapshot.rules).toEqual([
      expect.objectContaining({ form: "code x", canonical: "Codex" }),
    ]);
    expect(coordinator.readBasis().snapshot.rules).toEqual(owner.read().snapshot.rules);
    expect(coordinator.getStatus()).toMatchObject({
      phase: "degraded",
      reason: "storage",
    });
  });

  it("loads a durable generation and supports clear-all as a new lineage", async () => {
    const durable = applyWikiEvent(createEmptyWikiState(), DECISION);
    if (!durable.ok) throw new Error(durable.error.message);
    const repository = fakeRepository();
    repository.load.mockResolvedValue({
      ok: true,
      value: { state: durable.state, writeGeneration: 4 },
    });
    repository.save.mockResolvedValue({ ok: true, value: 5 });
    const coordinator = createWikiCoordinator(repository);

    await coordinator.start();
    expect(coordinator.readBasis().snapshot.rules).toHaveLength(1);
    await expect(coordinator.clear()).resolves.toMatchObject({
      ok: true,
      changed: true,
      generation: 5,
      stateRevision: 2,
    });
    expect(coordinator.readBasis().snapshot.rules).toEqual([]);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2, authorities: [] }),
      4,
    );
  });

  it("persists a removed canonical through the strict codec boundary", async () => {
    const repository = fakeRepository();
    repository.save
      .mockResolvedValueOnce({ ok: true, value: 1 })
      .mockResolvedValueOnce({ ok: true, value: 2 });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    await expect(coordinator.decide({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    })).resolves.toMatchObject({ ok: true, changed: true });
    const lexeme = coordinator.readState()?.lexemes[0];
    if (lexeme === undefined) throw new Error("Expected a created lexeme.");

    await expect(coordinator.decide({
      type: "remove-lexeme",
      lexemeId: lexeme.id,
    })).resolves.toMatchObject({
      ok: true,
      changed: true,
      generation: 2,
    });
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(coordinator.readState()?.lexemeTombstones).toEqual([
      expect.objectContaining({ canonical: "Engelbart" }),
    ]);
  });

  it("serializes concurrent decisions against the latest local generation", async () => {
    const repository = fakeRepository();
    repository.save
      .mockResolvedValueOnce({ ok: true, value: 1 })
      .mockResolvedValueOnce({ ok: true, value: 2 });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    const second = { ...DECISION, form: "open eye", canonical: "OpenAI" };
    await Promise.all([coordinator.decide(DECISION), coordinator.decide(second)]);

    expect(repository.save.mock.calls.map((call) => call[1])).toEqual([null, 1]);
    expect(coordinator.getStatus()).toMatchObject({ phase: "ready", generation: 2 });
    expect(coordinator.readBasis().snapshot.rules).toHaveLength(2);
  });

  it("persists one deduplicated observation batch with one CAS", async () => {
    const repository = fakeRepository();
    repository.save
      .mockResolvedValueOnce({ ok: true, value: 1 })
      .mockResolvedValueOnce({ ok: true, value: 2 });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();
    await coordinator.decide({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });

    await expect(coordinator.observe([
      OBSERVATION,
      OBSERVATION,
    ])).resolves.toMatchObject({
      ok: true,
      changed: true,
      generation: 2,
      stateRevision: 2,
    });
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(coordinator.readState()?.aliasEvidence).toEqual([
      expect.objectContaining({
        form: "Englebart",
        producer: "legacy-v1",
        support: 1,
      }),
    ]);
  });

  it("rolls back the whole observation batch when one event is invalid", async () => {
    const repository = fakeRepository();
    repository.save.mockResolvedValueOnce({ ok: true, value: 1 });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();
    await coordinator.decide({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    const before = coordinator.readState();

    await expect(coordinator.observe([
      OBSERVATION,
      { ...OBSERVATION, form: "Engelbart" },
    ])).resolves.toEqual({ ok: false, code: "INVALID_DECISION" });
    expect(coordinator.readState()).toBe(before);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("keeps repeated legacy alias evidence non-authoritative", async () => {
    const repository = fakeRepository();
    repository.save
      .mockResolvedValueOnce({ ok: true, value: 1 })
      .mockResolvedValueOnce({ ok: true, value: 2 })
      .mockResolvedValueOnce({ ok: true, value: 3 })
      .mockResolvedValueOnce({ ok: true, value: 4 })
      .mockResolvedValueOnce({ ok: true, value: 5 });
    const coordinator = createWikiCoordinator(
      repository,
      new WikiBasisOwner(),
      WIKI_WITH_PROVISIONAL,
    );
    await coordinator.start();
    await coordinator.decide({
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });

    for (let index = 0; index < 3; index += 1) {
      await coordinator.observe([OBSERVATION]);
      expect(coordinator.readBasis().snapshot.rules).toEqual([]);
    }
    await coordinator.observe([OBSERVATION]);
    expect(coordinator.readBasis().snapshot.rules).toEqual([]);
    expect(coordinator.readState()?.aliasEvidence[0]).toMatchObject({
      producer: "legacy-v1", support: 4, phase: "candidate",
    });
  });

  it("does not consume a persisted provisional rule while automatic fitting is off", async () => {
    let state = createEmptyWikiState();
    const created = applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);
    state = created.state;
    for (let index = 0; index < 4; index += 1) {
      const observed = applyWikiEvent(state, OBSERVATION);
      if (!observed.ok) throw new Error(observed.error.message);
      state = observed.state;
    }
    const stableRepository = fakeRepository();
    stableRepository.load.mockResolvedValue({
      ok: true,
      value: { state, writeGeneration: 5 },
    });
    const experimentalRepository = fakeRepository();
    experimentalRepository.load.mockResolvedValue({
      ok: true,
      value: { state, writeGeneration: 5 },
    });

    const stable = createWikiCoordinator(stableRepository);
    const experimental = createWikiCoordinator(
      experimentalRepository,
      new WikiBasisOwner(),
      WIKI_WITH_PROVISIONAL,
    );
    await Promise.all([stable.start(), experimental.start()]);

    expect(stable.readBasis().snapshot.rules).toEqual([]);
    expect(experimental.readBasis().snapshot.rules).toEqual([]);
  });

  it("allows an explicit retry after a temporary persistence failure", async () => {
    const repository = fakeRepository();
    repository.save
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "PERSISTENCE_WRITE_FAILED", message: "temporary" },
      })
      .mockResolvedValueOnce({ ok: true, value: 1 });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    await expect(coordinator.decide(DECISION)).resolves.toEqual({
      ok: false,
      code: "PERSISTENCE_FAILED",
    });
    expect(coordinator.getStatus()).toMatchObject({ phase: "degraded" });
    await expect(coordinator.decide(DECISION)).resolves.toMatchObject({
      ok: true,
      changed: true,
      generation: 1,
    });
    expect(coordinator.getStatus()).toMatchObject({ phase: "ready", generation: 1 });
  });

  it("refreshes the last-good basis after a compare-and-swap conflict", async () => {
    const external = applyWikiEvent(createEmptyWikiState(), {
      ...DECISION,
      form: "open eye",
      canonical: "OpenAI",
    });
    if (!external.ok) throw new Error(external.error.message);
    const repository = fakeRepository();
    repository.save.mockResolvedValue({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT", message: "newer tab" },
    });
    repository.load
      .mockResolvedValueOnce({ ok: true, value: null })
      .mockResolvedValueOnce({
        ok: true,
        value: { state: external.state, writeGeneration: 1 },
      });
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    await expect(coordinator.decide(DECISION)).resolves.toEqual({
      ok: false,
      code: "STALE_VIEW",
    });
    expect(coordinator.getStatus()).toMatchObject({ phase: "ready", generation: 1 });
    expect(coordinator.readBasis().snapshot.rules).toEqual([
      expect.objectContaining({ form: "open eye", canonical: "OpenAI" }),
    ]);
  });

  it("rebases simultaneous observations from different tabs without losing evidence", async () => {
    const shared = sharedRepositoryPair(createdLexemeState());
    const first = createWikiCoordinator(shared.first);
    const second = createWikiCoordinator(shared.second);
    await Promise.all([first.start(), second.start()]);

    const results = await Promise.all([
      first.observe([OBSERVATION]),
      second.observe([{ ...OBSERVATION, form: "Engelbartt" }]),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ ok: true, changed: true }),
      expect.objectContaining({ ok: true, changed: true }),
    ]);
    const latest = await shared.first.load();
    expect(latest.ok).toBe(true);
    if (!latest.ok || latest.value === null) return;
    expect(latest.value.writeGeneration).toBe(3);
    expect(latest.value.state.aliasEvidence.map((entry) => entry.form))
      .toEqual(["Engelbartt", "Englebart"]);
  });

  it("rebases the same simultaneous observation into a count of two", async () => {
    const shared = sharedRepositoryPair(createdLexemeState());
    const first = createWikiCoordinator(shared.first);
    const second = createWikiCoordinator(shared.second);
    await Promise.all([first.start(), second.start()]);

    await Promise.all([
      first.observe([OBSERVATION]),
      second.observe([OBSERVATION]),
    ]);

    const latest = await shared.first.load();
    expect(latest.ok).toBe(true);
    if (!latest.ok || latest.value === null) return;
    expect(latest.value.state.aliasEvidence).toEqual([
      expect.objectContaining({
        form: "Englebart",
        producer: "legacy-v1",
        support: 2,
      }),
    ]);
  });

  it("rejects a stale configuration view before applying its decision", async () => {
    const repository = fakeRepository();
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    await expect(coordinator.decide(DECISION, 1)).resolves.toEqual({
      ok: false,
      code: "STALE_VIEW",
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("isolates observers and never publishes after disposal during a save", async () => {
    let resolveSave!: (value: Awaited<ReturnType<WikiRepository["save"]>>) => void;
    const repository = fakeRepository();
    repository.save.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const owner = new WikiBasisOwner();
    const coordinator = createWikiCoordinator(repository, owner);
    coordinator.subscribe(() => {
      throw new Error("presentation failed");
    });
    await expect(coordinator.start()).resolves.toMatchObject({ phase: "ready" });

    const deciding = coordinator.decide(DECISION);
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
    coordinator.dispose();
    resolveSave({ ok: true, value: 1 });

    await expect(deciding).resolves.toEqual({ ok: false, code: "NOT_READY" });
    expect(owner.read().snapshot.rules).toEqual([]);
    expect(repository.close).toHaveBeenCalledOnce();
  });

  it("recovers only an explicitly corrupt durable Wiki", async () => {
    const repository = fakeRepository();
    repository.load.mockResolvedValue({
      ok: false,
      error: { code: "PERSISTENCE_CORRUPT", message: "corrupt" },
    });
    repository.resetCorrupt.mockResolvedValue({
      ok: true,
      value: { state: createEmptyWikiState(), writeGeneration: 4 },
    });
    const coordinator = createWikiCoordinator(repository);

    await expect(coordinator.start()).resolves.toMatchObject({
      phase: "degraded",
      reason: "corrupt",
    });
    await expect(coordinator.resetCorrupt()).resolves.toEqual({
      ok: true,
      changed: true,
      generation: 4,
      stateRevision: 0,
    });
    expect(repository.resetCorrupt).toHaveBeenCalledWith(0);
    expect(coordinator.getStatus()).toMatchObject({ phase: "ready", generation: 4 });
  });

  it("does not expose corrupt reset as a general clear shortcut", async () => {
    const repository = fakeRepository();
    const coordinator = createWikiCoordinator(repository);
    await coordinator.start();

    await expect(coordinator.resetCorrupt()).resolves.toEqual({
      ok: false,
      code: "NOT_READY",
    });
    expect(repository.resetCorrupt).not.toHaveBeenCalled();
  });
});

function fakeRepository(): WikiRepository & {
  load: ReturnType<typeof vi.fn<WikiRepository["load"]>>;
  save: ReturnType<typeof vi.fn<WikiRepository["save"]>>;
  resetCorrupt: ReturnType<typeof vi.fn<WikiRepository["resetCorrupt"]>>;
  close: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    load: vi.fn<WikiRepository["load"]>().mockResolvedValue({ ok: true, value: null }),
    save: vi.fn<WikiRepository["save"]>().mockResolvedValue({ ok: true, value: 1 }),
    resetCorrupt: vi.fn<WikiRepository["resetCorrupt"]>().mockResolvedValue({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT", message: "not corrupt" },
    }),
    close: vi.fn<() => void>(),
  };
}

function sharedRepositoryPair(initialState?: WikiState): Readonly<{
  first: WikiRepository;
  second: WikiRepository;
}> {
  let durable: Awaited<ReturnType<WikiRepository["load"]>> = {
    ok: true,
    value: initialState === undefined
      ? null
      : { state: initialState, writeGeneration: 1 },
  };
  let firstRoundArrivals = 0;
  let releaseFirstRound!: () => void;
  const firstRound = new Promise<void>((resolve) => {
    releaseFirstRound = resolve;
  });
  const create = (): WikiRepository => ({
    async load() {
      return durable;
    },
    async save(state, expectedGeneration) {
      firstRoundArrivals += 1;
      if (firstRoundArrivals <= 2) {
        if (firstRoundArrivals === 2) releaseFirstRound();
        await firstRound;
      }
      const currentGeneration = durable.ok && durable.value !== null
        ? durable.value.writeGeneration
        : null;
      if (currentGeneration !== expectedGeneration) {
        return {
          ok: false as const,
          error: {
            code: "PERSISTENCE_CONFLICT" as const,
            message: "newer tab",
          },
        };
      }
      const writeGeneration = (currentGeneration ?? 0) + 1;
      durable = {
        ok: true,
        value: { state, writeGeneration },
      };
      return { ok: true as const, value: writeGeneration };
    },
    async resetCorrupt() {
      return {
        ok: false as const,
        error: {
          code: "PERSISTENCE_CONFLICT" as const,
          message: "not corrupt",
        },
      };
    },
    close() {},
  });
  return Object.freeze({ first: create(), second: create() });
}

function createdLexemeState(): WikiState {
  const result = applyWikiEvent(createEmptyWikiState(), {
    type: "create-lexeme",
    locale: "en-US",
    canonical: "Engelbart",
    scope: "both",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
