import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ScenarioCall } from "./harness";
import { createPoolAdapter, DEFAULT_POOL_LIMITS, resetPoolHealth } from "./model-pool";
import {
  createUserPoolCandidate,
  resolveUserProviderSelections,
  validateUserProviderRegistry,
  type UserProviderCandidateCredential,
  type UserProviderProfileId,
} from "./user-provider-registry";

const call: ScenarioCall = Object.freeze({
  scenario: "matter-inquiry",
  prompt: "bounded prompt",
  locale: "en-US",
  input: null,
  deadlineMs: 1_000,
  maxOutputTokens: 30,
});
const API_KEY = "opaque-private-key";
const SCOPE = "A".repeat(22);

function credential(
  profileId: UserProviderProfileId,
  model: string,
  baseUrl: string,
): UserProviderCandidateCredential {
  return Object.freeze({ profileId, model, baseUrl, apiKey: API_KEY, scopeId: SCOPE });
}

function json(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

beforeEach(() => resetPoolHealth());

describe("user-provider registry", () => {
  it("owns the complete finite profile registry", () => {
    expect(validateUserProviderRegistry()).toBe(true);
    expect(createUserPoolCandidate(credential(
      "openai-current",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))).toMatchObject({ station: "user-openai", model: "gpt-4.1-mini" });
    expect(createUserPoolCandidate(credential(
      "deepseek-current",
      "deepseek-flash",
      "https://api.deepseek.com/v1",
    ))).toMatchObject({ station: "user-deepseek", model: "deepseek-flash" });
    expect(createUserPoolCandidate(credential(
      "anthropic-current",
      "claude-fable-5",
      "https://api.anthropic.com/v1",
    ))).toMatchObject({ station: "user-anthropic", model: "claude-fable-5" });
    expect(createUserPoolCandidate(credential(
      "openai-compatible",
      "vendor-chat-small",
      "https://mirror.vendor.ai/v1",
    ))).toMatchObject({ station: "user-openai", model: "vendor-chat-small" });
  });

  it("rejects official mismatches, non-text custom models, and invalid scope IDs", () => {
    expect(createUserPoolCandidate(credential(
      "openai-current",
      "deepseek-flash",
      "https://api.openai.com/v1",
    ))).toBeNull();
    expect(createUserPoolCandidate(credential(
      "deepseek-compatible",
      "text-embedding-4-small",
      "https://mirror.vendor.ai/v1",
    ))).toBeNull();
    expect(createUserPoolCandidate(credential(
      "openai-compatible",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))).toBeNull();
    expect(createUserPoolCandidate({
      ...credential("openai-current", "gpt-4.1-mini", "https://api.openai.com/v1"),
      scopeId: "too-short",
    })).toBeNull();
  });

  it.each([
    ["https://api.openai.com/v1", "openai-current", "gpt-4.1-mini", "https://api.openai.com/v1"],
    ["https://api.openai.com/v1/chat/completions", "openai-current", "gpt-4.1-mini", "https://api.openai.com/v1"],
    ["https://api.deepseek.com", "deepseek-current", "deepseek-flash", "https://api.deepseek.com/v1"],
    ["https://api.deepseek.com/v1/chat/completions", "deepseek-current", "deepseek-flash", "https://api.deepseek.com/v1"],
    ["https://api.anthropic.com", "anthropic-current", "claude-fable-5", "https://api.anthropic.com/v1"],
    ["https://api.anthropic.com/v1/messages", "anthropic-current", "claude-fable-5", "https://api.anthropic.com/v1"],
  ] as const)("selects a reviewed official endpoint without discovery (%s)", async (
    endpoint,
    profileId,
    model,
    baseUrl,
  ) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(resolveUserProviderSelections(
      endpoint,
      API_KEY,
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([{ profileId, model, baseUrl }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the exact custom path first, with one bounded same-origin /v1 recovery", async () => {
    const releases: Array<(response: Response) => void> = [];
    const calls: Array<Readonly<{ url: string; authorization: string | null; anthropicKey: string | null }>> = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(Object.freeze({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
        anthropicKey: new Headers(init?.headers).get("x-api-key"),
      }));
      return await new Promise<Response>((resolve) => releases.push(resolve));
    });
    const pending = resolveUserProviderSelections(
      "https://mirror.vendor.ai/gateway",
      API_KEY,
      new AbortController().signal,
      fetchMock,
    );
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls).toEqual([
      {
        url: "https://mirror.vendor.ai/gateway/models",
        authorization: `Bearer ${API_KEY}`,
        anthropicKey: null,
      },
      {
        url: "https://mirror.vendor.ai/gateway/v1/models",
        authorization: `Bearer ${API_KEY}`,
        anthropicKey: null,
      },
      {
        url: "https://mirror.vendor.ai/gateway/v1/models",
        authorization: null,
        anthropicKey: API_KEY,
      },
    ]);
    releases[0]!(json({ data: [{ id: "gpt-4.1-mini" }] }));
    releases[1]!(new Response(null, { status: 404 }));
    releases[2]!(new Response(null, { status: 404 }));
    await expect(pending).resolves.toEqual([{
      profileId: "openai-compatible",
      model: "gpt-4.1-mini",
      baseUrl: "https://mirror.vendor.ai/gateway",
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses /v1 only when the exact OpenAI-compatible catalog cannot answer", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(`${String(url)}|${new Headers(init?.headers).has("authorization") ? "bearer" : "anthropic"}`);
      if (
        String(url) === "https://mirror.vendor.ai/gateway/v1/models" &&
        new Headers(init?.headers).has("authorization")
      ) return json({ data: [{ id: "vendor-chat-small" }] });
      return new Response(null, { status: 404 });
    });

    await expect(resolveUserProviderSelections(
      "https://mirror.vendor.ai/gateway",
      API_KEY,
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([{
      profileId: "openai-compatible",
      model: "vendor-chat-small",
      baseUrl: "https://mirror.vendor.ai/gateway/v1",
    }]);
    expect(calls).toEqual([
      "https://mirror.vendor.ai/gateway/models|bearer",
      "https://mirror.vendor.ai/gateway/v1/models|bearer",
      "https://mirror.vendor.ai/gateway/v1/models|anthropic",
    ]);
  });

  it.each([
    [
      "https://mirror.vendor.ai/v1/chat/completions",
      [{ id: "deepseek-flash" }],
      "deepseek-compatible",
      "https://mirror.vendor.ai/v1/models",
    ],
    [
      "https://mirror.vendor.ai/gateway/v1/messages",
      [{ id: "claude-fable-5" }],
      "anthropic-compatible",
      "https://mirror.vendor.ai/gateway/v1/models",
    ],
  ] as const)("uses an explicit operation path to bound discovery to one request (%s)", async (
    endpoint,
    data,
    profileId,
    discoveryUrl,
  ) => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ data }));
    await expect(resolveUserProviderSelections(
      endpoint,
      API_KEY,
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([expect.objectContaining({ profileId })]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(discoveryUrl);
  });

  it("selects deterministically from reviewed exact IDs and never infers from key prefixes", async () => {
    const modelList = json({
      data: [
        { id: "gpt-4.1-mini-preview" },
        { id: "deepseek-flash" },
        { id: "gpt-4.1-mini" },
      ],
    });
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => (
      new Headers(init?.headers).has("authorization")
        ? modelList.clone()
        : new Response(null, { status: 404 })
    ));
    await expect(resolveUserProviderSelections(
      "https://mirror.vendor.ai/v1",
      "sk-ant-key-that-does-not-identify-format",
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([{
      profileId: "openai-compatible",
      model: "gpt-4.1-mini",
      baseUrl: "https://mirror.vendor.ai/v1",
    }]);

    const broaderCatalog = vi.fn<typeof fetch>(async (_url, init) => (
      new Headers(init?.headers).has("authorization")
        ? json({ data: [{ id: "vendor-chat-small" }, { id: "text-embedding-4-small" }] })
        : new Response(null, { status: 404 })
    ));
    await expect(resolveUserProviderSelections(
      "https://mirror.vendor.ai/v1",
      "sk-openai-looking-but-opaque",
      new AbortController().signal,
      broaderCatalog,
    )).resolves.toEqual([{
      profileId: "openai-compatible",
      model: "vendor-chat-small",
      baseUrl: "https://mirror.vendor.ai/v1",
    }]);
    expect(broaderCatalog).toHaveBeenCalledTimes(2);

    const unsupported = vi.fn<typeof fetch>(async () => json({
      data: [{ id: "text-embedding-4-small" }, { id: "audio-realtime" }],
    }));
    await expect(resolveUserProviderSelections(
      "https://mirror.vendor.ai/v1",
      "sk-openai-looking-but-opaque",
      new AbortController().signal,
      unsupported,
    )).resolves.toEqual([]);
    expect(unsupported).toHaveBeenCalledTimes(2);
  });

  it("fails closed on an unbounded, malformed, or non-JSON model catalog", async () => {
    const cases: Array<() => Response> = [
      () => json({ data: Array.from({ length: 513 }, (_, index) => ({ id: `model-${index}` })) }),
      () => json({ data: [{ id: "gpt-4.1-mini", unexpected: true }, { id: 7 }] }),
      () => new Response(JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }), {
        headers: { "content-type": "text/plain" },
      }),
      () => new Response("{}", {
        headers: { "content-type": "application/json", "content-length": String(65 * 1_024) },
      }),
    ];
    for (const response of cases) {
      await expect(resolveUserProviderSelections(
        "https://mirror.vendor.ai/v1/chat/completions",
        API_KEY,
        new AbortController().signal,
        vi.fn(async () => response()),
      )).resolves.toEqual([]);
    }
  });

  it("cancels a stalled catalog body at the shared discovery deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    try {
      const pending = resolveUserProviderSelections(
        "https://mirror.vendor.ai/v1/chat/completions",
        API_KEY,
        new AbortController().signal,
        vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
          pull: () => new Promise(() => undefined),
          cancel,
        }), { headers: { "content-type": "application/json" } })),
      );
      const settled = expect(pending).resolves.toEqual([]);
      await vi.advanceTimersByTimeAsync(2_250);
      await settled;
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets each profile own URL, authentication, request, and strict response parsing", () => {
    const openai = createUserPoolCandidate(credential(
      "openai-current",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))!;
    expect(openai.transport!.completionUrl(openai.baseUrl)).toBe("https://api.openai.com/v1/chat/completions");
    expect(openai.transport!.authHeaders(API_KEY)).toEqual({ authorization: `Bearer ${API_KEY}` });
    expect(openai.transport!.serialize(call, 24, openai.model)).toEqual({
      model: "gpt-4.1-mini",
      temperature: 0,
      max_completion_tokens: 24,
      stream: false,
      messages: [{ role: "user", content: "bounded prompt" }],
    });
    expect(openai.transport!.parseCompletion({
      choices: [{ finish_reason: "stop", message: { content: "answer" } }],
    })).toEqual({ content: "answer", disposition: "complete" });

    const deepseek = createUserPoolCandidate(credential(
      "deepseek-current",
      "deepseek-flash",
      "https://api.deepseek.com/v1",
    ))!;
    expect(deepseek.transport!.serialize(call, 24, deepseek.model)).toMatchObject({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      max_tokens: 24,
    });

    const anthropic = createUserPoolCandidate(credential(
      "anthropic-current",
      "claude-fable-5",
      "https://api.anthropic.com/v1",
    ))!;
    expect(anthropic.transport!.completionUrl(anthropic.baseUrl)).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropic.transport!.authHeaders(API_KEY)).toEqual({
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    });
    expect(anthropic.transport!.serialize(call, 24, anthropic.model)).toEqual({
      model: "claude-fable-5",
      max_tokens: 24,
      temperature: 0,
      stream: false,
      messages: [{ role: "user", content: "bounded prompt" }],
    });
    expect(anthropic.transport!.parseCompletion({
      type: "message",
      content: [{ type: "text", text: "answer" }],
      stop_reason: "end_turn",
    })).toEqual({ content: "answer", disposition: "complete" });
    expect(() => anthropic.transport!.parseCompletion({
      type: "message",
      content: [{ type: "future", text: "answer" }],
      stop_reason: "end_turn",
    })).toThrow(/unsupported/u);
  });

  it.each([
    [undefined],
    [null],
    ["future_state"],
    ["end_turn"],
    ["stop"],
  ] as const)("requires an explicit compatible complete terminator (%s)", async (finishReason) => {
    const user = createUserPoolCandidate(credential(
      "openai-compatible",
      "gpt-4.1-mini",
      "https://mirror.vendor.ai/v1",
    ))!;
    const managed = {
      station: "managed",
      baseUrl: "https://managed.example/v1",
      apiKey: "managed-key",
      model: "managed-model",
    };
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [user, managed],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const requestModel = (JSON.parse(String(init?.body)) as { model: string }).model;
        tried.push(requestModel);
        const responseTerminator = requestModel === "managed-model" ? "stop" : finishReason;
        return json({
          choices: [{
            ...(responseTerminator === undefined ? {} : { finish_reason: responseTerminator }),
            message: { content: requestModel === "managed-model" ? "managed" : "user" },
          }],
        });
      },
    );
    const result = await adapter(call, new AbortController().signal);
    if (finishReason === "stop" || finishReason === "end_turn") {
      expect(result).toEqual({ text: "user" });
      expect(tried).toEqual(["gpt-4.1-mini"]);
    } else {
      expect(result).toEqual({ text: "managed" });
      expect(tried).toEqual(["gpt-4.1-mini", "managed-model"]);
    }
  });
});
