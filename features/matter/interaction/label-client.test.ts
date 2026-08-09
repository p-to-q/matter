import { afterEach, describe, expect, it, vi } from "vitest";
import { SEMANTIC_LABEL_PROMPT_VERSION } from "../material/semantic-label";
import { MAX_LABEL_RESPONSE_BYTES } from "../protocol/label-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import { LabelClientError, requestLabel } from "./label-client";

const BASIS = { treeId: "tree-1", nodeId: "node-1", revision: 4 };

const SUCCESS = {
  protocolVersion: PROTOCOL_VERSION,
  promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
  operationId: "op-1",
  basis: BASIS,
  label: "想象的生活",
  source: "model",
};

function request(overrides: Partial<Parameters<typeof requestLabel>[0]> = {}) {
  return requestLabel({
    operationId: "op-1",
    basis: BASIS,
    locale: "zh-CN",
    maxGraphemes: 9,
    text: "呃，我觉得我们怀念的其实不是过去，而是想象的生活。",
    reference: {},
    signal: new AbortController().signal,
    ...overrides,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("requestLabel", () => {
  it("accepts an exactly echoed success envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(SUCCESS)));
    await expect(request()).resolves.toMatchObject({ label: "想象的生活", source: "model" });
  });

  it("sends the versioned envelope to the Matter base path", async () => {
    const fetchMock = vi.fn(async () => Response.json(SUCCESS));
    vi.stubGlobal("fetch", fetchMock);
    await request();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/label$/u);
    expect(init.cache).toBe("no-store");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
      operationId: "op-1",
      basis: BASIS,
    });
  });

  it.each([
    ["a different operation", { ...SUCCESS, operationId: "other" }],
    ["a different node", { ...SUCCESS, basis: { ...BASIS, nodeId: "other" } }],
    ["a different revision", { ...SUCCESS, basis: { ...BASIS, revision: 5 } }],
    ["an unknown field", { ...SUCCESS, provider: "hidden" }],
    ["an empty label", { ...SUCCESS, label: "" }],
    ["an unknown source", { ...SUCCESS, source: "guess" }],
  ] as const)("rejects a response with %s", async (_name, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    await expect(request()).rejects.toMatchObject({ code: "LABEL_FAILED" });
  });

  it("maps a known error envelope and ignores an unknown code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "INVALID_REQUEST", message: "bad", retryable: false } },
      { status: 400 },
    )));
    await expect(request()).rejects.toEqual(new LabelClientError("INVALID_REQUEST", "bad", false));

    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "PROVIDER_SECRET", message: "secret", retryable: true } },
      { status: 500 },
    )));
    await expect(request()).rejects.toEqual(
      new LabelClientError("LABEL_FAILED", "The label could not be derived.", true),
    );
  });

  it("refuses a response beyond the size bound", async () => {
    const oversized = "x".repeat(MAX_LABEL_RESPONSE_BYTES + 1);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(oversized, {
      headers: { "content-type": "application/json" },
    })));
    await expect(request()).rejects.toMatchObject({ code: "LABEL_FAILED", retryable: false });
  });

  it("refuses a response that is not valid UTF-8", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0xff, 0xfe]))));
    await expect(request()).rejects.toMatchObject({ code: "LABEL_FAILED" });
  });

  it("times out rather than waiting for a stalled endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await expect(request({ timeoutMs: 20 })).rejects.toMatchObject({ code: "LABEL_FAILED" });
  });

  it("propagates caller cancellation instead of reporting a failure", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = request({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(LabelClientError);
  });

  it("reports an unreachable endpoint as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await expect(request()).rejects.toMatchObject({ code: "LABEL_UNAVAILABLE", retryable: true });
  });
});
