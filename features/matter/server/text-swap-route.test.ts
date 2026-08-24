import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TEXT_SWAP_REQUEST_BYTES, parseTextSwapEnvelope, parseTextSwapPlan } from "../protocol/text-swap-contract";
import type { ScenarioAdapter, ScenarioCall } from "./harness";
import type { MaterialTurnObservationOptions } from "./material-turn-observation";
import { resetTransformAdmissionForTests } from "./transform-admission";
import { fixtureTextSwapAdapter } from "./text-swap-provider";
import {
  TEXT_SWAP_ROUTE_TIMEOUT_MS,
  handleTextSwapRequest,
  resetTextSwapGovernor,
  textSwapErrorResponse,
} from "./text-swap-route";

const TIME = "2026-08-20T00:00:00.000Z";
const TEXT = "我听见，房间慢慢安静下来。";
const PASSAGE = "房间慢慢安静下来";
const DIRECTION = "换一种更清楚但保留安静感的说法";

beforeEach(() => {
  resetTransformAdmissionForTests();
  resetTextSwapGovernor();
});

describe("text swap route", () => {
  it("runs exact fixture input through text-only model output and a server-built plan", async () => {
    const observe = vi.fn();
    const response = await post(body(), fixtureTextSwapAdapter, {}, { observe });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const parsedRequest = parseTextSwapEnvelope(body());
    if (!parsedRequest.ok) throw new Error("route fixture must parse");
    const plan = parseTextSwapPlan(await response.json(), parsedRequest.envelope);
    expect(plan).not.toBeNull();
    expect(plan?.action).toMatchObject({
      type: "replace-text-range",
      nodeId: "thought",
      intent: "paraphrase",
    });
    expect(plan?.presentation).toEqual({ motionHint: "settle" });
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "paraphrase-in-place",
      outcome: "success",
      reason: "NONE",
      locale: "zh-CN",
      amountBucket: "tool-owned",
    }));
    const routineReceipt = JSON.stringify(observe.mock.calls[0]?.[0]);
    expect(routineReceipt).not.toContain(PASSAGE);
    expect(routineReceipt).not.toContain(DIRECTION);
    expect(routineReceipt).not.toContain("swap_route");
  });

  it("gives the provider ancestors only and represents the selected passage once", async () => {
    let call: ScenarioCall | undefined;
    const adapter: ScenarioAdapter = async (candidate) => {
      call = candidate;
      return { text: "屋里渐渐恢复了安静" };
    };
    expect((await post(body(), adapter)).status).toBe(200);
    expect((call?.input as { lineage: unknown }).lineage).toEqual([]);
    expect(call?.prompt.match(new RegExp(PASSAGE, "gu"))?.length).toBe(1);
    expect(call?.prompt.match(new RegExp(DIRECTION, "gu"))?.length).toBe(1);
  });

  it("rejects unknown, legacy, and oversized request shapes before model work", async () => {
    const adapter = vi.fn(fixtureTextSwapAdapter);
    const observe = vi.fn();
    expect((await post({ ...body(), voice: { transcript: DIRECTION } }, adapter, {}, { observe })).status).toBe(400);
    expect((await post({ ...body(), gesture: { type: "stretch" } }, adapter)).status).toBe(400);
    expect((await post({ ...body(), requestVersion: "transform/2" }, adapter)).status).toBe(400);
    expect((await post(body(), adapter, { "content-length": String(MAX_TEXT_SWAP_REQUEST_BYTES + 1) })).status).toBe(413);
    expect(adapter).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "paraphrase-in-place",
      outcome: "invalid",
      reason: "INVALID_REQUEST",
      locale: "unknown",
    }));
  });

  it("maps no provider and rejected output without constructing a plan", async () => {
    const observe = vi.fn();
    const fallbackLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unavailable = await post(body(), null, {}, { observe });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "TURN_UNAVAILABLE", retryable: true, fallbackReason: "MODEL_UNAVAILABLE" },
    });
    const rejected = await post(body(), async () => ({ text: PASSAGE }), {}, { observe });
    expect(rejected.status).toBe(422);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "TURN_REJECTED", retryable: true, fallbackReason: "MODEL_REJECTED" },
    });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(observe.mock.calls.map(([receipt]) => [receipt.outcome, receipt.reason])).toEqual([
      ["unavailable", "MODEL_UNAVAILABLE"],
      ["rejected", "NO_CHANGE"],
    ]);
    expect(fallbackLog).not.toHaveBeenCalled();
    fallbackLog.mockRestore();
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
      await vi.advanceTimersByTimeAsync(12_000);
      const response = await responsePromise;
      expect(TEXT_SWAP_ROUTE_TIMEOUT_MS).toBe(14_000);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { fallbackReason: "MODEL_TIMEOUT" },
      });
      expect(observe).toHaveBeenCalledOnce();
      expect(observe).toHaveBeenCalledWith(expect.objectContaining({
        outcome: "timeout",
        reason: "MODEL_TIMEOUT",
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates caller cancellation while aborting the provider flight", async () => {
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
    const request = new Request("https://matter.test/api/text-swap", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    const pending = handleTextSwapRequest(request, adapter, { observe });
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

function body(overrides: Record<string, unknown> = {}) {
  const start = TEXT.indexOf(PASSAGE);
  return {
    protocolVersion: "0.2",
    requestVersion: "text-swap/2",
    id: "swap_route",
    treeId: "tree_route",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 3,
    selection: { type: "segment-range", nodeId: "thought", start, end: start + PASSAGE.length, selectedText: PASSAGE },
    direction: { text: DIRECTION },
    locale: "zh-CN",
    context: { lineage: [
      { id: "thought", text: TEXT, parentId: null, createdAt: TIME, updatedAt: TIME },
    ] },
    ...overrides,
  };
}

async function post(
  payload: unknown,
  adapter: Parameters<typeof handleTextSwapRequest>[1] = fixtureTextSwapAdapter,
  headers: Record<string, string> = {},
  observationOptions: MaterialTurnObservationOptions = {},
): Promise<Response> {
  try {
    return await handleTextSwapRequest(new Request("https://matter.test/api/text-swap", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }), adapter, observationOptions);
  } catch (error) {
    return textSwapErrorResponse(error);
  }
}
