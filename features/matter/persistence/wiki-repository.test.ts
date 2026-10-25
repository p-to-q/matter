import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createInitialWikiState,
  projectApplicableWikiRules,
} from "../wiki/wiki-evidence";
import { MAX_WIKI_LEXEMES, type WikiState } from "../wiki/wiki-model";
import { encodeWikiStateAsV7 } from "../wiki/wiki-codec";
import { createIndexedDbWikiRepository } from "./wiki-repository";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("IndexedDB Wiki repository", () => {
  beforeEach(() => vi.mocked(openDB).mockReset());

  it("atomically provisions the four starter spellings on first load", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: { get: vi.fn().mockResolvedValue(undefined), put },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: { state: createInitialWikiState(), writeGeneration: 1 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      writeGeneration: 1,
      recordSchemaVersion: 7,
      state: v7Fixture(createInitialWikiState()),
    }));
  });

  it("saves a validated state at one compare-and-swap generation", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: { get: vi.fn().mockResolvedValue({ storageSchemaVersion: 1, recordSchemaVersion: 7,
        key: "origin", writeGeneration: 1, state: v7Fixture(createEmptyWikiState()) }), put },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();
    const changed = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme", locale: "en-US", canonical: "Matter", scope: "both",
    });
    if (!changed.ok) throw new Error(changed.error.message);
    const state = changed.state;

    await expect(repository.save(state, 1)).resolves.toEqual({ ok: true, value: 2 });
    expect(put).toHaveBeenCalledWith({
      storageSchemaVersion: 1,
      recordSchemaVersion: 8,
      key: "origin",
      writeGeneration: 2,
      state,
    });
  });

  it("migrates a V3 row and preserves aliases through reversible scope writes", async () => {
    let state = createEmptyWikiState();
    for (const decision of [
      {
        type: "confirm-rule" as const,
        locale: "en-US" as const,
        channel: "spoken" as const,
        boundary: "word" as const,
        form: "Englebart",
        canonical: "Engelbart",
      },
      {
        type: "confirm-rule" as const,
        locale: "en-US" as const,
        channel: "written" as const,
        boundary: "word" as const,
        form: "Engel-bart",
        canonical: "Engelbart",
      },
    ]) {
      const decided = applyWikiEvent(state, decision);
      if (!decided.ok) throw new Error(decided.error.message);
      state = decided.state;
    }
    const legacyState = {
      schemaVersion: 3,
      scoringVersion: 2,
      fittingVersion: 1,
      revision: state.revision,
      nextLexemeId: state.nextLexemeId,
      recentObservationCount: 0,
      automaticLearningSaturated: false,
      lexemes: state.lexemes.map((lexeme) => ({
        id: lexeme.id,
        locale: lexeme.locale,
        canonical: lexeme.canonical,
        provenance: "human-confirmed",
        confirmedAtRevision: lexeme.confirmedAtRevision,
      })),
      evidence: [],
      authorities: state.authorities,
      aliasTombstones: state.aliasTombstones,
      lexemeTombstones: state.lexemeTombstones,
    };
    let stored: unknown = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 2,
      key: "origin",
      writeGeneration: 7,
      state: legacyState,
    };
    const put = vi.fn(async (value: unknown) => {
      stored = value;
    });
    vi.mocked(openDB).mockResolvedValue({
      get: vi.fn(async () => stored),
      transaction: vi.fn(() => ({
        store: { get: vi.fn(async () => stored), put },
        abort: vi.fn(),
        done: Promise.resolve(),
      })),
    } as never);
    const repository = createIndexedDbWikiRepository();

    const migrated = await repository.load();
    expect(migrated).toMatchObject({
      ok: true,
      value: { writeGeneration: 8, state: { schemaVersion: 8 } },
    });
    if (!migrated.ok || migrated.value === null) return;
    expect(migrated.value.state.lexemes[0].scope).toBe("both");
    const relations = JSON.stringify({
      authorities: migrated.value.state.authorities,
      termEvidence: migrated.value.state.termEvidence,
      aliasEvidence: migrated.value.state.aliasEvidence,
      aliasTombstones: migrated.value.state.aliasTombstones,
    });

    const spoken = applyWikiEvent(migrated.value.state, {
      type: "rename-lexeme",
      lexemeId: migrated.value.state.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "spoken",
    });
    if (!spoken.ok) throw new Error(spoken.error.message);
    await expect(repository.save(spoken.state, 8)).resolves.toEqual({ ok: true, value: 9 });
    const reloadedSpoken = await repository.load();
    if (!reloadedSpoken.ok || reloadedSpoken.value === null) {
      throw new Error("Expected the spoken-only Wiki to reload.");
    }
    expect(projectApplicableWikiRules(reloadedSpoken.value.state)
      .filter((rule) => rule.form === "Englebart" || rule.form === "Engel-bart")
      .map((rule) => rule.channel)).toEqual(["spoken"]);
    expect(JSON.stringify({
      authorities: reloadedSpoken.value.state.authorities,
      termEvidence: reloadedSpoken.value.state.termEvidence,
      aliasEvidence: reloadedSpoken.value.state.aliasEvidence,
      aliasTombstones: reloadedSpoken.value.state.aliasTombstones,
    })).toBe(relations);

    const both = applyWikiEvent(reloadedSpoken.value.state, {
      type: "rename-lexeme",
      lexemeId: reloadedSpoken.value.state.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!both.ok) throw new Error(both.error.message);
    await expect(repository.save(both.state, 9)).resolves.toEqual({ ok: true, value: 10 });
    const reloadedBoth = await repository.load();
    if (!reloadedBoth.ok || reloadedBoth.value === null) {
      throw new Error("Expected the restored Wiki to reload.");
    }
    expect(projectApplicableWikiRules(reloadedBoth.value.state)
      .filter((rule) => rule.form === "Englebart" || rule.form === "Engel-bart")
      .map((rule) => rule.channel).sort()).toEqual(["spoken", "written"]);
    expect(JSON.stringify({
      authorities: reloadedBoth.value.state.authorities,
      termEvidence: reloadedBoth.value.state.termEvidence,
      aliasEvidence: reloadedBoth.value.state.aliasEvidence,
      aliasTombstones: reloadedBoth.value.state.aliasTombstones,
    })).toBe(relations);
  });

  it("durably rewrites a valid V5 split ledger as one current record", async () => {
    let stored: unknown = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 5,
      key: "origin",
      writeGeneration: 7,
      state: {
        schemaVersion: 5,
        scoringVersion: 3,
        fittingVersion: 1,
        revision: 1,
        nextLexemeId: 2,
        automaticLearningSaturated: false,
        lexemes: [{
          id: 1,
          locale: "en-US",
          canonical: "Lexicorium",
          scope: "both",
          provenance: "aggregate-evidence",
          confirmedAtRevision: null,
        }],
        termEvidence: [{
          locale: "en-US",
          canonical: "Lexicorium",
          phase: "candidate",
          support: 1,
          quietTurns: 0,
        }],
        aliasEvidence: [],
        authorities: [],
        aliasTombstones: [],
        lexemeTombstones: [],
      },
    };
    const put = vi.fn(async (value: unknown) => {
      stored = value;
    });
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn(() => ({
        store: { get: vi.fn(async () => stored), put },
        abort: vi.fn(),
        done: Promise.resolve(),
      })),
    } as never);
    const repository = createIndexedDbWikiRepository();

    const migrated = await repository.load();
    expect(migrated).toMatchObject({
      ok: true,
      value: {
        writeGeneration: 8,
        state: {
          schemaVersion: 8,
          termEvidence: [{ producer: "legacy-term-v1", support: 4 }],
        },
      },
    });
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      recordSchemaVersion: 7,
      writeGeneration: 8,
      state: expect.objectContaining({ schemaVersion: 7, revertStrikes: [] }),
    }));

    await expect(repository.load()).resolves.toEqual(migrated);
    expect(put).toHaveBeenCalledOnce();
  });

  it("rewrites a V6 record once as one record-V7 quarter-unit state", async () => {
    let stored: unknown = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 6,
      key: "origin",
      writeGeneration: 3,
      state: {
        schemaVersion: 6,
        scoringVersion: 3,
        fittingVersion: 1,
        revision: 2,
        nextLexemeId: 2,
        automaticLearningSaturated: false,
        lexemes: [{
          id: 1,
          locale: "en-US",
          canonical: "Engelbart",
          scope: "both",
          provenance: "human-confirmed",
          confirmedAtRevision: 1,
        }],
        termEvidence: [],
        aliasEvidence: [{
          lexemeId: 1,
          channel: "spoken",
          boundary: "word",
          form: "Englebart",
          producer: "latin-internal-edit-v2",
          phase: "active",
          support: 4,
          quietTurns: 2,
        }],
        authorities: [],
        aliasTombstones: [],
        lexemeTombstones: [],
      },
    };
    const put = vi.fn(async (value: unknown) => {
      stored = value;
    });
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn(() => ({
        store: { get: vi.fn(async () => stored), put },
        abort: vi.fn(),
        done: Promise.resolve(),
      })),
    } as never);
    const repository = createIndexedDbWikiRepository();

    const loaded = await repository.load();
    expect(loaded).toMatchObject({
      ok: true,
      value: {
        writeGeneration: 4,
        state: {
          schemaVersion: 8,
          scoringVersion: 4,
          aliasEvidence: [{ phase: "active", support: 16, kept: 0, keptQuietTurns: 0 }],
          revertStrikes: [],
          settledOccurrences: [],
        },
      },
    });
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      recordSchemaVersion: 7,
      writeGeneration: 4,
      state: expect.objectContaining({ schemaVersion: 7, scoringVersion: 4 }),
    }));

    await expect(repository.load()).resolves.toEqual(loaded);
    expect(put).toHaveBeenCalledOnce();
  });

  it("treats a row from a newer Matter as unavailable and never resettable", async () => {
    for (const newer of [
      { recordSchemaVersion: 9, state: createInitialWikiState() },
      { recordSchemaVersion: 7, state: { ...createInitialWikiState(), schemaVersion: 8 } },
    ]) {
      const stored = {
        storageSchemaVersion: 1,
        key: "origin",
        writeGeneration: 9,
        ...newer,
      };
      const put = vi.fn();
      const abort = vi.fn();
      vi.mocked(openDB).mockResolvedValue({
        transaction: vi.fn(() => ({
          store: { get: vi.fn(async () => stored), put },
          abort,
          done: Promise.resolve(),
        })),
      } as never);
      const repository = createIndexedDbWikiRepository();

      await expect(repository.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "PERSISTENCE_SUPERSEDED" },
      });
      await expect(repository.save(createInitialWikiState(), 9)).resolves.toMatchObject({
        ok: false,
        error: { code: "PERSISTENCE_SUPERSEDED" },
      });
      await expect(repository.resetCorrupt(0)).resolves.toMatchObject({
        ok: false,
        error: { code: "PERSISTENCE_CONFLICT" },
      });
      expect(put).not.toHaveBeenCalled();
    }
  });


  it("does not replay removed starters after the one-time record migration", async () => {
    const removed = applyWikiEvent(createInitialWikiState(), {
      type: "remove-lexeme",
      lexemeId: 1,
    });
    if (!removed.ok) throw new Error(removed.error.message);
    const put = vi.fn();
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 4,
          key: "origin",
          writeGeneration: 4,
          state: v7Fixture(removed.state),
        }),
        put,
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);

    await expect(createIndexedDbWikiRepository().load()).resolves.toEqual({
      ok: true,
      value: { state: removed.state, writeGeneration: 5 },
    });
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      recordSchemaVersion: 7,
      writeGeneration: 5,
      state: v7Fixture(removed.state),
    }));
  });

  it("loads a valid full Wiki when optional starter migration cannot fit", async () => {
    const base = createEmptyWikiState();
    const state = {
      ...base,
      nextLexemeId: MAX_WIKI_LEXEMES + 1,
      lexemes: Array.from({ length: MAX_WIKI_LEXEMES }, (_, index) => ({
        id: index + 1,
        locale: "en-US" as const,
        canonical: `term ${index}`,
        scope: "both" as const,
        provenance: "collected" as const,
        confirmedAtRevision: null,
      })),
    };
    const put = vi.fn();
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 2,
          key: "origin",
          writeGeneration: 9,
          state: v7Fixture(state),
        }),
        put,
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);

    const loaded = await createIndexedDbWikiRepository().load();
    expect(loaded).toMatchObject({
      ok: true,
      value: { writeGeneration: 9, state: { lexemes: { length: MAX_WIKI_LEXEMES } } },
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("keeps a valid Wiki readable when optional starter migration cannot be saved", async () => {
    const state = createEmptyWikiState();
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 2,
          key: "origin",
          writeGeneration: 5,
          state: v7Fixture(state),
        }),
        put: vi.fn().mockRejectedValue(new DOMException("full", "QuotaExceededError")),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);

    await expect(createIndexedDbWikiRepository().load()).resolves.toEqual({
      ok: true,
      value: { state, writeGeneration: 5 },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it("persists the one-time record marker even when starter state is already complete", async () => {
    const state = createInitialWikiState();
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 2,
          key: "origin",
          writeGeneration: 12,
          state: v7Fixture(state),
        }),
        put,
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);

    await expect(createIndexedDbWikiRepository().load()).resolves.toEqual({
      ok: true,
      value: { state, writeGeneration: 13 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      recordSchemaVersion: 7,
      writeGeneration: 13,
      state: v7Fixture(state),
    }));
  });

  it("migrates a V3 duplicate p-to-q starter once and keeps the V4 row stable", async () => {
    const initial = createInitialWikiState();
    const duplicate = {
      ...initial,
      nextLexemeId: 6,
      lexemes: [...initial.lexemes, {
        id: 5,
        locale: "en-US" as const,
        canonical: "[p → q]",
        scope: "both" as const,
        provenance: "collected" as const,
        confirmedAtRevision: null,
      }],
    };
    let stored: unknown = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 3,
      key: "origin",
      writeGeneration: 7,
      state: v7Fixture(duplicate),
    };
    const put = vi.fn(async (value: unknown) => {
      stored = value;
    });
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn(() => ({
        store: { get: vi.fn(async () => stored), put },
        abort: vi.fn(),
        done: Promise.resolve(),
      })),
    } as never);
    const repository = createIndexedDbWikiRepository();

    const migrated = await repository.load();
    expect(migrated).toMatchObject({
      ok: true,
      value: { writeGeneration: 8 },
    });
    if (!migrated.ok || migrated.value === null) return;
    expect(migrated.value.state.lexemes.filter((entry) => entry.canonical === "[p → q]")).toEqual([
      expect.objectContaining({ id: 4, locale: "zh-CN" }),
    ]);
    expect(put).toHaveBeenCalledTimes(1);

    await expect(repository.load()).resolves.toEqual(migrated);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale writer without replacing the other tab's Wiki", async () => {
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          key: "origin",
          writeGeneration: 3,
          state: v7Fixture(createEmptyWikiState()),
        }),
        put: vi.fn(),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.save(createEmptyWikiState(), 2)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.store.put).not.toHaveBeenCalled();
  });

  it("rejects a state revision rollback even at the current write generation", async () => {
    const durable = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "code x",
      canonical: "Codex",
    });
    if (!durable.ok) throw new Error(durable.error.message);
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          key: "origin",
          writeGeneration: 3,
          state: v7Fixture(durable.state),
        }),
        put: vi.fn(),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.save(createEmptyWikiState(), 3)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.store.put).not.toHaveBeenCalled();
  });

  it("retains a corrupt row instead of overwriting it with an empty Wiki", async () => {
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          key: "origin",
          writeGeneration: 1,
          state: { unsafe: "raw material" },
        }),
        put: vi.fn(),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.save(createEmptyWikiState(), 1)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CORRUPT" },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.store.put).not.toHaveBeenCalled();
  });

  it("distinguishes quota exhaustion from an unavailable write", async () => {
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({ storageSchemaVersion: 1, recordSchemaVersion: 7,
          key: "origin", writeGeneration: 1, state: v7Fixture(createEmptyWikiState()) }),
        put: vi.fn().mockRejectedValue(new DOMException("full", "QuotaExceededError")),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    const changed = applyWikiEvent(createEmptyWikiState(), {
      type: "set-near-sound", locale: "en-US", enabled: false,
    });
    if (!changed.ok) throw new Error(changed.error.message);
    await expect(repository.save(changed.state, 1)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_STORAGE_FULL" },
    });
  });

  it("replaces a still-corrupt row at a monotonic recovery generation", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          key: "origin",
          writeGeneration: 2,
          state: { unsafe: "invalid" },
        }),
        put,
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.resetCorrupt(6)).resolves.toEqual({
      ok: true,
      value: { state: createInitialWikiState(), writeGeneration: 7 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      writeGeneration: 7,
      state: createInitialWikiState(),
    }));
  });

  it("refuses recovery when the durable row has become valid", async () => {
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          key: "origin",
          writeGeneration: 3,
          state: v7Fixture(createEmptyWikiState()),
        }),
        put: vi.fn(),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.resetCorrupt(0)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.store.put).not.toHaveBeenCalled();
  });
});

/** These synthetic rows represent pre-V8 human provenance, not a downgrade API. */
function v7Fixture(state: WikiState) {
  const encoded = encodeWikiStateAsV7({ ...state, lexemes: state.lexemes.map((entry) =>
    entry.provenance === "learned" ? { ...entry, provenance: "manual" as const } : entry) });
  if (!encoded.ok) throw new Error("The legacy fixture contains nonrepresentable V8 facts.");
  return encoded.state;
}
