import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbDocumentRepository } from "./document-repository";

vi.mock("idb", () => ({ openDB: vi.fn() }));

describe("IndexedDB document repository", () => {
  beforeEach(() => {
    vi.mocked(openDB).mockReset();
  });

  it("opens again after the memoized open promise rejects", async () => {
    const database = {
      get: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(openDB)
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValueOnce(database as never);
    const repository = createIndexedDbDocumentRepository();

    await expect(repository.load("tree-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(openDB).toHaveBeenCalledTimes(2);
    expect(database.get).toHaveBeenCalledWith("snapshots", "tree-1");
  });

  it("does not let an older rejection clear a newer open", async () => {
    let rejectFirst!: (reason: unknown) => void;
    const firstOpen = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const database = {
      get: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(openDB)
      .mockReturnValueOnce(firstOpen)
      .mockResolvedValueOnce(database as never);
    const repository = createIndexedDbDocumentRepository();

    const firstLoad = repository.load("tree-1");
    const lifecycle = vi.mocked(openDB).mock.calls[0]?.[2] as
      | { blocked?: () => void; terminated?: () => void }
      | undefined;
    lifecycle?.blocked?.();
    const secondLoad = repository.load("tree-1");
    rejectFirst(new Error("older open failed"));

    await expect(firstLoad).resolves.toMatchObject({ ok: false });
    await expect(secondLoad).resolves.toEqual({ ok: true, value: null });
    lifecycle?.terminated?.();
    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(openDB).toHaveBeenCalledTimes(2);
  });

  it("lets an older version-change callback close only its own database", async () => {
    const olderDatabase = {
      close: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
    };
    let resolveFirst!: (database: typeof olderDatabase) => void;
    const firstOpen = new Promise<typeof olderDatabase>((resolve) => {
      resolveFirst = resolve;
    });
    const currentDatabase = {
      close: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(openDB)
      .mockReturnValueOnce(firstOpen as never)
      .mockResolvedValueOnce(currentDatabase as never);
    const repository = createIndexedDbDocumentRepository();

    const firstLoad = repository.load("tree-1");
    const lifecycle = vi.mocked(openDB).mock.calls[0]?.[2] as
      | { blocked?: () => void; blocking?: () => void }
      | undefined;
    lifecycle?.blocked?.();
    const secondLoad = repository.load("tree-1");
    resolveFirst(olderDatabase);

    await expect(firstLoad).resolves.toEqual({ ok: true, value: null });
    await expect(secondLoad).resolves.toEqual({ ok: true, value: null });
    lifecycle?.blocking?.();
    await vi.waitFor(() => expect(olderDatabase.close).toHaveBeenCalledTimes(1));

    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(currentDatabase.close).not.toHaveBeenCalled();
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});
