import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { MAX_TRANSFORM_REQUEST_BYTES, parseTransformEnvelope, parseTransformPlan } from "../protocol/transform-contract";
import type { ScenarioAdapter, ScenarioCall } from "./harness";
import { resetTransformAdmissionForTests } from "./transform-admission";
import { fixtureTransformAdapter } from "./transform-provider";
import { TRANSFORM_ROUTE_TIMEOUT_MS, handleTransformRequest, resetTransformGovernor, transformErrorResponse } from "./transform-route";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "我一直觉得，这件事可能没那么重要。";
const PASSAGE = "这件事可能没那么重要";

beforeEach(() => {
  resetTransformAdmissionForTests();
  resetTransformGovernor();
});

describe("transform route", () => {
  it("runs a fixture through the strict envelope, model-text-only scenario, and server-owned plan", async () => {
    const response = await post(body(), fixtureTransformAdapter);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const plan = await response.json();
    const request = parseTransformEnvelope(parsedEnvelope());
    if (!request.ok) throw new Error("fixture must parse");
    const parsed = parseTransformPlan(plan, request.envelope);
    expect(parsed).not.toBeNull();
    expect(parsed?.action).toMatchObject({
      type: "replace-text-range",
      nodeId: "thought",
      start: TEXT.indexOf(PASSAGE),
      end: TEXT.indexOf(PASSAGE) + PASSAGE.length,
      intent: "expand",
    });
    expect(parsed?.action.text).not.toBe(PASSAGE);
  });

  it("gives the prompt ancestors only: selected material appears once as surrounding plus passage", async () => {
    let call: ScenarioCall | undefined;
    const adapter: ScenarioAdapter = async (candidate) => {
      call = candidate;
      return { text: "这件事在眼下这个时刻可能没那么显得重要" };
    };
    await expect(post(body(), adapter).then((response) => response.status)).resolves.toBe(200);
    expect(call?.prompt).toContain("<lineage>[]</lineage>");
    expect(call?.prompt.match(new RegExp(PASSAGE, "gu"))?.length).toBe(1);
    expect((call?.input as { lineage: unknown }).lineage).toEqual([]);
  });

  it("does not invent a plan without an enabled provider or fixture", async () => {
    const response = await post(body(), null);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TURN_UNAVAILABLE",
        message: "Matter could not change this passage just now.",
        retryable: true,
        fallbackReason: "MODEL_UNAVAILABLE",
      },
    });
  });

  it("rejects invalid protocol data and oversized declarations before model work", async () => {
    await expect(post(body({ gesture: { type: "stretch", axis: "vertical", amount: 0 } })).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body({ extra: true })).then((response) => response.status)).resolves.toBe(400);
    await expect(post({
      protocolVersion: PROTOCOL_VERSION,
      id: "turn_legacy",
      treeId: "tree_route",
      mode: "transform",
      treeRevision: 3,
      selection: body().selection,
      gesture: body().gesture,
      voice: { transcript: "make it longer", language: "zh-CN" },
      context: body().context,
    }).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body({ voice: { transcript: "make it longer" } })).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body(), fixtureTransformAdapter, { "content-type": "text/plain" }).then((response) => response.status)).resolves.toBe(415);
    await expect(post(body(), fixtureTransformAdapter, { "content-length": String(MAX_TRANSFORM_REQUEST_BYTES + 1) }).then((response) => response.status)).resolves.toBe(413);
  });

  it("maps provider rejection and unavailability without changing material", async () => {
    const rejected: ScenarioAdapter = async () => ({ text: PASSAGE });
    const unavailable: ScenarioAdapter = async () => { throw new Error("provider unavailable"); };
    await expect(post(body(), rejected).then(async (response) => ({ status: response.status, body: await response.json() })))
      .resolves.toEqual({
        status: 422,
        body: expect.objectContaining({ error: expect.objectContaining({ code: "TURN_REJECTED", fallbackReason: "MODEL_REJECTED" }) }),
      });
    await expect(post(body(), unavailable).then(async (response) => ({ status: response.status, body: await response.json() })))
      .resolves.toEqual({
        status: 503,
        body: expect.objectContaining({ error: expect.objectContaining({ code: "TURN_UNAVAILABLE", fallbackReason: "MODEL_UNAVAILABLE" }) }),
      });
  });

  it("uses the 12s scenario deadline inside the 14s route boundary", async () => {
    vi.useFakeTimers();
    try {
      let started!: () => void;
      const startedPromise = new Promise<void>((resolve) => { started = resolve; });
      const slow: ScenarioAdapter = async (_call, signal) => new Promise((_, reject) => {
        started();
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      const responsePromise = post(body(), slow);
      await startedPromise;
      await vi.advanceTimersByTimeAsync(11_999);
      await vi.advanceTimersByTimeAsync(1);
      const response = await responsePromise;
      expect(TRANSFORM_ROUTE_TIMEOUT_MS).toBe(14_000);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        error: expect.objectContaining({ code: "TURN_UNAVAILABLE", fallbackReason: "MODEL_TIMEOUT" }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a disconnected caller's abort while aborting the provider flight", async () => {
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const observedAbort = vi.fn();
    const adapter: ScenarioAdapter = async (_call, signal) => new Promise((_, reject) => {
      started();
      signal.addEventListener("abort", () => {
        observedAbort();
        reject(signal.reason);
      }, { once: true });
    });
    const controller = new AbortController();
    const request = new Request("https://matter.test/api/turn", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    const pending = handleTransformRequest(request, adapter);
    await startedPromise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(observedAbort).toHaveBeenCalledOnce();
  });
});

function parsedEnvelope() {
  return body();
}

function body(overrides: Record<string, unknown> = {}) {
  const start = TEXT.indexOf(PASSAGE);
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: "transform/2",
    id: "turn_route",
    treeId: "tree_route",
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: 3,
    selection: { type: "segment-range", nodeId: "thought", start, end: start + PASSAGE.length, selectedText: PASSAGE },
    gesture: { type: "stretch", axis: "vertical", amount: 0.5 },
    locale: "zh-CN",
    context: { lineage: [
      { id: "thought", text: TEXT, parentId: null, createdAt: TIME, updatedAt: TIME },
    ] },
    ...overrides,
  };
}

async function post(
  payload: unknown,
  adapter: Parameters<typeof handleTransformRequest>[1] = fixtureTransformAdapter,
  headers: Record<string, string> = {},
): Promise<Response> {
  try {
    return await handleTransformRequest(new Request("https://matter.test/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }), adapter);
  } catch (error) {
    return transformErrorResponse(error);
  }
}
