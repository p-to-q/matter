import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  applyWikiEvent,
  createEmptyWikiState,
  projectApplicableWikiRules,
} from "../wiki/wiki-evidence";
import { createIndexedDbWikiRepository } from "./wiki-repository";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("IndexedDB Wiki repository", () => {
  beforeEach(() => vi.mocked(openDB).mockReset());

  it("loads no Wiki without manufacturing durable authority", async () => {
    vi.mocked(openDB).mockResolvedValue({
      get: vi.fn().mockResolvedValue(undefined),
    } as never);
    const repository = createIndexedDbWikiRepository();

    await expect(repository.load()).resolves.toEqual({ ok: true, value: null });
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
      recordSchemaVersion: 2,
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
      value: { writeGeneration: 7, state: { schemaVersion: 4 } },
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
    await expect(repository.save(spoken.state, 7)).resolves.toEqual({ ok: true, value: 8 });
    const reloadedSpoken = await repository.load();
    if (!reloadedSpoken.ok || reloadedSpoken.value === null) {
      throw new Error("Expected the spoken-only Wiki to reload.");
    }
    expect(projectApplicableWikiRules(reloadedSpoken.value.state).map((rule) => rule.channel))
      .toEqual(["spoken"]);
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
    await expect(repository.save(both.state, 8)).resolves.toEqual({ ok: true, value: 9 });
    const reloadedBoth = await repository.load();
    if (!reloadedBoth.ok || reloadedBoth.value === null) {
      throw new Error("Expected the restored Wiki to reload.");
    }
    expect(projectApplicableWikiRules(reloadedBoth.value.state).map((rule) => rule.channel).sort())
      .toEqual(["spoken", "written"]);
    expect(JSON.stringify({
      authorities: reloadedBoth.value.state.authorities,
      evidence: reloadedBoth.value.state.evidence,
      aliasTombstones: reloadedBoth.value.state.aliasTombstones,
    })).toBe(relations);
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
      value: { state: createEmptyWikiState(), writeGeneration: 7 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      writeGeneration: 7,
      state: createEmptyWikiState(),
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
