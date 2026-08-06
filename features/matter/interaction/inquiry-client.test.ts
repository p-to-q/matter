import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { askInquiry } from "./inquiry-client";

describe("inquiry client", () => {
  it("sends the question with its context and reads a stated reason", async () => {
    const fetchImpl = respondWith({ status: "unavailable", reason: "NO_PROVIDER", receipt: {} });

    await expect(askInquiry({ ...input, fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "NO_PROVIDER",
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      question: "这份材料在讲什么？",
      locale: "zh-CN",
      context: { treeId: "tree_inquiry" },
    });
  });

  it("reads an answer when one is given", async () => {
    const fetchImpl = respondWith({ status: "answered", text: "一段回应", receipt: {} });

    await expect(askInquiry({ ...input, fetchImpl }))
      .resolves.toEqual({ status: "answered", text: "一段回应" });
  });

  // Silence has to be distinguishable from "no model", or a person cannot tell
  // a missing feature from a broken connection.
  it("turns every failure into UNREACHABLE rather than a false answer", async () => {
    const cases: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError("network")),
      () => Promise.resolve(Response.json({ error: { code: "INQUIRY_FAILED" } }, { status: 500 })),
      () => Promise.resolve(Response.json({ status: "answered", text: "   " })),
      () => Promise.resolve(Response.json({ status: "answered" })),
      () => Promise.resolve(Response.json({ status: "unavailable", reason: "SOMETHING_ELSE" })),
      () => Promise.resolve(Response.json({ status: "sideways" })),
      () => Promise.resolve(Response.json(null)),
    ];

    for (const impl of cases) {
      await expect(askInquiry({ ...input, fetchImpl: vi.fn(impl) as unknown as typeof fetch }))
        .resolves.toEqual({ status: "unavailable", reason: "UNREACHABLE" });
    }
  });

  it("gives up when the caller aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;

    const pending = askInquiry({ ...input, fetchImpl, signal: controller.signal });
    controller.abort();

    await expect(pending).resolves.toEqual({ status: "unavailable", reason: "UNREACHABLE" });
  });
});

const input = {
  question: "这份材料在讲什么？",
  locale: "zh-CN",
  context: {
    treeId: "tree_inquiry",
    revision: 2,
    thoughtCount: 4,
    clipped: false,
    lineage: [{ nodeId: "root", depth: 0, text: "根材料", truncated: false }],
  },
} as const;

function respondWith(payload: unknown) {
  return vi.fn(() => Promise.resolve(Response.json(payload))) as unknown as typeof fetch & {
    mock: { calls: Array<[unknown, RequestInit | undefined]> };
  };
}
