import { beforeEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { MAX_TRANSFORM_REQUEST_BYTES, parseTransformEnvelope, parseTransformPlan } from "../protocol/transform-contract";
import { resetTransformAdmissionForTests } from "./transform-admission";
import { fixtureTransformAdapter } from "./transform-provider";
import { handleTransformRequest, resetTransformGovernor, transformErrorResponse } from "./transform-route";

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
    await expect(post(body(), fixtureTransformAdapter, { "content-type": "text/plain" }).then((response) => response.status)).resolves.toBe(415);
    await expect(post(body(), fixtureTransformAdapter, { "content-length": String(MAX_TRANSFORM_REQUEST_BYTES + 1) }).then((response) => response.status)).resolves.toBe(413);
  });
});

function parsedEnvelope() {
  const payload = body();
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: payload.id,
    treeId: payload.treeId,
    mode: "transform",
    treeRevision: payload.treeRevision,
    selection: payload.selection,
    gesture: payload.gesture,
    voice: payload.voice,
    context: payload.context,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  const start = TEXT.indexOf(PASSAGE);
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "turn_route",
    treeId: "tree_route",
    mode: "transform",
    treeRevision: 3,
    selection: { type: "segment-range", nodeId: "thought", start, end: start + PASSAGE.length, selectedText: PASSAGE },
    gesture: { type: "stretch", axis: "vertical", amount: 0.5 },
    voice: { transcript: "说得更具体一点", language: "zh-CN" },
    context: { lineage: [
      { id: "document", text: "", parentId: null, createdAt: TIME, updatedAt: TIME },
      { id: "thought", text: TEXT, parentId: "document", createdAt: TIME, updatedAt: TIME },
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
