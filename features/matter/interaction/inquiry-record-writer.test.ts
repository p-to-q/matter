import { describe, expect, it } from "vitest";
import type {
  InquiryRecordRepository,
  StoredInquiryExchange,
  StoredInquiryRecord,
} from "../persistence/inquiry-record-repository";
import { inquiryRecordVersion } from "../persistence/inquiry-record-policy";
import { createInquiryRecordWriter, loadInquiryRecord } from "./inquiry-record-writer";

describe("Ask Matter record writer", () => {
  it("persists an accepted exchange even when the visible tree changes before its initial load settles", async () => {
    const records = new Map<string, StoredInquiryRecord>();
    const deferredTreeA = deferred<Awaited<ReturnType<InquiryRecordRepository["load"]>>>();
    let firstTreeALoad = true;
    const repository: InquiryRecordRepository = {
      async load(treeId) {
        if (treeId === "tree_a" && firstTreeALoad) {
          firstTreeALoad = false;
          return deferredTreeA.promise;
        }
        return { ok: true, value: records.get(treeId) ?? null };
      },
      async save(draft, expectedVersion) {
        const current = records.get(draft.treeId) ?? null;
        const actualVersion = inquiryRecordVersion(current);
        if (
          actualVersion.generation !== expectedVersion.generation ||
          actualVersion.epoch !== expectedVersion.epoch
        ) {
          return {
            ok: false,
            error: { code: "PERSISTENCE_CONFLICT", message: "conflict" },
          };
        }
        const next: StoredInquiryRecord = {
          storageSchemaVersion: 1,
          recordSchemaVersion: 1,
          treeId: draft.treeId,
          writeGeneration: (actualVersion.generation ?? 0) + 1,
          recordEpoch: actualVersion.epoch,
          cleared: false,
          exchanges: draft.exchanges,
        };
        records.set(draft.treeId, next);
        return { ok: true, value: inquiryRecordVersion(next) };
      },
      async clear() {
        return {
          ok: false,
          error: { code: "PERSISTENCE_WRITE_FAILED", message: "unused" },
        };
      },
      close() {},
    };
    const writer = createInquiryRecordWriter(repository);

    const appendA = writer.append("tree_a", exchange("tree_a", "exchange_a"), null);
    const appendB = writer.append("tree_b", exchange("tree_b", "exchange_b"), null);
    deferredTreeA.resolve({ ok: true, value: null });

    await expect(appendA).resolves.toMatchObject({ ok: true });
    await expect(appendB).resolves.toMatchObject({ ok: true });
    await writer.whenIdle();
    expect(records.get("tree_a")?.exchanges.map(({ id }) => id)).toEqual(["exchange_a"]);
    expect(records.get("tree_b")?.exchanges.map(({ id }) => id)).toEqual(["exchange_b"]);
  });

  it("serializes two fast exchanges against the latest durable version", async () => {
    const { repository, records } = memoryRepository();
    const writer = createInquiryRecordWriter(repository);

    await Promise.all([
      writer.append("tree_a", exchange("tree_a", "exchange_1"), null),
      writer.append("tree_a", exchange("tree_a", "exchange_2"), null),
    ]);

    expect(records.get("tree_a")?.exchanges.map(({ id }) => id))
      .toEqual(["exchange_1", "exchange_2"]);
  });

  it("orders an answer accepted during clear after the clear tombstone", async () => {
    const prior = record("tree_a", 1, 0, [exchange("tree_a", "old_exchange")]);
    const { repository, records } = memoryRepository([prior]);
    const writer = createInquiryRecordWriter(repository);

    const clear = writer.clear("tree_a", inquiryRecordVersion(prior));
    const append = writer.append("tree_a", exchange("tree_a", "new_exchange"), null);

    await expect(clear).resolves.toMatchObject({ ok: true });
    await expect(append).resolves.toMatchObject({ ok: true });
    expect(records.get("tree_a")).toMatchObject({ recordEpoch: 1, cleared: false });
    expect(records.get("tree_a")?.exchanges.map(({ id }) => id)).toEqual(["new_exchange"]);
  });

  it("does not resurrect an exchange whose basis predates a concurrent clear epoch", async () => {
    const cleared = record("tree_a", 2, 1, [], true);
    const { repository, records } = memoryRepository([cleared]);
    const writer = createInquiryRecordWriter(repository);

    const result = await writer.append("tree_a", exchange("tree_a", "stale_exchange"), {
      version: { generation: 1, epoch: 0 },
      exchanges: [],
    });

    expect(result).toMatchObject({ ok: true, value: { exchanges: [] } });
    expect(records.get("tree_a")).toEqual(cleared);
  });

  it("normalizes a rejecting replaceable adapter instead of hanging in loading", async () => {
    const repository: InquiryRecordRepository = {
      load: async () => { throw new Error("offline"); },
      save: async () => { throw new Error("unused"); },
      clear: async () => { throw new Error("unused"); },
      close() {},
    };

    await expect(loadInquiryRecord(repository, "tree_a")).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
  });
});

function exchange(treeId: string, id: string): StoredInquiryExchange {
  return Object.freeze({
    id,
    askedAt: "2026-08-28T00:00:00.000Z",
    question: "这里在说什么？",
    outcome: Object.freeze({ status: "answered" as const, text: "它仍然没有结束。" }),
    basis: Object.freeze({ treeId, revision: 1, scope: "tree" as const }),
  });
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function memoryRepository(initial: readonly StoredInquiryRecord[] = []) {
  const records = new Map(initial.map((entry) => [entry.treeId, entry]));
  const repository: InquiryRecordRepository = {
    async load(treeId) {
      return { ok: true, value: records.get(treeId) ?? null };
    },
    async save(draft, expectedVersion) {
      const current = records.get(draft.treeId) ?? null;
      const actual = inquiryRecordVersion(current);
      if (!sameVersion(actual, expectedVersion)) {
        return { ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } };
      }
      const next = record(
        draft.treeId,
        (actual.generation ?? 0) + 1,
        actual.epoch,
        draft.exchanges,
      );
      records.set(draft.treeId, next);
      return { ok: true, value: inquiryRecordVersion(next) };
    },
    async clear(treeId, expectedVersion) {
      const current = records.get(treeId) ?? null;
      const actual = inquiryRecordVersion(current);
      if (!sameVersion(actual, expectedVersion)) {
        return { ok: false, error: { code: "PERSISTENCE_CONFLICT", message: "conflict" } };
      }
      const next = record(treeId, (actual.generation ?? 0) + 1, actual.epoch + 1, [], true);
      records.set(treeId, next);
      return { ok: true, value: inquiryRecordVersion(next) };
    },
    close() {},
  };
  return { repository, records };
}

function record(
  treeId: string,
  generation: number,
  epoch: number,
  exchanges: readonly StoredInquiryExchange[],
  cleared = false,
): StoredInquiryRecord {
  return Object.freeze({
    storageSchemaVersion: 1,
    recordSchemaVersion: 1,
    treeId,
    writeGeneration: generation,
    recordEpoch: epoch,
    cleared,
    exchanges: Object.freeze([...exchanges]),
  });
}

function sameVersion(
  left: ReturnType<typeof inquiryRecordVersion>,
  right: ReturnType<typeof inquiryRecordVersion>,
): boolean {
  return left.generation === right.generation && left.epoch === right.epoch;
}
