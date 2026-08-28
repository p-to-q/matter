import { beforeEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  MAX_INQUIRY_ANSWER_CODE_POINTS,
  MAX_INQUIRY_REQUEST_BYTES,
} from "../protocol/inquiry-contract";
import { handleInquiryRequest, inquiryErrorResponse } from "./inquiry-route";
import { resetInquiryAdmissionForTests } from "./inquiry-admission";

beforeEach(resetInquiryAdmissionForTests);

describe("inquiry route", () => {
  it("returns an honest unavailable result with a context receipt", async () => {
    const response = await post(body(), {}, null);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      protocolVersion: PROTOCOL_VERSION,
      basis: { requestId: "inquiry_route_test", treeId: "tree_inquiry", revision: 3, scope: "tree" },
      status: "unavailable",
      reason: "NO_PROVIDER",
      receipt: { scope: "tree", lineageNodes: 2, contextCodePoints: 8, clipped: false, thoughtCount: 7 },
    });
  });

  it("returns only validated model text and keeps the receipt server-owned", async () => {
    const response = await post(body(), {}, async () => ({ text: "  它怀念的是仍然能够想象其他生活的余地。  " }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocolVersion: PROTOCOL_VERSION,
      basis: { requestId: "inquiry_route_test", treeId: "tree_inquiry", revision: 3, scope: "tree" },
      status: "answered",
      text: "它怀念的是仍然能够想象其他生活的余地。",
      receipt: { scope: "tree", lineageNodes: 2, contextCodePoints: 8, clipped: false, thoughtCount: 7 },
    });
  });

  it("returns one complete maximum answer and refuses one code point more", async () => {
    const complete = "🎉".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS);
    const accepted = await post(body(), {}, async () => ({ text: complete }));
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ status: "answered", text: complete });

    const refused = await post(body(), {}, async () => ({
      text: "答".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS + 1),
    }));
    expect(refused.status).toBe(503);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    const refusalText = await refused.text();
    expect(refusalText).not.toContain("答".repeat(MAX_INQUIRY_ANSWER_CODE_POINTS));
    expect(JSON.parse(refusalText)).toEqual({
      error: {
        code: "INQUIRY_FAILED",
        message: "Matter could not answer just now.",
        retryable: true,
        fallbackReason: "MODEL_REJECTED",
      },
    });
  });

  it("maps provider failure without exposing provider details", async () => {
    const response = await post(body(), {}, async () => {
      throw new Error("qwen-secret-provider-detail");
    });
    expect(response.status).toBe(503);
    const raw = await response.text();
    expect(raw).not.toMatch(/qwen|provider|secret/iu);
    // The scenario outcome is named so a deployment can tell a stalled relay
    // from a refused answer. It is the same vocabulary label and repair
    // already publish, and it carries no provider message, status, or identity.
    expect((JSON.parse(raw) as { error: { fallbackReason?: string } }).error.fallbackReason)
      .toBe("MODEL_UNAVAILABLE");
  });

  it("propagates request cancellation through the route boundary to the provider", async () => {
    const controller = new AbortController();
    let providerAborted = false;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const pending = handleInquiryRequest(new Request("https://matter.test/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body()),
      signal: controller.signal,
    }), async (_call, signal) => await new Promise<Readonly<{ text: string }>>((_resolve, reject) => {
      providerStarted();
      signal.addEventListener("abort", () => {
        providerAborted = true;
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }));

    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(providerAborted).toBe(true);
  });

  it("distinguishes empty material and never echoes the question", async () => {
    const secret = "这句话不应该出现在回应里";
    const empty = await post(body({
      question: secret,
      context: { ...body().context, lineage: [], thoughtCount: 0 },
    }));
    const payload = await empty.json();
    expect(payload).toMatchObject({ reason: "NO_MATERIAL" });
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  it("keeps an emptied explicit selection narrow instead of rejecting or widening it", async () => {
    const response = await post(body({
      context: {
        ...body().context,
        scope: "selection",
        lineage: [],
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      basis: { scope: "selection" },
      status: "unavailable",
      reason: "NO_MATERIAL",
      receipt: { scope: "selection", lineageNodes: 0, thoughtCount: 7 },
    });
  });

  it("rejects invalid shape, media type, and declared oversize", async () => {
    await expect(post(body({ question: " " })).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body({ locale: "en-GB" })).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body({ extra: true })).then((response) => response.status)).resolves.toBe(400);
    await expect(post(body(), { "content-type": "text/plain" }).then((response) => response.status))
      .resolves.toBe(415);
    await expect(post(body(), { "content-length": String(MAX_INQUIRY_REQUEST_BYTES + 1) })
      .then((response) => response.status)).resolves.toBe(413);
    await expect(post(body({
      context: {
        ...body().context,
        lineage: Array.from({ length: 9 }, (_, index) => ({
          nodeId: `node_${index}`,
          depth: index,
          text: "文".repeat(480),
          truncated: false,
        })),
      },
    })).then((response) => response.status)).resolves.toBe(400);
  });
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "inquiry_route_test",
    question: "这份材料在讲什么？",
    locale: "zh-CN",
    context: {
      treeId: "tree_inquiry",
      revision: 3,
      scope: "tree",
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
  headers: Record<string, string> = {},
  adapter?: Parameters<typeof handleInquiryRequest>[1],
): Promise<Response> {
  try {
    return await handleInquiryRequest(new Request("https://matter.test/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }), adapter);
  } catch (error) {
    return inquiryErrorResponse(error);
  }
}
