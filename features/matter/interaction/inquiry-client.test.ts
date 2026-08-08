import { describe, expect, it, vi } from "vitest";
import {
  MAX_INQUIRY_ANSWER_CODE_POINTS,
  sameInquiryContext,
} from "../server/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { askInquiry } from "./inquiry-client";

describe("inquiry client", () => {
  it("sends the bounded question and reads a stated result", async () => {
    const fetchImpl = respondWith(answer({ status: "unavailable", reason: "NO_PROVIDER" }));
    await expect(askInquiry({ ...INPUT, fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "NO_PROVIDER",
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      requestId: INPUT.requestId,
      question: INPUT.question,
      context: { treeId: "tree_inquiry" },
    });
  });

  it("accepts a non-empty answer and rejects malformed or failed responses", async () => {
    await expect(askInquiry({ ...INPUT, fetchImpl: respondWith(answer({ status: "answered", text: "一段回应" })) }))
      .resolves.toEqual({ status: "answered", text: "一段回应" });
    for (const payload of [
      null,
      answer({ status: "answered", text: " " }),
      { ...answer({ status: "answered", text: "回应" }), extra: true },
      { ...answer({ status: "answered", text: "回应" }), protocolVersion: "0.1" },
      { ...answer({ status: "answered", text: "回应" }), basis: { ...BASIS, revision: 3 } },
      answer({ status: "answered", text: "答".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS + 1) }),
      { status: "sideways" },
    ]) {
      await expect(askInquiry({ ...INPUT, fetchImpl: respondWith(payload) }))
        .resolves.toEqual({ status: "unavailable", reason: "UNREACHABLE" });
    }
  });

  it("separates a refused question from an unsent one", async () => {
    // A rate-limited or shed question was received. Reporting it as never sent
    // is untrue and invites an immediate retry into the same limiter.
    const limited = vi.fn(() => Promise.resolve(new Response("", { status: 429 }))) as unknown as typeof fetch;
    expect(await askInquiry({ ...INPUT, fetchImpl: limited }))
      .toEqual({ status: "unavailable", reason: "RATE_LIMITED" });

    const busy = vi.fn(() => Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch;
    expect(await askInquiry({ ...INPUT, fetchImpl: busy }))
      .toEqual({ status: "unavailable", reason: "BUSY" });

    // Anything else may not have arrived, so unreachable stays the honest answer.
    for (const status of [400, 403, 404, 500, 504]) {
      const other = vi.fn(() => Promise.resolve(new Response("", { status }))) as unknown as typeof fetch;
      expect(await askInquiry({ ...INPUT, fetchImpl: other }))
        .toEqual({ status: "unavailable", reason: "UNREACHABLE" });
    }
  });

  it("makes document, revision, and selected-context changes stale", () => {
    const start = INPUT.context;
    expect(sameInquiryContext(start, { ...start })).toBe(true);
    expect(sameInquiryContext(start, { ...start, treeId: "tree_other" })).toBe(false);
    expect(sameInquiryContext(start, { ...start, revision: start.revision + 1 })).toBe(false);
    expect(sameInquiryContext(start, {
      ...start,
      scope: "selection",
      lineage: [{ ...start.lineage[0], text: "另一段" }],
    })).toBe(false);
  });

  it("does not start a fetch when the owning interaction is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(askInquiry({ ...INPUT, signal: controller.signal, fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "UNREACHABLE",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

const INPUT = {
  requestId: "inquiry_client_test",
  question: "这份材料在讲什么？",
  locale: "zh-CN",
  context: {
    treeId: "tree_inquiry",
    revision: 2,
    thoughtCount: 1,
    scope: "tree",
    clipped: false,
    lineage: [{ nodeId: "root", depth: 0, text: "根材料", truncated: false }],
  },
} as const;

const BASIS = {
  requestId: INPUT.requestId,
  treeId: INPUT.context.treeId,
  revision: INPUT.context.revision,
  scope: INPUT.context.scope,
} as const;

const RECEIPT = {
  scope: INPUT.context.scope,
  lineageNodes: 1,
  contextCodePoints: 3,
  clipped: false,
  thoughtCount: 1,
} as const;

function answer(
  result: { status: "answered"; text: string } | { status: "unavailable"; reason: "NO_PROVIDER" | "NO_MATERIAL" },
) {
  return { protocolVersion: PROTOCOL_VERSION, basis: BASIS, ...result, receipt: RECEIPT };
}

function respondWith(payload: unknown) {
  return vi.fn(() => Promise.resolve(Response.json(payload))) as unknown as typeof fetch & {
    mock: { calls: Array<[unknown, RequestInit | undefined]> };
  };
}
