import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { MAX_INQUIRY_REQUEST_BYTES } from "./inquiry-contract";
import { handleInquiryRequest, inquiryErrorResponse } from "./inquiry-route";

describe("inquiry route", () => {
  it("answers with a stated reason and a real receipt, never with prose", async () => {
    const response = await post(body());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      reason: "NO_PROVIDER",
      receipt: { lineageNodes: 2, contextCodePoints: 8, clipped: false, thoughtCount: 7 },
    });
  });

  it("separates an empty document from a missing model", async () => {
    const response = await post(body({ context: { ...body().context, lineage: [], thoughtCount: 0 } }));

    await expect(response.json()).resolves.toMatchObject({ reason: "NO_MATERIAL" });
  });

  it("reports a clipped context rather than hiding the clip", async () => {
    const response = await post(body({ context: { ...body().context, clipped: true } }));

    await expect(response.json()).resolves.toMatchObject({ receipt: { clipped: true } });
  });

  it("refuses a body that is not JSON of the right shape", async () => {
    await expect(post("{").then((response) => response.status)).resolves.toBe(400);
    await expect(post(body({ question: "   " })).then((r) => r.status)).resolves.toBe(400);
    await expect(post(body({ protocolVersion: "0.1" })).then((r) => r.status)).resolves.toBe(400);
    await expect(post(body({ locale: "" })).then((r) => r.status)).resolves.toBe(400);
    // Well formed, but not a locale Matter speaks.
    await expect(post(body({ locale: "en-GB" })).then((r) => r.status)).resolves.toBe(400);
    await expect(post(body({ context: null })).then((r) => r.status)).resolves.toBe(400);
  });

  it("rejects malformed lineage identity and depth", async () => {
    const context = body().context;
    await expect(post(body({ context: { ...context, lineage: [
      { ...context.lineage[0], depth: 1 },
      context.lineage[1],
    ] } })).then((r) => r.status)).resolves.toBe(400);
    await expect(post(body({ context: { ...context, lineage: [
      context.lineage[0],
      { ...context.lineage[1], nodeId: context.lineage[0].nodeId },
    ] } })).then((r) => r.status)).resolves.toBe(400);
    await expect(post(body({ context: { ...context, lineage: [], thoughtCount: 1 } })).then((r) => r.status)).resolves.toBe(400);
  });

  it("refuses a foreign media type and an oversized body", async () => {
    const plain = await post(body(), { "content-type": "text/plain" });
    expect(plain.status).toBe(415);

    const oversized = await post(body(), { "content-length": String(MAX_INQUIRY_REQUEST_BYTES + 1) });
    expect(oversized.status).toBe(413);
  });

  // A stream may lie about its length, so the real bound is enforced while reading.
  it("refuses an oversized body that did not declare itself", async () => {
    const huge = JSON.stringify({ padding: "x".repeat(MAX_INQUIRY_REQUEST_BYTES + 64) });
    const response = await post(huge, { "content-length": null });

    expect(response.status).toBe(413);
  });

  it("keeps an unknown failure inside the one stable envelope", async () => {
    const response = inquiryErrorResponse(new Error("provider stack trace"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INQUIRY_FAILED", message: "The inquiry could not be answered.", retryable: true },
    });
  });

  it("never echoes the question back", async () => {
    const secret = "这句话不应该出现在回应里";
    const response = await post(body({ question: secret }));

    expect(JSON.stringify(await response.json())).not.toContain(secret);
  });
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    question: "这份材料在讲什么？",
    locale: "zh-CN",
    context: {
      treeId: "tree_inquiry",
      revision: 3,
      thoughtCount: 7,
      clipped: false,
      lineage: [
        { nodeId: "root", depth: 0, text: "根材料", truncated: false },
        { nodeId: "child", depth: 1, text: "子材料内容", truncated: false },
      ],
    },
    ...overrides,
  };
}

async function post(
  payload: unknown,
  headers: Record<string, string | null> = {},
): Promise<Response> {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  const merged: Record<string, string> = { "content-type": "application/json" };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  try {
    return await handleInquiryRequest(new Request("https://matter.test/api/inquiry", {
      method: "POST",
      headers: merged,
      body: text,
    }));
  } catch (error) {
    return inquiryErrorResponse(error);
  }
}
