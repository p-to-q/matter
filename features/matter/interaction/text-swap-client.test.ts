import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TEXT_SWAP_RESPONSE_BYTES,
  TEXT_SWAP_CLIENT_TIMEOUT_MS,
  buildTextSwapPlan,
  parseTextSwapEnvelope,
} from "../protocol/text-swap-contract";
import { requestTextSwap } from "./text-swap-client";

const TIME = "2026-08-20T00:00:00.000Z";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("text swap client", () => {
  it("transports one exact envelope and accepts only its echoed plan", async () => {
    const envelope = fixtureEnvelope();
    const plan = buildTextSwapPlan(envelope, "Drops tapped against glass");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(plan);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTextSwap(envelope, new AbortController().signal)).resolves.toEqual(plan);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/matter/api/text-swap");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual(envelope);
  });

  it("fails closed on malformed success or refusal and never retries", async () => {
    const envelope = fixtureEnvelope();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ text: "Drops tapped against glass" }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "TURN_REJECTED", message: "try another direction", retryable: true },
      }, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTextSwap(envelope, new AbortController().signal))
      .rejects.toMatchObject({
        retryable: false,
        kind: "invalid-response",
        message: "Matter returned an invalid wording change.",
      });
    await expect(requestTextSwap(envelope, new AbortController().signal))
      .rejects.toMatchObject({ retryable: true, message: "try another direction" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses declared or streamed oversized and malformed responses", async () => {
    const envelope = fixtureEnvelope();
    const stalled = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => undefined),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(stalled, {
        headers: { "content-length": String(MAX_TEXT_SWAP_RESPONSE_BYTES + 1) },
      }))
      .mockResolvedValueOnce(new Response("x".repeat(MAX_TEXT_SWAP_RESPONSE_BYTES + 1)))
      .mockResolvedValueOnce(new Response("{"));
    vi.stubGlobal("fetch", fetchMock);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(requestTextSwap(envelope, new AbortController().signal))
        .rejects.toMatchObject({
          retryable: false,
          kind: "invalid-response",
          message: "Matter returned an invalid wording change.",
        });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cancels a stalled response body when its owner aborts", async () => {
    const envelope = fixtureEnvelope();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));
    const controller = new AbortController();
    const pending = requestTextSwap(envelope, controller.signal);
    await Promise.resolve();
    controller.abort(new DOMException("Text Swap closed.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });

  it("lets its owner abort and keeps the independent 16 second deadline", async () => {
    const envelope = fixtureEnvelope();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const pending = requestTextSwap(envelope, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(TEXT_SWAP_CLIENT_TIMEOUT_MS).toBe(16_000);
  });

  it("settles its deadline when the transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = requestTextSwap(fixtureEnvelope(), new AbortController().signal);
    const assertion = expect(pending).rejects.toMatchObject({
      retryable: true,
      message: "Matter took too long to swap this passage.",
    });

    await vi.advanceTimersByTimeAsync(TEXT_SWAP_CLIENT_TIMEOUT_MS);
    await assertion;
  });
});

function fixtureEnvelope() {
  const parsed = parseTextSwapEnvelope({
    protocolVersion: "0.2",
    requestVersion: "text-swap/2",
    id: "swap_client",
    treeId: "tree_client",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 4,
    selection: { type: "segment-range", nodeId: "thought", start: 0, end: 23, selectedText: "Rain touched the window" },
    direction: { text: "make it more tactile" },
    locale: "en-US",
    context: { lineage: [
      { id: "thought", text: "Rain touched the window. Next", parentId: null, createdAt: TIME, updatedAt: TIME },
    ] },
  });
  if (!parsed.ok) throw new Error("text swap client fixture invalid");
  return parsed.envelope;
}
