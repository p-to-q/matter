import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { MAX_TRANSFORM_REQUEST_BYTES, parseTransformEnvelope, parseTransformPlan } from "../protocol/transform-contract";
import type { ScenarioAdapter, ScenarioCall } from "./harness";
import type { MaterialTurnObservationOptions } from "./material-turn-observation";
import { resetTransformAdmissionForTests } from "./transform-admission";
import { fixtureTransformAdapter } from "./transform-provider";
import { TRANSFORM_ROUTE_TIMEOUT_MS, handleTransformRequest, resetTransformGovernor, transformErrorResponse } from "./transform-route";

const TIME = "2026-08-11T00:00:00.000Z";
const TEXT = "我一直觉得，这件事可能没那么重要。";
const PASSAGE = "这件事可能没那么重要";
const SAME_ORIGIN = Object.freeze({
  origin: "https://matter.test",
  "sec-fetch-site": "same-origin",
});

beforeEach(() => {
  resetTransformAdmissionForTests();
  resetTransformGovernor();
});

describe("transform route", () => {
  it("runs a fixture through the strict envelope, model-text-only scenario, and server-owned plan", async () => {
    const observe = vi.fn();
    const response = await post(body(), fixtureTransformAdapter, {}, { observe });
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
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "expand-in-place",
      outcome: "success",
      reason: "NONE",
      locale: "zh-CN",
      amountBucket: "0.40-0.74",
      requestBytesBucket: expect.not.stringMatching("unknown"),
      responseBytesBucket: expect.not.stringMatching("none|unknown"),
    }));
    const routineReceipt = JSON.stringify(observe.mock.calls[0]?.[0]);
    expect(routineReceipt).not.toContain(PASSAGE);
    expect(routineReceipt).not.toContain("turn_route");
    expect(routineReceipt).not.toContain("tree_route");
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
    const observations = vi.fn();
    const fallbackLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(post(body(), rejected, {}, { observe: observations }).then(async (response) => ({ status: response.status, body: await response.json() })))
      .resolves.toEqual({
        status: 422,
        body: expect.objectContaining({ error: expect.objectContaining({ code: "TURN_REJECTED", fallbackReason: "MODEL_REJECTED" }) }),
      });
    await expect(post(body(), unavailable, {}, { observe: observations }).then(async (response) => ({ status: response.status, body: await response.json() })))
      .resolves.toEqual({
        status: 503,
        body: expect.objectContaining({ error: expect.objectContaining({ code: "TURN_UNAVAILABLE", fallbackReason: "MODEL_UNAVAILABLE" }) }),
      });
    expect(observations).toHaveBeenCalledTimes(2);
    expect(observations.mock.calls.map(([receipt]) => [receipt.outcome, receipt.reason])).toEqual([
      ["rejected", "NO_CHANGE"],
      ["unavailable", "MODEL_UNAVAILABLE"],
    ]);
    expect(fallbackLog).not.toHaveBeenCalled();
    fallbackLog.mockRestore();
  });

  it("records invalid and admission terminals once without parsing identity fields", async () => {
    const observations = vi.fn();
    expect((await post({ ...body(), extra: true }, fixtureTransformAdapter, {}, { observe: observations })).status)
      .toBe(400);
    expect(observations).toHaveBeenCalledOnce();
    expect(observations).toHaveBeenLastCalledWith(expect.objectContaining({
      outcome: "invalid",
      reason: "INVALID_REQUEST",
      locale: "unknown",
    }));

    // The public perimeter only meters production; fixture and development
    // traffic shares one process and often no forwarded identity. Drive the
    // deployed path so the RATE terminal stays covered.
    vi.stubEnv("NODE_ENV", "production");
    try {
      for (let index = 0; index < 8; index += 1) {
        await post(body({ id: `turn_rate_${index}` }), fixtureTransformAdapter, SAME_ORIGIN, { observe: observations });
      }
      expect((await post(body({ id: "turn_rate_blocked" }), fixtureTransformAdapter, SAME_ORIGIN, { observe: observations })).status)
        .toBe(429);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(observations).toHaveBeenCalledTimes(10);
    expect(observations).toHaveBeenLastCalledWith(expect.objectContaining({
      outcome: "admission",
      reason: "RATE",
      locale: "unknown",
      requestBytesBucket: "unknown",
      responseBytesBucket: expect.not.stringMatching("none|unknown"),
    }));
  });

  it("uses the 12s scenario deadline inside the 14s route boundary", async () => {
    vi.useFakeTimers();
    try {
      const observe = vi.fn();
      let started!: () => void;
      const startedPromise = new Promise<void>((resolve) => { started = resolve; });
      const slow: ScenarioAdapter = async (_call, signal) => new Promise((_, reject) => {
        started();
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      const responsePromise = post(body(), slow, {}, { observe });
      await startedPromise;
      await vi.advanceTimersByTimeAsync(11_999);
      await vi.advanceTimersByTimeAsync(1);
      const response = await responsePromise;
      expect(TRANSFORM_ROUTE_TIMEOUT_MS).toBe(14_000);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        error: expect.objectContaining({ code: "TURN_UNAVAILABLE", fallbackReason: "MODEL_TIMEOUT" }),
      }));
      expect(observe).toHaveBeenCalledOnce();
      expect(observe).toHaveBeenCalledWith(expect.objectContaining({
        outcome: "timeout",
        reason: "MODEL_TIMEOUT",
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("records governor shedding as one busy terminal while admitted calls finish normally", async () => {
    const observe = vi.fn();
    let bothStarted!: () => void;
    const started = new Promise<void>((resolve) => { bothStarted = resolve; });
    const releases: Array<() => void> = [];
    const slow: ScenarioAdapter = async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve);
        if (releases.length === 2) bothStarted();
      });
      return { text: "这件事在眼下这个时刻可能没那么显得重要" };
    };
    const first = post(body({ id: "turn_busy_1" }), slow, {}, { observe });
    const second = post(body({ id: "turn_busy_2" }), slow, {}, { observe });
    await started;
    const shed = await post(body({ id: "turn_busy_3" }), slow, {}, { observe });
    expect(shed.status).toBe(503);
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({
      outcome: "busy",
      reason: "MODEL_BUSY",
    }));

    for (const release of releases) release();
    await Promise.all([first, second]);
    expect(observe).toHaveBeenCalledTimes(3);
    expect(observe.mock.calls.map(([receipt]) => receipt.outcome).sort()).toEqual([
      "busy",
      "success",
      "success",
    ]);
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
    const observe = vi.fn();
    const request = new Request("https://matter.test/api/turn", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    const pending = handleTransformRequest(request, adapter, { observe });
    await startedPromise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(observedAbort).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "cancelled",
      reason: "CLIENT_CANCELLED",
      responseBytesBucket: "none",
    }));
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
  observationOptions: MaterialTurnObservationOptions = {},
): Promise<Response> {
  try {
    return await handleTransformRequest(new Request("https://matter.test/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }), adapter, observationOptions);
  } catch (error) {
    return transformErrorResponse(error);
  }
}
