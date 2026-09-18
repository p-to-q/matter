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
      "claude-haiku-4-5-20251001",
      "https://api.anthropic.com/v1",
    ))).toMatchObject({ station: "user-anthropic", model: "claude-haiku-4-5-20251001" });
    expect(createUserPoolCandidate(credential(
      "gemini-openai-current",
      "gemini-2.5-flash",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    ))).toMatchObject({ station: "user-gemini", model: "gemini-2.5-flash" });
    expect(createUserPoolCandidate(credential(
      "openai-responses-current",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))).toMatchObject({ station: "user-openai", model: "gpt-4.1-mini" });
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
    expect(createUserPoolCandidate(credential(
      "openai-responses-compatible",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))).toBeNull();
    // Official ownership is operation-scoped: DeepSeek owns Responses on its
    // root, but a separately proved Chat-compatible wire on that same base is
    // not rejected merely because another operation has an official profile.
    expect(createUserPoolCandidate(credential(
      "openai-compatible",
      "vendor-chat-small",
      "https://api.deepseek.com",
    ))).toMatchObject({ station: "user-openai", model: "vendor-chat-small" });
    // A lease sealed before the official Anthropic model policy changed must
    // fail closed instead of silently continuing to spend against Fable.
    expect(createUserPoolCandidate(credential(
      "anthropic-current",
      "claude-fable-5",
      "https://api.anthropic.com/v1",
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
    ["https://api.openai.com/v1/responses", "openai-responses-current", "gpt-4.1-mini", "https://api.openai.com/v1"],
    ["https://api.deepseek.com/responses", "deepseek-responses-current", "deepseek-flash", "https://api.deepseek.com"],
    ["https://api.deepseek.com/v1/responses", "deepseek-responses-current", "deepseek-flash", "https://api.deepseek.com/v1"],
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

  it.each([
    ["https://api.anthropic.com", ["claude-fable-5", "claude-sonnet-5", "claude-haiku-4-6"], "claude-haiku-4-6"],
    ["https://api.anthropic.com/v1/messages", ["claude-fable-5", "claude-sonnet-5"], "claude-sonnet-5"],
  ] as const)("discovers the least costly reviewed Anthropic family before its sentinel (%s)", async (
    endpoint,
    models,
    selectedModel,
  ) => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/models");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe(API_KEY);
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      return json({ data: models.map((id) => ({ id })) });
    });
    await expect(resolveUserProviderSelections(
      endpoint,
      API_KEY,
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([{
      profileId: "anthropic-current",
      model: selectedModel,
      baseUrl: "https://api.anthropic.com/v1",
    }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not fall back to an expensive Anthropic family when Haiku and Sonnet are unavailable", async () => {
    await expect(resolveUserProviderSelections(
      "https://api.anthropic.com",
      API_KEY,
      new AbortController().signal,
      vi.fn(async () => json({ data: [{ id: "claude-fable-5" }, { id: "claude-opus-5" }] })),
    )).resolves.toEqual([]);
  });

  it("recognizes Google's documented OpenAI-compatible base through Bearer model discovery", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
      return json({ data: [
        { id: "text-embedding-004" },
        { id: "gemini-2.5-flash-live" },
        { id: "gemini-2.5-flash-omni" },
        { id: "gemini-2.5-flash-tts" },
        { id: "gemini-2.5-flash-image" },
        { id: "gemini-2.5-flash-audio" },
        { id: "gemini-2.5-flash-transcribe" },
        { id: "gemini-2.5-flash-transcription" },
        { id: "gemini-2.5-flash-speech" },
        { id: "gemini-2.5-flash-embedding" },
        { id: "gemini-2.5-pro" },
        { id: "gemini-2.5-flash" },
      ] });
    });
    await expect(resolveUserProviderSelections(
      "https://generativelanguage.googleapis.com/v1beta/openai",
      API_KEY,
      new AbortController().signal,
      fetchMock,
    )).resolves.toEqual([{
      profileId: "gemini-openai-current",
      model: "gemini-2.5-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("chooses a stable Gemini Flash deterministically and rejects non-text Flash variants", async () => {
    const badModels = [
      "gemini-2.5-flash-live",
      "gemini-2.5-flash-omni",
      "gemini-2.5-flash-tts",
      "gemini-2.5-flash-image",
      "gemini-2.5-flash-audio",
      "gemini-2.5-flash-transcribe",
      "gemini-2.5-flash-transcription",
      "gemini-2.5-flash-speech",
      "gemini-2.5-flash-embedding",
    ];
    await expect(resolveUserProviderSelections(
      "https://generativelanguage.googleapis.com/v1beta/openai",
      API_KEY,
      new AbortController().signal,
      vi.fn(async () => json({ data: badModels.map((id) => ({ id })) })),
    )).resolves.toEqual([]);

    await expect(resolveUserProviderSelections(
      "https://generativelanguage.googleapis.com/v1beta/openai",
      API_KEY,
      new AbortController().signal,
      vi.fn(async () => json({ data: [
        { id: "gemini-3.1-flash-lite" },
        { id: "gemini-3-flash" },
      ] })),
    )).resolves.toEqual([]);

    await expect(resolveUserProviderSelections(
      "https://generativelanguage.googleapis.com/v1beta/openai",
      API_KEY,
      new AbortController().signal,
      vi.fn(async () => json({ data: [{ id: "gemini-2.5-flash-lite" }] })),
    )).resolves.toEqual([{
      profileId: "gemini-openai-current",
      model: "gemini-2.5-flash-lite",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    }]);

    for (const models of [
      ["gemini-3-flash-preview", "gemini-2.0-flash", "gemini-2.5-flash"],
      ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3-flash-preview"],
    ]) {
      await expect(resolveUserProviderSelections(
        "https://generativelanguage.googleapis.com/v1beta/openai",
        API_KEY,
        new AbortController().signal,
        vi.fn(async () => json({ data: models.map((id) => ({ id })) })),
      )).resolves.toEqual([{
        profileId: "gemini-openai-current",
        model: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      }]);
    }
  });

  it.each([
    "https://generativelanguage.googleapis.com.evil.example.net",
    "https://generativelanguage.googleapis.com/v1beta/openai-extra",
  ])("does not alias a nearby Google host or path (%s)", async (endpoint) => {
    const calls: string[] = [];
    await expect(resolveUserProviderSelections(
      endpoint,
      API_KEY,
      new AbortController().signal,
      vi.fn(async (url) => {
        calls.push(String(url));
        return new Response(null, { status: 404 });
      }),
    )).resolves.toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls).not.toContain("https://generativelanguage.googleapis.com/v1beta/openai/models");
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
      [{ id: "claude-haiku-4-5-20251001" }],
      "anthropic-compatible",
      "https://mirror.vendor.ai/gateway/v1/models",
    ],
    [
      "https://mirror.vendor.ai/v1/responses",
      [{ id: "gpt-4.1-mini" }],
      "openai-responses-compatible",
      "https://mirror.vendor.ai/v1/models",
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
      const settled = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(2_250);
      await settled;
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a proved catalog selection when sibling discovery consumes the shared deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>((url, init) => {
        const headers = new Headers(init?.headers);
        if (
          String(url) === "https://mirror.vendor.ai/gateway/models" &&
          headers.has("authorization")
        ) {
          return Promise.resolve(json({ data: [{ id: "vendor-chat-mini" }] }));
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(
            new DOMException("Aborted", "AbortError"),
          ), { once: true });
        });
      });
      const pending = resolveUserProviderSelections(
        "https://mirror.vendor.ai/gateway",
        API_KEY,
        new AbortController().signal,
        fetchMock,
      );
      const settled = expect(pending).resolves.toEqual([{
        profileId: "openai-compatible",
        model: "vendor-chat-mini",
        baseUrl: "https://mirror.vendor.ai/gateway",
      }]);

      await vi.advanceTimersByTimeAsync(2_250);
      await settled;
      expect(fetchMock).toHaveBeenCalledTimes(3);
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
      store: false,
      messages: [{ role: "user", content: "bounded prompt" }],
    });
    expect(openai.transport!.parseCompletion({
      choices: [{ finish_reason: "stop", message: { content: "answer" } }],
    })).toEqual({ content: "answer", disposition: "complete" });

    const compatible = createUserPoolCandidate(credential(
      "openai-compatible",
      "vendor-chat-small",
      "https://mirror.vendor.ai/v1",
    ))!;
    expect(compatible.transport!.serialize(call, 24, compatible.model)).not.toHaveProperty("store");

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
    expect(deepseek.transport!.serialize(call, 24, deepseek.model)).not.toHaveProperty("store");

    const anthropic = createUserPoolCandidate(credential(
      "anthropic-current",
      "claude-haiku-4-5-20251001",
      "https://api.anthropic.com/v1",
    ))!;
    expect(anthropic.transport!.completionUrl(anthropic.baseUrl)).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropic.transport!.authHeaders(API_KEY)).toEqual({
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    });
    expect(anthropic.transport!.serialize(call, 24, anthropic.model)).toEqual({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 24,
      temperature: 0,
      stream: false,
      messages: [{ role: "user", content: "bounded prompt" }],
    });
    expect(anthropic.transport!.parseCompletion({
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "answer" }],
      stop_reason: "end_turn",
    })).toEqual({ content: "answer", disposition: "complete" });
    expect(() => anthropic.transport!.parseCompletion({
      type: "message",
      role: "assistant",
      content: [{ type: "future", text: "answer" }],
      stop_reason: "end_turn",
    })).toThrow(/unsupported/u);
    expect(anthropic.transport!.parseCompletion({
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "partial" }],
      stop_reason: "model_context_window_exceeded",
    })).toEqual({ content: "partial", disposition: "truncated" });
    expect(() => anthropic.transport!.parseCompletion({
      type: "message",
      role: "user",
      content: [{ type: "text", text: "answer" }],
      stop_reason: "end_turn",
    })).toThrow(/envelope was invalid/u);

    const gemini = createUserPoolCandidate(credential(
      "gemini-openai-current",
      "gemini-2.5-flash",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    ))!;
    expect(gemini.transport!.completionUrl(gemini.baseUrl))
      .toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(gemini.transport!.authHeaders(API_KEY)).toEqual({ authorization: `Bearer ${API_KEY}` });
    expect(gemini.transport!.serialize(call, 24, gemini.model)).toEqual({
      model: "gemini-2.5-flash",
      temperature: 0,
      max_tokens: 24,
      stream: false,
      reasoning_effort: "none",
      messages: [{ role: "user", content: "bounded prompt" }],
    });
  });

  it("uses Responses only for an explicit operation URL and parses one completed assistant text", async () => {
    const baseFetch = vi.fn<typeof fetch>(async (_url, init) => (
      init?.method === "GET"
        ? json({ data: [{ id: "vendor-chat-mini" }] })
        : json({ choices: [{ finish_reason: "stop", message: { content: "answer" } }] })
    ));
    const baseSelections = await resolveUserProviderSelections(
      "https://mirror.vendor.ai/v1",
      API_KEY,
      new AbortController().signal,
      baseFetch,
    );
    expect(baseSelections[0]?.profileId).toBe("openai-compatible");
    expect(baseSelections.every(({ profileId }) => !profileId.includes("responses"))).toBe(true);
    expect(baseFetch.mock.calls.every(([url]) => !String(url).endsWith("/responses"))).toBe(true);

    const responseFetch = vi.fn<typeof fetch>(async () => json({
      data: [{ id: "vendor-chat-mini" }],
    }));
    const responseSelections = await resolveUserProviderSelections(
      "https://mirror.vendor.ai/v1/responses",
      API_KEY,
      new AbortController().signal,
      responseFetch,
    );
    expect(responseSelections).toEqual([{
      profileId: "openai-responses-compatible",
      model: "vendor-chat-mini",
      baseUrl: "https://mirror.vendor.ai/v1",
    }]);
    expect(responseFetch).toHaveBeenCalledOnce();

    const responses = createUserPoolCandidate(credential(
      "openai-responses-compatible",
      "vendor-chat-mini",
      "https://mirror.vendor.ai/v1",
    ))!;
    expect(responses.transport!.completionUrl(responses.baseUrl))
      .toBe("https://mirror.vendor.ai/v1/responses");
    expect(responses.transport!.serialize(call, 24, responses.model)).toEqual({
      model: "vendor-chat-mini",
      input: "bounded prompt",
      max_output_tokens: 24,
      stream: false,
      store: false,
    });
    expect(responses.transport!.parseCompletion({
      object: "response",
      status: "completed",
      error: null,
      incomplete_details: null,
      output: [{
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "answer", annotations: [] }],
      }],
    })).toEqual({ content: "answer", disposition: "complete" });

    const deepseekResponses = createUserPoolCandidate(credential(
      "deepseek-responses-current",
      "deepseek-flash",
      "https://api.deepseek.com",
    ))!;
    expect(deepseekResponses.transport!.serialize(call, 24, deepseekResponses.model)).toEqual({
      model: "deepseek-flash",
      input: "bounded prompt",
      max_output_tokens: 24,
      temperature: 0,
      stream: false,
      store: false,
      reasoning: { effort: "none" },
    });
    expect(deepseekResponses.transport!.parseCompletion({
      object: "response",
      status: "completed",
      error: null,
      incomplete_details: null,
      output: [{
        type: "reasoning",
        status: "completed",
        content: [{ type: "reasoning_text", text: "private transport detail" }],
      }, {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "answer" }],
      }],
    })).toEqual({ content: "answer", disposition: "complete" });
  });

  it.each([
    [
      "incomplete",
      {
        object: "response",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      },
      { content: undefined, disposition: "truncated" },
    ],
    [
      "failed",
      { object: "response", status: "failed", output: [] },
      { content: undefined, disposition: "blocked-or-refused" },
    ],
    [
      "tool-only",
      {
        object: "response",
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [{ type: "function_call", name: "other", arguments: "{}" }],
      },
      null,
    ],
    [
      "refusal",
      {
        object: "response",
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [{
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "no" }],
        }],
      },
      { content: undefined, disposition: "complete", unusable: "blocked-or-refused" },
    ],
    [
      "empty text",
      {
        object: "response",
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [{
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "  " }],
        }],
      },
      { content: undefined, disposition: "complete" },
    ],
  ] as const)("rejects a Responses API %s envelope", (_name, payload, expected) => {
    const responses = createUserPoolCandidate(credential(
      "openai-responses-current",
      "gpt-4.1-mini",
      "https://api.openai.com/v1",
    ))!;
    if (expected === null) {
      expect(() => responses.transport!.parseCompletion(payload)).toThrow(/ambiguous message set/u);
    } else {
      expect(responses.transport!.parseCompletion(payload)).toEqual(expected);
    }
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
