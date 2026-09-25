import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createInitialWikiState,
  projectApplicableWikiRules,
} from "../wiki/wiki-evidence";
import { MAX_WIKI_LEXEMES } from "../wiki/wiki-model";
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
      state: createInitialWikiState(),
    }));
  });

  it("saves a validated state at one compare-and-swap generation", async () => {
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
    const state = createEmptyWikiState();

    await expect(repository.save(state, null)).resolves.toEqual({ ok: true, value: 1 });
    expect(put).toHaveBeenCalledWith({
      storageSchemaVersion: 1,
      recordSchemaVersion: 4,
      key: "origin",
      writeGeneration: 1,
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
      ...JSON.parse(JSON.stringify(state)),
      schemaVersion: 3,
      lexemes: state.lexemes.map((lexeme) => ({
        id: lexeme.id,
        locale: lexeme.locale,
        canonical: lexeme.canonical,
        provenance: lexeme.provenance,
        confirmedAtRevision: lexeme.confirmedAtRevision,
      })),
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
      value: { writeGeneration: 8, state: { schemaVersion: 4 } },
    });
    if (!migrated.ok || migrated.value === null) return;
    expect(migrated.value.state.lexemes[0].scope).toBe("both");
    const relations = JSON.stringify({
      authorities: migrated.value.state.authorities,
      evidence: migrated.value.state.evidence,
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
      evidence: reloadedSpoken.value.state.evidence,
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
      evidence: reloadedBoth.value.state.evidence,
      aliasTombstones: reloadedBoth.value.state.aliasTombstones,
    })).toBe(relations);
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
          state: removed.state,
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
      value: { state: removed.state, writeGeneration: 4 },
    });
    expect(put).not.toHaveBeenCalled();
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
        provenance: "aggregate-evidence" as const,
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
          state,
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
          state,
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
          state,
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
      recordSchemaVersion: 4,
      writeGeneration: 13,
      state,
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
        provenance: "aggregate-evidence" as const,
        confirmedAtRevision: null,
      }],
    };
    let stored: unknown = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 3,
      key: "origin",
      writeGeneration: 7,
      state: duplicate,
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
          state: createEmptyWikiState(),
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
          state: durable.state,
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
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockRejectedValue(new DOMException("full", "QuotaExceededError")),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn().mockReturnValue(transaction),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.save(createEmptyWikiState(), null)).resolves.toMatchObject({
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
          state: createEmptyWikiState(),
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
