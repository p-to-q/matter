import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbInquiryRecordRepository } from "./inquiry-record-repository";
import { isStoredInquiryExchange } from "./inquiry-record-policy";
import { MAX_INQUIRY_ANSWER_CODE_POINTS } from "../config/inquiry";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const RECORD = {
  recordSchemaVersion: 1 as const,
  treeId: "tree_1",
  exchanges: [{
    id: "inquiry_1",
    askedAt: "2026-08-11T00:00:00.000Z",
    question: "它在说什么？",
    outcome: { status: "answered" as const, text: "它仍然没有结束。" },
    basis: { treeId: "tree_1", revision: 3, scope: "tree" as const },
  }],
};

describe("IndexedDB Ask Matter record repository", () => {
  beforeEach(() => vi.mocked(openDB).mockReset());

  it("saves a bounded completed record with a generation", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: { get: vi.fn().mockResolvedValue(undefined), put },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: vi.fn().mockReturnValue(transaction) } as never);
    const repository = createIndexedDbInquiryRecordRepository();

    await expect(repository.save(RECORD, { generation: null, epoch: 0 })).resolves.toEqual({
      ok: true, value: { generation: 1, epoch: 0 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      treeId: "tree_1", writeGeneration: 1, recordSchemaVersion: 1,
    }));
  });

  it("rejects a stale generation without overwriting another tab's record", async () => {
    const transaction = {
      store: { get: vi.fn().mockResolvedValue({
        storageSchemaVersion: 1,
        ...RECORD,
        writeGeneration: 2,
      }), put: vi.fn() },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: vi.fn().mockReturnValue(transaction) } as never);
    const repository = createIndexedDbInquiryRecordRepository();

    await expect(repository.save(RECORD, { generation: 1, epoch: 0 })).resolves.toMatchObject({
      ok: false, error: { code: "PERSISTENCE_CONFLICT" },
    });
    expect(transaction.store.put).not.toHaveBeenCalled();
  });

  it("rejects malformed cached exchanges rather than returning them as a record", async () => {
    const malformed = {
      storageSchemaVersion: 1,
      recordSchemaVersion: 1,
      treeId: "tree_1",
      writeGeneration: 1,
      exchanges: [{ ...RECORD.exchanges[0], basis: { treeId: "tree_1", revision: -1, scope: "tree" } }],
    };
    vi.mocked(openDB).mockResolvedValue({ get: vi.fn().mockResolvedValue(malformed) } as never);
    const repository = createIndexedDbInquiryRecordRepository();

    await expect(repository.load("tree_1")).resolves.toMatchObject({
      ok: false, error: { code: "PERSISTENCE_CORRUPT" },
    });
  });

  it("keeps a clear tombstone so a late writer cannot recreate a cleared record", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      store: { get: vi.fn().mockResolvedValue({
        storageSchemaVersion: 1,
        ...RECORD,
        writeGeneration: 4,
        recordEpoch: 2,
        cleared: false,
      }), put },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: vi.fn().mockReturnValue(transaction) } as never);
    const repository = createIndexedDbInquiryRecordRepository();

    await expect(repository.clear("tree_1", { generation: 4, epoch: 2 })).resolves.toEqual({
      ok: true, value: { generation: 5, epoch: 3 },
    });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      treeId: "tree_1", writeGeneration: 5, recordEpoch: 3, cleared: true, exchanges: [],
    }));
  });

  it.each([
    { boundary: "save generation", operation: "save" as const, generation: Number.MAX_SAFE_INTEGER, epoch: 2 },
    { boundary: "clear generation", operation: "clear" as const, generation: Number.MAX_SAFE_INTEGER, epoch: 2 },
    { boundary: "clear epoch", operation: "clear" as const, generation: 4, epoch: Number.MAX_SAFE_INTEGER },
  ])("aborts before writing when the $boundary is exhausted", async ({ operation, generation, epoch }) => {
    const transaction = {
      store: {
        get: vi.fn().mockResolvedValue({
          storageSchemaVersion: 1,
          ...RECORD,
          writeGeneration: generation,
          recordEpoch: epoch,
          cleared: false,
        }),
        put: vi.fn(),
      },
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    vi.mocked(openDB).mockResolvedValue({ transaction: vi.fn().mockReturnValue(transaction) } as never);
    const repository = createIndexedDbInquiryRecordRepository();
    const expectedVersion = { generation, epoch };
    const result = operation === "save"
      ? await repository.save(RECORD, expectedVersion)
      : await repository.clear(RECORD.treeId, expectedVersion);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_WRITE_FAILED" },
    });
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(transaction.store.put).not.toHaveBeenCalled();
  });

  it("rejects non-canonical timestamps, duplicate ids, and a basis from another tree", async () => {
    const invalidRecords = [
      { ...RECORD.exchanges[0], askedAt: "2026-08-11" },
      { ...RECORD.exchanges[0], basis: { treeId: "tree_2", revision: 3, scope: "tree" } },
      RECORD.exchanges[0],
    ];
    const malformed = {
      storageSchemaVersion: 1,
      ...RECORD,
      writeGeneration: 1,
      exchanges: invalidRecords,
    };
    vi.mocked(openDB).mockResolvedValue({ get: vi.fn().mockResolvedValue(malformed) } as never);
    const repository = createIndexedDbInquiryRecordRepository();

    await expect(repository.load("tree_1")).resolves.toMatchObject({
      ok: false, error: { code: "PERSISTENCE_CORRUPT" },
    });
  });

  it.each(["TIMED_OUT", "TEMPORARILY_UNAVAILABLE"] as const)(
    "keeps the stable %s terminal outcome in the bounded local record",
    (reason) => {
      expect(isStoredInquiryExchange({
        ...RECORD.exchanges[0],
        outcome: { status: "unavailable", reason },
      })).toBe(true);
    },
  );

  it("stores one complete maximum answer and rejects one code point more", () => {
    expect(isStoredInquiryExchange({
      ...RECORD.exchanges[0],
      outcome: { status: "answered", text: "🎉".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS) },
    })).toBe(true);
    expect(isStoredInquiryExchange({
      ...RECORD.exchanges[0],
      outcome: { status: "answered", text: "答".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS + 1) },
    })).toBe(false);
  });

  it("accepts astral record text and rejects lone surrogates", () => {
    expect(isStoredInquiryExchange({
      ...RECORD.exchanges[0],
      question: "这个🚀想法呢？",
      outcome: { status: "answered", text: "它仍然在🚀生长。" },
    })).toBe(true);
    for (const malformed of ["bad\uD800text", "bad\uDC00text"]) {
      expect(isStoredInquiryExchange({
        ...RECORD.exchanges[0],
        question: malformed,
      })).toBe(false);
      expect(isStoredInquiryExchange({
        ...RECORD.exchanges[0],
        outcome: { status: "answered", text: malformed },
      })).toBe(false);
    }
  });
});
