import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INQUIRY_CLIENT_TIMEOUT_MS,
  MAX_INQUIRY_ANSWER_CODE_POINTS,
  MAX_INQUIRY_RESPONSE_BYTES,
  sameInquiryContext,
} from "../protocol/inquiry-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { askInquiry, createInquiryRequestId } from "./inquiry-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inquiry client", () => {
  it("keeps request identities distinct when no Web Crypto primitive exists", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_777);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(createInquiryRequestId()).not.toBe(createInquiryRequestId());
  });

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
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
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

  it("reads a complete astral answer that needs the expanded response envelope", async () => {
    const text = "🎉".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS);
    const payload = answer({ status: "answered", text });
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    expect(bytes).toBeGreaterThan(8 * 1_024);
    expect(bytes).toBeLessThan(MAX_INQUIRY_RESPONSE_BYTES);
    await expect(askInquiry({ ...INPUT, fetchImpl: respondWith(payload) }))
      .resolves.toEqual({ status: "answered", text });
  });

  it("separates a refused question from an unsent one", async () => {
    // A rate-limited or shed question was received. Reporting it as never sent
    // is untrue and invites an immediate retry into the same limiter.
    const limited = refuse(429);
    expect(await askInquiry({ ...INPUT, fetchImpl: limited }))
      .toEqual({ status: "unavailable", reason: "RATE_LIMITED" });

    const busy = refuse(503);
    expect(await askInquiry({ ...INPUT, fetchImpl: busy }))
      .toEqual({ status: "unavailable", reason: "BUSY" });

    expect(await askInquiry({ ...INPUT, fetchImpl: refuse(503, "MODEL_BUSY") }))
      .toEqual({ status: "unavailable", reason: "BUSY" });
    expect(await askInquiry({ ...INPUT, fetchImpl: refuse(503, "MODEL_TIMEOUT") }))
      .toEqual({ status: "unavailable", reason: "TIMED_OUT" });
    for (const reason of ["MODEL_UNAVAILABLE", "MODEL_REJECTED"] as const) {
      expect(await askInquiry({ ...INPUT, fetchImpl: refuse(503, reason, "qwen-secret-detail") }))
        .toEqual({ status: "unavailable", reason: "TEMPORARILY_UNAVAILABLE" });
    }
    expect(await askInquiry({ ...INPUT, fetchImpl: refuse(504) }))
      .toEqual({ status: "unavailable", reason: "TIMED_OUT" });

    // A status without Matter's exact envelope may have come from a proxy and
    // cannot prove the application received the question.
    for (const status of [400, 403, 404, 429, 500, 503, 504]) {
      const other = vi.fn(() => Promise.resolve(new Response("legacy", { status }))) as unknown as typeof fetch;
      expect(await askInquiry({ ...INPUT, fetchImpl: other }))
        .toEqual({ status: "unavailable", reason: "UNREACHABLE" });
    }
  });

  it("rejects oversized and non-strict error responses without trusting their status", async () => {
    const oversized = vi.fn(() => Promise.resolve(new Response(
      "x".repeat(MAX_INQUIRY_RESPONSE_BYTES + 1),
      { status: 503 },
    ))) as unknown as typeof fetch;
    await expect(askInquiry({ ...INPUT, fetchImpl: oversized })).resolves.toEqual({
      status: "unavailable",
      reason: "UNREACHABLE",
    });

    for (const error of [
      { code: "INQUIRY_FAILED", message: "Busy", retryable: true, fallbackReason: "UNKNOWN" },
      { code: "INQUIRY_FAILED", message: "Busy", retryable: true, fallbackReason: "MODEL_BUSY", extra: true },
      { code: "INQUIRY_FAILED", message: "Busy", retryable: false, fallbackReason: "MODEL_BUSY" },
    ]) {
      const malformed = vi.fn(() => Promise.resolve(Response.json({ error }, { status: 503 }))) as unknown as typeof fetch;
      await expect(askInquiry({ ...INPUT, fetchImpl: malformed })).resolves.toEqual({
        status: "unavailable",
        reason: "UNREACHABLE",
      });
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

  it("settles its own timeout even when an injected transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const pending = askInquiry({ ...INPUT, fetchImpl });
    const assertion = expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "TIMED_OUT",
    });

    await vi.advanceTimersByTimeAsync(INQUIRY_CLIENT_TIMEOUT_MS);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledOnce();
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

function refuse(
  status: number,
  fallbackReason?: "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY",
  message = "Matter could not answer just now.",
) {
  return vi.fn(() => Promise.resolve(Response.json({
    error: {
      code: "INQUIRY_FAILED",
      message,
      retryable: true,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
    },
  }, { status }))) as unknown as typeof fetch;
}
