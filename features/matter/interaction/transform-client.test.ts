import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRANSFORM_CLIENT_TIMEOUT_MS,
  buildTransformPlan,
  parseTransformEnvelope,
} from "../protocol/transform-contract";
import { requestTransform } from "./transform-client";

const TIME = "2026-08-11T00:00:00.000Z";

afterEach(() => vi.unstubAllGlobals());

describe("transform client", () => {
  it("transports one immutable envelope and accepts only its exact plan", async () => {
    const envelope = fixtureEnvelope();
    const plan = buildTransformPlan(envelope, "source more");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(plan);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTransform(envelope, new AbortController().signal)).resolves.toEqual(plan);
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(envelope);
    expect(String(init?.body)).not.toContain("voice");
  });

  it("rejects malformed and server-rejected plans without retrying", async () => {
    const envelope = fixtureEnvelope();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ text: "source more" }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "TURN_REJECTED", message: "bounded refusal", retryable: true },
      }, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTransform(envelope, new AbortController().signal))
      .rejects.toMatchObject({
        retryable: false,
        message: "Matter returned an invalid change.",
      });
    await expect(requestTransform(envelope, new AbortController().signal))
      .rejects.toMatchObject({ retryable: true, message: "bounded refusal" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed refusals and preserves strict retryability", async () => {
    const envelope = fixtureEnvelope();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        error: { code: "TURN_REJECTED", message: "bounded refusal", retryable: true, extra: true },
      }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "INVALID_REQUEST", message: "stale request", retryable: false },
      }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTransform(envelope, new AbortController().signal))
      .rejects.toMatchObject({ retryable: false, message: "Matter returned an invalid refusal." });
    await expect(requestTransform(envelope, new AbortController().signal))
      .rejects.toMatchObject({ retryable: false, message: "stale request" });
  });

  it("lets the owner abort and keeps the client deadline at 16 seconds", async () => {
    const envelope = fixtureEnvelope();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const pending = requestTransform(envelope, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(TRANSFORM_CLIENT_TIMEOUT_MS).toBe(16_000);
  });
});

function fixtureEnvelope() {
  const parsed = parseTransformEnvelope({
    protocolVersion: "0.2",
    requestVersion: "transform/2",
    id: "turn_client",
    treeId: "tree_client",
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: 4,
    selection: { type: "segment-range", nodeId: "thought", start: 0, end: 6, selectedText: "source" },
    gesture: { type: "stretch", axis: "vertical", amount: .5 },
    locale: "en-US",
    context: { lineage: [
      { id: "thought", text: "source. next", parentId: null, createdAt: TIME, updatedAt: TIME },
    ] },
  });
  if (!parsed.ok) throw new Error("client fixture envelope invalid");
  return parsed.envelope;
}
