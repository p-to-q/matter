import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  createIndexedDbLabelRepository,
  MAX_CACHED_MODEL_LABELS,
} from "./label-repository";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("IndexedDB label repository Unicode boundary", () => {
  beforeEach(() => vi.mocked(openDB).mockReset());

  it("accepts astral labels and rejects lone surrogates before opening storage", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    vi.mocked(openDB).mockResolvedValue({ put } as never);
    const repository = createIndexedDbLabelRepository();
    const base = {
      nodeId: "node_1",
      origin: "user" as const,
      basis: null,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };

    await expect(repository.put("tree_1", { ...base, label: "思想🚀生长" }))
      .resolves.toEqual({ ok: true });
    for (const label of ["bad\uD800label", "bad\uDC00label"]) {
      await expect(repository.put("tree_1", { ...base, label }))
        .resolves.toEqual({ ok: false, code: "REJECTED" });
    }
    expect(put).toHaveBeenCalledTimes(1);

    await expect(repository.put("tree_1", {
      ...base,
      label: "valid model label",
      origin: "model",
      basis: "bad\uD800basis",
    })).resolves.toEqual({ ok: false, code: "REJECTED" });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("drops malformed restored labels and model bases whole", async () => {
    const base = {
      storageSchemaVersion: 1,
      key: "tree_1 node_1",
      treeId: "tree_1",
      nodeId: "node_1",
      origin: "model" as const,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const stored = new Map([
      ["tree_1 node_1", { ...base, label: "思想🚀生长", basis: "abcdef1234" }],
      ["tree_1 node_2", {
        ...base,
        key: "tree_1 node_2",
        nodeId: "node_2",
        label: "bad\uD800label",
        basis: "abcdef1234",
      }],
      ["tree_1 node_3", {
        ...base,
        key: "tree_1 node_3",
        nodeId: "node_3",
        label: "valid label",
        basis: "bad\uDC00basis",
      }],
    ]);
    const get = vi.fn((key: string) => Promise.resolve(stored.get(key)));
    vi.mocked(openDB).mockResolvedValue({
      transaction: () => ({ store: { get }, done: Promise.resolve() }),
    } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.loadAll("tree_1", ["node_1", "node_2", "node_3"]))
      .resolves.toEqual([
      expect.objectContaining({ nodeId: "node_1", label: "思想🚀生长" }),
    ]);
  });

  it("loads exact live keys so stale manual rows cannot shadow a live manual name", async () => {
    const live = {
      storageSchemaVersion: 1,
      key: "tree_1 live",
      treeId: "tree_1",
      nodeId: "live",
      label: "仍然活着的名字",
      origin: "user" as const,
      basis: null,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const stored = new Map<string, typeof live>([[live.key, live]]);
    for (let index = 0; index <= MAX_NODES_PER_TREE; index += 1) {
      const nodeId = `stale_${index}`;
      stored.set(`tree_1 ${nodeId}`, { ...live, key: `tree_1 ${nodeId}`, nodeId });
    }
    const get = vi.fn((key: string) => Promise.resolve(stored.get(key)));
    vi.mocked(openDB).mockResolvedValue({
      transaction: () => ({ store: { get }, done: Promise.resolve() }),
    } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.loadAll("tree_1", ["live", "live"]))
      .resolves.toEqual([expect.objectContaining({ nodeId: "live", origin: "user" })]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("tree_1 live");
  });

  it("refuses an over-bound restore before opening storage", async () => {
    const repository = createIndexedDbLabelRepository();
    const nodeIds = Array.from(
      { length: MAX_NODES_PER_TREE + 1 },
      (_, index) => `node_${index}`,
    );

    await expect(repository.loadAll("tree_1", nodeIds)).resolves.toEqual([]);
    expect(openDB).not.toHaveBeenCalled();
  });

  it("bounds raw restore work before deduplication", async () => {
    const repository = createIndexedDbLabelRepository();

    await expect(repository.loadAll(
      "tree_1",
      Array.from({ length: MAX_NODES_PER_TREE + 1 }, () => "node_1"),
    )).resolves.toEqual([]);
    expect(openDB).not.toHaveBeenCalled();
  });

  it("rejects malformed storage owners before opening IndexedDB", async () => {
    const repository = createIndexedDbLabelRepository();
    const record = {
      nodeId: "node_1",
      label: "kept name",
      origin: "user" as const,
      basis: null,
      updatedAt: "2026-09-08T00:00:00.000Z",
    };

    await expect(repository.loadAll("bad tree", ["node_1"])).resolves.toEqual([]);
    await expect(repository.loadAll("tree_1", ["bad node"])).resolves.toEqual([]);
    await expect(repository.put("bad tree", record)).resolves.toEqual({
      ok: false,
      code: "REJECTED",
    });
    await expect(repository.put("tree_1", { ...record, nodeId: "bad node" })).resolves.toEqual({
      ok: false,
      code: "REJECTED",
    });
    await expect(repository.put("tree_1", { ...record, updatedAt: "yesterday" })).resolves.toEqual({
      ok: false,
      code: "REJECTED",
    });
    await expect(repository.put("tree_1", {
      ...record,
      origin: "model",
      basis: "x".repeat(65),
    })).resolves.toEqual({
      ok: false,
      code: "REJECTED",
    });
    await expect(repository.remove("tree_1", ["bad node"])).resolves.toEqual({
      ok: false,
      code: "REJECTED",
    });
    await repository.clear("bad tree");
    expect(openDB).not.toHaveBeenCalled();
  });

  it("evicts only the oldest model rows beyond the global cache bound", async () => {
    const range = Object.freeze({ kind: "model-range" });
    const bound = vi.fn(() => range);
    vi.stubGlobal("IDBKeyRange", { bound });
    const first = {
      delete: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn(),
    };
    const second = {
      delete: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(null),
    };
    first.continue.mockResolvedValue(second);
    const index = {
      count: vi.fn().mockResolvedValue(MAX_CACHED_MODEL_LABELS + 2),
      openCursor: vi.fn().mockResolvedValue(first),
    };
    const done = Promise.resolve();
    const put = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(undefined);
    const transaction = { store: { get, put, index: () => index }, done };
    vi.mocked(openDB).mockResolvedValue({
      transaction: vi.fn(() => transaction),
    } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "model name",
      origin: "model",
      basis: "0123456789abcdef12",
      updatedAt: "2026-09-08T00:00:00.000Z",
    })).resolves.toEqual({ ok: true });

    expect(bound).toHaveBeenCalledWith(["model", ""], ["model", "\uffff"]);
    expect(index.count).toHaveBeenCalledWith(range);
    expect(index.openCursor).toHaveBeenCalledWith(range);
    expect(get).toHaveBeenCalledWith("tree_1 node_1");
    expect(put).toHaveBeenCalledOnce();
    expect(first.delete).toHaveBeenCalledOnce();
    expect(second.delete).toHaveBeenCalledOnce();
  });

  it("does not let a late model result overwrite a manual name from another tab", async () => {
    const put = vi.fn();
    const existing = {
      storageSchemaVersion: 1,
      key: "tree_1 node_1",
      treeId: "tree_1",
      nodeId: "node_1",
      label: "person's name",
      origin: "user" as const,
      basis: null,
      updatedAt: "2026-09-08T00:00:01.000Z",
    };
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue(existing),
        put,
        index: vi.fn(),
      },
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: () => transaction } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "late model name",
      origin: "model",
      basis: "0123456789abcdef12",
      updatedAt: "2026-09-08T00:00:00.000Z",
    })).resolves.toEqual({ ok: true });

    expect(put).not.toHaveBeenCalled();
    expect(transaction.store.index).not.toHaveBeenCalled();
  });

  it("reports a model transaction that fails at commit", async () => {
    vi.stubGlobal("IDBKeyRange", {
      bound: vi.fn(() => Object.freeze({ kind: "model-range" })),
    });
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        index: () => ({ count: vi.fn().mockResolvedValue(0) }),
      },
      done: Promise.reject(new DOMException("aborted", "AbortError")),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: () => transaction } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "model name",
      origin: "model",
      basis: "0123456789abcdef12",
      updatedAt: "2026-09-08T00:00:00.000Z",
    })).resolves.toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" });
  });

  it("reclaims model cache and retries once when a manual name reaches quota", async () => {
    const range = Object.freeze({ kind: "model-range" });
    vi.stubGlobal("IDBKeyRange", { bound: vi.fn(() => range) });
    const cursor = {
      delete: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(null),
    };
    const index = {
      count: vi.fn().mockResolvedValue(1),
      openCursor: vi.fn().mockResolvedValue(cursor),
    };
    const put = vi.fn().mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
    const retryPut = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: { put: retryPut, index: () => index },
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({
      put,
      transaction: () => transaction,
    } as never);
    const repository = createIndexedDbLabelRepository();

    await expect(repository.put("tree_1", {
      nodeId: "node_1",
      label: "my durable name",
      origin: "user",
      basis: null,
      updatedAt: "2026-09-08T00:00:00.000Z",
    })).resolves.toEqual({ ok: true });

    expect(cursor.delete).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(retryPut).toHaveBeenCalledOnce();
  });
});
