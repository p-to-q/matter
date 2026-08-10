import { describe, expect, it } from "vitest";
import { appendInquiryExchange } from "../persistence/inquiry-record-policy";
import type { StoredInquiryExchange, StoredInquiryRecord } from "../persistence/inquiry-record-repository";
import { reconcileInquiryAppend, reconcileInquiryClear } from "./inquiry-record-reconciliation";

const FIRST: StoredInquiryExchange = Object.freeze({
  id: "inquiry_first",
  askedAt: "2026-08-11T00:00:00.000Z",
  question: "先问的是什么？",
  outcome: { status: "answered" as const, text: "第一句。" },
  basis: { treeId: "tree_1", revision: 1, scope: "tree" as const },
});

const SECOND: StoredInquiryExchange = Object.freeze({
  id: "inquiry_second",
  askedAt: "2026-08-11T00:00:01.000Z",
  question: "后问的是什么？",
  outcome: { status: "answered" as const, text: "第二句。" },
  basis: { treeId: "tree_1", revision: 2, scope: "selection" as const },
});

function record(overrides: Partial<StoredInquiryRecord> = {}): StoredInquiryRecord {
  return Object.freeze({
    storageSchemaVersion: 1,
    recordSchemaVersion: 1,
    treeId: "tree_1",
    writeGeneration: 4,
    recordEpoch: 2,
    cleared: false,
    exchanges: Object.freeze([FIRST]),
    ...overrides,
  });
}

describe("Ask Matter record reconciliation", () => {
  it("rebases a stale append against the remote record in stable chronological order", () => {
    const result = reconcileInquiryAppend(record(), { generation: 3, epoch: 2 }, SECOND);

    expect(result).toEqual({
      kind: "retry",
      version: { generation: 4, epoch: 2 },
      draft: { recordSchemaVersion: 1, treeId: "tree_1", exchanges: [FIRST, SECOND] },
    });
  });

  it("drops a late append after another tab clears the record", () => {
    const result = reconcileInquiryAppend(
      record({ writeGeneration: 5, recordEpoch: 3, cleared: true, exchanges: Object.freeze([]) }),
      { generation: 4, epoch: 2 },
      SECOND,
    );

    expect(result).toMatchObject({ kind: "discarded-after-clear" });
  });

  it("deduplicates by immutable exchange id and keeps chronological visible order", () => {
    const earlier = Object.freeze({ ...SECOND, id: "inquiry_earlier", askedAt: "2026-08-10T23:59:59.000Z" });
    const ordered = appendInquiryExchange([FIRST], earlier);
    const deduplicated = ordered === null ? null : appendInquiryExchange(ordered, earlier);

    expect(ordered?.map((exchange) => exchange.id)).toEqual(["inquiry_earlier", "inquiry_first"]);
    expect(deduplicated?.map((exchange) => exchange.id)).toEqual(["inquiry_earlier", "inquiry_first"]);
  });

  it("treats a remote tombstone as a completed concurrent clear", () => {
    expect(reconcileInquiryClear(record({ cleared: true, exchanges: Object.freeze([]) }))).toEqual({
      kind: "already-cleared", version: { generation: 4, epoch: 2 },
    });
  });
});
