import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  createMatterDatabaseHandle,
  MAX_CACHED_MODEL_LABELS,
} from "./matter-database";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("Matter database upgrades", () => {
  beforeEach(() => {
    vi.mocked(openDB).mockReset();
    vi.unstubAllGlobals();
  });

  it("adds the eviction index and converges an existing model cache during upgrade", async () => {
    const range = Object.freeze({ kind: "model-range" });
    vi.stubGlobal("IDBKeyRange", { bound: vi.fn(() => range) });
    const createIndex = vi.fn();
    const deleted: number[] = [];
    const cursorAt = (position: number): unknown => position >= MAX_CACHED_MODEL_LABELS + 2
      ? null
      : {
          delete: vi.fn(async () => { deleted.push(position); }),
          continue: vi.fn(async () => cursorAt(position + 1)),
        };
    const openCursor = vi.fn(async () => cursorAt(0));
    const count = vi.fn(async () => MAX_CACHED_MODEL_LABELS + 2);
    const labels = {
      indexNames: { contains: (name: string) => name === "treeId" },
      createIndex,
      index: vi.fn(() => ({ count, openCursor })),
    };
    const database = {
      objectStoreNames: { contains: () => true },
      close: vi.fn(),
    };
    const transaction = { objectStore: vi.fn(() => labels) };
    vi.mocked(openDB).mockResolvedValue(database as never);
    const handle = createMatterDatabaseHandle();

    await handle.open();
    const callbacks = vi.mocked(openDB).mock.calls[0]?.[2];
    callbacks?.upgrade?.(
      database as never,
      3,
      4,
      transaction as never,
      new Event("upgradeneeded") as IDBVersionChangeEvent,
    );

    expect(transaction.objectStore).toHaveBeenCalledWith("labels");
    expect(createIndex).toHaveBeenCalledExactlyOnceWith(
      "originUpdatedAt",
      ["origin", "updatedAt"],
    );
    await vi.waitFor(() => expect(deleted).toEqual([
      0,
      1,
    ]));
    expect(count).toHaveBeenCalledExactlyOnceWith(range);
    expect(openCursor).toHaveBeenCalledExactlyOnceWith(range);
  });

  it("aborts the versionchange transaction rather than accepting an unbounded failed migration", async () => {
    vi.stubGlobal("IDBKeyRange", { bound: vi.fn(() => Object.freeze({})) });
    const count = vi.fn().mockResolvedValue(MAX_CACHED_MODEL_LABELS + 1);
    const openCursor = vi.fn().mockRejectedValue(new Error("cursor failed"));
    const labels = {
      indexNames: { contains: () => true },
      createIndex: vi.fn(),
      index: vi.fn(() => ({ count, openCursor })),
    };
    const database = {
      objectStoreNames: { contains: () => true },
      close: vi.fn(),
    };
    const transaction = {
      abort: vi.fn(),
      objectStore: vi.fn(() => labels),
    };
    vi.mocked(openDB).mockResolvedValue(database as never);
    const handle = createMatterDatabaseHandle();

    await handle.open();
    vi.mocked(openDB).mock.calls[0]?.[2]?.upgrade?.(
      database as never,
      3,
      4,
      transaction as never,
      new Event("upgradeneeded") as IDBVersionChangeEvent,
    );

    await vi.waitFor(() => expect(transaction.abort).toHaveBeenCalledOnce());
    expect(count).toHaveBeenCalledOnce();
    expect(openCursor).toHaveBeenCalledOnce();
  });

  it("creates both label indexes in a fresh database", async () => {
    const createIndex = vi.fn();
    const labels = {
      indexNames: { contains: () => false },
      createIndex,
    };
    const createObjectStore = vi.fn((name: string) => name === "labels" ? labels : {});
    const database = {
      objectStoreNames: { contains: () => false },
      createObjectStore,
      close: vi.fn(),
    };
    vi.mocked(openDB).mockResolvedValue(database as never);
    const handle = createMatterDatabaseHandle();

    await handle.open();
    const callbacks = vi.mocked(openDB).mock.calls[0]?.[2];
    callbacks?.upgrade?.(
      database as never,
      0,
      4,
      { objectStore: vi.fn() } as never,
      new Event("upgradeneeded") as IDBVersionChangeEvent,
    );

    expect(createObjectStore).toHaveBeenCalledWith("labels", { keyPath: "key" });
    expect(createIndex).toHaveBeenCalledWith("treeId", "treeId");
    expect(createIndex).toHaveBeenCalledWith(
      "originUpdatedAt",
      ["origin", "updatedAt"],
    );
  });
});
