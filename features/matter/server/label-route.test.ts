import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  LABEL_CLIENT_TIMEOUT_MS,
  MAX_LABEL_REQUEST_BYTES,
  isLabelSuccess,
  parseLabelRequest,
} from "./label-contract";
import { handleLabelRequest, labelErrorResponse } from "./label-route";
import { resetLabelGeneratorState } from "./label-generator";

const BODY = {
  protocolVersion: PROTOCOL_VERSION,
  promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
  operationId: "operation-1",
  basis: { treeId: "tree-1", nodeId: "node-1", revision: 2 },
  locale: "zh-CN",
  maxGraphemes: 9,
  text: "呃，我觉得我们怀念的其实不是过去，而是那个过去仍然允许我们想象的生活。",
  reference: { siblingLabels: ["模型调用成本"] },
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/matter/api/label", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function respond(request: Request): Promise<Response> {
  try {
    return await handleLabelRequest(request);
  } catch (error) {
    return labelErrorResponse(error);
  }
}

beforeEach(() => resetLabelGeneratorState());
afterEach(() => resetLabelGeneratorState());

describe("label route", () => {
  it("answers a valid request with an echoing success envelope", async () => {
    const response = await respond(post(BODY));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = (await response.json()) as unknown;
    expect(isLabelSuccess(payload, BODY)).toBe(true);
  });

  it("rejects a non-JSON content type", async () => {
    const response = await respond(post(BODY, { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("rejects an oversized declared length", async () => {
    const response = await respond(
      post(BODY, { "content-length": String(MAX_LABEL_REQUEST_BYTES + 1) }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects a body that exceeds the bound while streaming", async () => {
    const response = await respond(
      post({ ...BODY, text: "长".repeat(MAX_LABEL_REQUEST_BYTES) }),
    );
    expect(response.status).toBe(413);
  });

  it("cancels a body that never finishes within the route deadline", async () => {
    vi.useFakeTimers();
    try {
      const cancelled = vi.fn();
      const request = new Request("https://example.test/matter/api/label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
          cancel: cancelled,
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const pending = respond(request);
      await vi.advanceTimersByTimeAsync(LABEL_CLIENT_TIMEOUT_MS);
      const response = await pending;
      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "LABEL_FAILED", retryable: true },
      });
      expect(cancelled).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed JSON", async () => {
    const response = await respond(post("{"));
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string; retryable: boolean } };
    expect(payload.error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
  });

  it("rejects a malformed content length", async () => {
    const response = await respond(post(BODY, { "content-length": "not-a-number" }));
    expect(response.status).toBe(400);
  });

  it("rejects a request with no body", async () => {
    const response = await respond(new Request("https://example.test/matter/api/label", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
  });

  it("rejects a body that is not valid UTF-8", async () => {
    const response = await respond(new Request("https://example.test/matter/api/label", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0x7b, 0xff, 0xfe]),
    }));
    expect(response.status).toBe(400);
  });

  it("reports an unknown failure as a retryable server error", async () => {
    const response = labelErrorResponse(new Error("something internal"));
    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: { code: string; retryable: boolean } };
    expect(payload.error).toMatchObject({ code: "LABEL_FAILED", retryable: true });
    expect(JSON.stringify(payload)).not.toContain("something internal");
  });

  it("never reports a provider detail", async () => {
    const response = await respond(post("{"));
    expect(await response.text()).not.toMatch(/stack|Error:|provider/iu);
  });
});

describe("request parsing", () => {
  it("accepts the canonical body", () => {
    const parsed = parseLabelRequest(BODY);
    expect(parsed.ok).toBe(true);
  });

  const rejections: ReadonlyArray<readonly [string, unknown]> = [
    ["a non-object", "string"],
    ["an unknown field", { ...BODY, extra: 1 }],
    ["a wrong protocol version", { ...BODY, protocolVersion: "0.1" }],
    ["a wrong prompt version", { ...BODY, promptVersion: "thought-label/0" }],
    ["an empty operation id", { ...BODY, operationId: "" }],
    ["a negative revision", { ...BODY, basis: { ...BODY.basis, revision: -1 } }],
    ["a fractional revision", { ...BODY, basis: { ...BODY.basis, revision: 1.5 } }],
    ["an extra basis field", { ...BODY, basis: { ...BODY.basis, extra: 1 } }],
    ["an invalid locale", { ...BODY, locale: "not a locale" }],
    ["a bound below the floor", { ...BODY, maxGraphemes: 1 }],
    ["a bound above the ceiling", { ...BODY, maxGraphemes: 999 }],
    ["blank material", { ...BODY, text: "   " }],
    ["material beyond the node bound", { ...BODY, text: "x".repeat(2_001) }],
    ["too many siblings", { ...BODY, reference: { siblingLabels: Array.from({ length: 9 }, () => "x") } }],
    ["a non-string sibling", { ...BODY, reference: { siblingLabels: [1] } }],
    ["an unknown reference field", { ...BODY, reference: { unexpected: "x" } }],
  ];

  it.each(rejections)("rejects %s", (_name, value) => {
    expect(parseLabelRequest(value).ok).toBe(false);
  });
});

describe("success recognition", () => {
  const success = {
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    operationId: BODY.operationId,
    basis: BODY.basis,
    label: "想象的生活",
    source: "model",
  };

  it("accepts an exact echo", () => {
    expect(isLabelSuccess(success, BODY)).toBe(true);
  });

  it("refuses an answer for a different operation, node, or revision", () => {
    expect(isLabelSuccess({ ...success, operationId: "other" }, BODY)).toBe(false);
    expect(isLabelSuccess({ ...success, basis: { ...BODY.basis, nodeId: "other" } }, BODY)).toBe(false);
    expect(isLabelSuccess({ ...success, basis: { ...BODY.basis, revision: 3 } }, BODY)).toBe(false);
  });

  it("refuses an unknown source or fallback reason", () => {
    expect(isLabelSuccess({ ...success, source: "guess" }, BODY)).toBe(false);
    expect(isLabelSuccess({ ...success, fallbackReason: "WHY" }, BODY)).toBe(false);
  });
});
