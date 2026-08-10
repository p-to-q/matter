import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbInquiryRecordRepository } from "./inquiry-record-repository";

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
});
