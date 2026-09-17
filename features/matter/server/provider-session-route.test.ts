import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PROVIDER_SESSION_PROTOCOL_VERSION } from "../protocol/provider-session-contract";
import {
  PROVIDER_SESSION_COOKIE,
  PROVIDER_SESSION_GENERATION_COOKIE,
  PROVIDER_SESSION_TTL_MS,
  sealProviderCredential,
  unsealProviderCredential,
} from "./provider-session-crypto";
import {
  connectProviderSession,
  getProviderSessionStatus,
  removeProviderSession,
  resetProviderSessionAdmissionForTests,
} from "./provider-session-route";
import type { UserProviderSelection } from "./user-provider-registry";

const KEY = Buffer.alloc(32, 6).toString("base64url");
const NOW = Date.UTC(2026, 8, 11, 1, 0, 0);
const GENERATION_ID = Buffer.alloc(16, 7).toString("base64url");
const ENVIRONMENT = Object.freeze({
  MATTER_PROVIDER_SESSION_KEYS: `active:${KEY}`,
  MATTER_BASE_PATH: "/matter",
});
const PRODUCTION_ENVIRONMENT = Object.freeze({
  ...ENVIRONMENT,
  NODE_ENV: "production",
  MATTER_PUBLIC_ORIGIN: "https://matter.example",
});
const BODY = Object.freeze({
  protocolVersion: PROVIDER_SESSION_PROTOCOL_VERSION,
  action: "save" as const,
  endpoint: "https://api.openai.com/v1",
  apiKey: "sk-user-secret",
});
const OPENAI_SELECTION: UserProviderSelection = Object.freeze({
  profileId: "openai-current",
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
});

beforeEach(() => resetProviderSessionAdmissionForTests());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonRequest(method: "POST" | "DELETE", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://matter.example/matter/api/provider-session", {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function completion(text = "MATTER_READY", finishReason: string | null | undefined = "stop"): Response {
  return new Response(JSON.stringify({
    choices: [{
      ...(finishReason === undefined ? {} : { finish_reason: finishReason }),
      message: { content: text },
    }],
  }), { headers: { "content-type": "application/json" } });
}

function anthropicCompletion(text = "MATTER_READY", stopReason = "end_turn"): Response {
  return new Response(JSON.stringify({
    type: "message",
    content: [{ type: "text", text }],
    stop_reason: stopReason,
  }), { headers: { "content-type": "application/json" } });
}

function modelList(...ids: string[]): Response {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    headers: { "content-type": "application/json" },
  });
}

function sameOriginRequest(method: "POST" | "DELETE", body?: unknown): Request {
  return jsonRequest(method, body, {
    origin: "https://matter.example",
    "sec-fetch-site": "same-origin",
    "x-forwarded-for": "203.0.113.8",
  });
}

describe("provider-session route", () => {
  it("is safely unavailable without a valid sealing ring", async () => {
    const response = await getProviderSessionStatus(new Request("https://matter.example/matter/api/provider-session"), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: "4",
      available: false,
      credentialPresent: false,
      resetRequired: false,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    });
    const connect = await connectProviderSession(jsonRequest("POST", BODY), {}, NOW);
    expect(connect.status).toBe(503);
    expect(connect.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the implicit initial generation write-free on a fresh status read", async () => {
    const status = await getProviderSessionStatus(
      new Request("https://matter.example/matter/api/provider-session"),
      ENVIRONMENT,
      NOW,
    );
    expect(await status.json()).toMatchObject({
      available: true,
      credentialPresent: false,
    });
    expect(status.headers.getSetCookie()).toHaveLength(0);
  });

  it("reports a malformed generation without rewriting it and recovers only through explicit remove", async () => {
    const status = await getProviderSessionStatus(new Request(
      "https://matter.example/matter/api/provider-session",
      { headers: { cookie: `${PROVIDER_SESSION_GENERATION_COOKIE}=malformed` } },
    ), ENVIRONMENT, NOW);

    expect(await status.json()).toEqual({
      protocolVersion: "4",
      available: true,
      credentialPresent: false,
      resetRequired: true,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    });
    expect(status.headers.getSetCookie()).toHaveLength(0);

    const reset = removeProviderSession(sameOriginRequest("DELETE"), ENVIRONMENT, NOW + 1);
    expect(await reset.json()).toMatchObject({
      credentialPresent: false,
      resetRequired: false,
    });
    expect(reset.headers.getSetCookie()).toContainEqual(
      expect.stringContaining(`${PROVIDER_SESSION_GENERATION_COOKIE}=`),
    );
  });

  it("fails closed without mutating cookies when a non-initial generation is absent", async () => {
    const sealed = sealProviderCredential(
      OPENAI_SELECTION,
      BODY.apiKey,
      GENERATION_ID,
      ENVIRONMENT,
      NOW,
    )!;
    const response = await getProviderSessionStatus(new Request(
      "https://matter.example/matter/api/provider-session",
      { headers: { cookie: `${PROVIDER_SESSION_COOKIE}=${sealed.token}` } },
    ), ENVIRONMENT, NOW + 1);

    expect(await response.json()).toMatchObject({
      credentialPresent: false,
      resetRequired: false,
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("performs exactly one official sentinel before issuing a v4 HttpOnly cookie", async () => {
    const calls: Array<Readonly<{ url: string; body: Record<string, unknown>; authorization: string | null }>> = [];
    const provider = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(Object.freeze({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: new Headers(init?.headers).get("authorization"),
      }));
      return completion();
    });
    const response = await connectProviderSession(
      jsonRequest("POST", BODY),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
    expect(calls[0]).toMatchObject({
      url: "https://api.openai.com/v1/chat/completions",
      authorization: "Bearer sk-user-secret",
      body: { model: "gpt-4.1-mini", max_completion_tokens: 12 },
    });
    expect(JSON.stringify(calls[0]!.body)).toContain("MATTER_READY");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${PROVIDER_SESSION_COOKIE}=v4.active.`);
    expect(cookie).toContain("Path=/matter/api");
    const payload = await response.json();
    expect(payload).toEqual({
      protocolVersion: "4",
      available: true,
      credentialPresent: true,
      resetRequired: false,
      credentialId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/u),
      endpoint: "https://api.openai.com/v1",
      expiresAt: new Date(NOW + PROVIDER_SESSION_TTL_MS).toISOString(),
    });
    expect(JSON.stringify(payload)).not.toContain(BODY.apiKey);
  });

  it("keeps a stale status response incapable of erasing a later accepted save", async () => {
    const staleStatus = await getProviderSessionStatus(new Request(
      "https://matter.example/matter/api/provider-session",
      { headers: { cookie: `${PROVIDER_SESSION_COOKIE}=v4.invalid` } },
    ), ENVIRONMENT, NOW);
    const saved = await connectProviderSession(
      jsonRequest("POST", BODY),
      ENVIRONMENT,
      NOW + 1,
      async () => completion(),
    );

    expect(saved.status).toBe(200);
    expect(saved.headers.getSetCookie()).toContainEqual(
      expect.stringContaining(`${PROVIDER_SESSION_COOKIE}=v4.active.`),
    );
    expect(staleStatus.headers.getSetCookie()).toHaveLength(0);
  });

  it("supports the reviewed Anthropic wire format without exposing profile or key", async () => {
    let observed: Readonly<Record<string, unknown>> = {};
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, endpoint: "https://api.anthropic.com" }),
      ENVIRONMENT,
      NOW,
      async (url, init) => {
        observed = Object.freeze({
          url: String(url),
          body: JSON.parse(String(init?.body)) as unknown,
          apiKey: new Headers(init?.headers).get("x-api-key"),
          version: new Headers(init?.headers).get("anthropic-version"),
        });
        return anthropicCompletion();
      },
    );
    expect(response.status).toBe(200);
    expect(observed).toMatchObject({
      url: "https://api.anthropic.com/v1/messages",
      apiKey: BODY.apiKey,
      version: "2023-06-01",
      body: { model: "claude-fable-5", max_tokens: 12 },
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      credentialPresent: true,
      endpoint: "https://api.anthropic.com/v1",
    });
    expect(JSON.stringify(payload)).not.toContain(BODY.apiKey);
    expect(JSON.stringify(payload)).not.toContain("claude-fable-5");
  });

  it("tests explicitly without writing or replacing a cookie", async () => {
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, action: "test" }),
      ENVIRONMENT,
      NOW,
      async () => completion(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: "4",
      verified: true,
      endpoint: "https://api.openai.com/v1",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not externalize an omitted key when no credential is saved", async () => {
    const provider = vi.fn<typeof fetch>(async () => completion());
    const response = await connectProviderSession(jsonRequest("POST", {
      protocolVersion: "4",
      action: "save",
      endpoint: "https://api.openai.com/v1",
    }), ENVIRONMENT, NOW, provider);
    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reads saved state without any external request or sliding renewal", async () => {
    const sealed = sealProviderCredential(
      OPENAI_SELECTION,
      BODY.apiKey,
      GENERATION_ID,
      ENVIRONMENT,
      NOW,
    )!;
    const external = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", external);
    const response = await getProviderSessionStatus(new Request(
      "https://matter.example/matter/api/provider-session",
      { headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
      ].join("; ") } },
    ), ENVIRONMENT, NOW + 7 * 24 * 60 * 60_000);
    expect(response.status).toBe(200);
    expect(external).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({
      credentialPresent: true,
      endpoint: OPENAI_SELECTION.baseUrl,
      expiresAt: new Date(NOW + PROVIDER_SESSION_TTL_MS).toISOString(),
    });
  });

  it.each(["test", "save"] as const)(
    "%s reuses a saved key only for the exact canonical endpoint",
    async (action) => {
      const sealed = sealProviderCredential(
        OPENAI_SELECTION,
        BODY.apiKey,
        GENERATION_ID,
        ENVIRONMENT,
        NOW,
      )!;
      const provider = vi.fn<typeof fetch>(async () => completion());
      const response = await connectProviderSession(jsonRequest("POST", {
        protocolVersion: "4",
        action,
        endpoint: OPENAI_SELECTION.baseUrl,
      }, { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
      ].join("; ") }), ENVIRONMENT, NOW + 1, provider);
      expect(response.status).toBe(200);
      expect(provider).toHaveBeenCalledOnce();
      expect(new Headers(provider.mock.calls[0]![1]?.headers).get("authorization"))
        .toBe(`Bearer ${BODY.apiKey}`);
      expect(response.headers.has("set-cookie")).toBe(action === "save");
    },
  );

  it("requires the key again before sending it to a changed endpoint", async () => {
    const sealed = sealProviderCredential(
      OPENAI_SELECTION,
      BODY.apiKey,
      GENERATION_ID,
      ENVIRONMENT,
      NOW,
    )!;
    const provider = vi.fn<typeof fetch>(async () => completion());
    const response = await connectProviderSession(jsonRequest("POST", {
      protocolVersion: "4",
      action: "test",
      endpoint: "https://api.deepseek.com",
    }, { cookie: [
      `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
      `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
    ].join("; ") }), ENVIRONMENT, NOW + 1, provider);
    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("leaves the previous credential untouched when a replacement save fails", async () => {
    const sealed = sealProviderCredential(
      OPENAI_SELECTION,
      BODY.apiKey,
      GENERATION_ID,
      ENVIRONMENT,
      NOW,
    )!;
    const response = await connectProviderSession(jsonRequest("POST", {
      ...BODY,
      endpoint: "https://api.deepseek.com",
      apiKey: "replacement-secret",
    }, { cookie: [
      `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
      `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
    ].join("; ") }), ENVIRONMENT, NOW + 1, async () => (
      new Response(null, { status: 401 })
    ));
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(unsealProviderCredential(sealed.token, ENVIRONMENT, NOW + 1)).toMatchObject({
      apiKey: BODY.apiKey,
      baseUrl: OPENAI_SELECTION.baseUrl,
    });
  });

  it("uses at most two discovery reads and exactly one custom sentinel", async () => {
    const operations: Array<Readonly<{ method: string; url: string }>> = [];
    const provider = vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET";
      operations.push(Object.freeze({ method, url: String(url) }));
      if (method === "GET") {
        return new Headers(init?.headers).has("authorization")
          ? modelList("deepseek-flash")
          : new Response(null, { status: 404 });
      }
      return completion();
    });
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, endpoint: "https://mirror.vendor.ai/gateway" }),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(200);
    expect(operations.filter(({ method }) => method === "GET")).toHaveLength(2);
    expect(operations.filter(({ method }) => method === "POST")).toEqual([{
      method: "POST",
      url: "https://mirror.vendor.ai/gateway/chat/completions",
    }]);
    const token = response.headers.get("set-cookie")!.match(/=([^;]+)/u)?.[1];
    expect(token).toBeDefined();
    expect(unsealProviderCredential(token!, ENVIRONMENT, NOW)).toMatchObject({
      profileId: "deepseek-compatible",
      model: "deepseek-flash",
      baseUrl: "https://mirror.vendor.ai/gateway",
    });
  });

  it("accepts a catalog model outside Matter's built-in provider aliases after the sentinel proves it", async () => {
    const operations: string[] = [];
    const provider = vi.fn<typeof fetch>(async (url, init) => {
      operations.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (init?.method === "GET") {
        return new Headers(init.headers).has("authorization")
          ? modelList("text-embedding-4-small", "acme-chat-mini")
          : new Response(null, { status: 404 });
      }
      return completion();
    });
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, endpoint: "https://mirror.vendor.ai/v1" }),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(200);
    expect(operations).toEqual([
      "GET https://mirror.vendor.ai/v1/models",
      "GET https://mirror.vendor.ai/v1/models",
      "POST https://mirror.vendor.ai/v1/chat/completions",
    ]);
    const token = response.headers.get("set-cookie")!.match(/=([^;]+)/u)?.[1];
    expect(unsealProviderCredential(token!, ENVIRONMENT, NOW)).toMatchObject({
      profileId: "openai-compatible",
      model: "acme-chat-mini",
      baseUrl: "https://mirror.vendor.ai/v1",
    });
  });

  it("tries at most one proved candidate per compatible wire format", async () => {
    const sentinels: Array<Readonly<{ url: string; anthropic: boolean }>> = [];
    const provider = vi.fn<typeof fetch>(async (url, init) => {
      const headers = new Headers(init?.headers);
      if (init?.method === "GET") {
        return headers.has("authorization")
          ? modelList("vendor-chat-mini")
          : modelList("claude-vendor-small");
      }
      const anthropic = headers.has("x-api-key");
      sentinels.push(Object.freeze({ url: String(url), anthropic }));
      return anthropic ? anthropicCompletion() : new Response(null, { status: 400 });
    });
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, endpoint: "https://mirror.vendor.ai/v1" }),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(200);
    expect(sentinels).toEqual([
      { url: "https://mirror.vendor.ai/v1/chat/completions", anthropic: false },
      { url: "https://mirror.vendor.ai/v1/messages", anthropic: true },
    ]);
    const token = response.headers.get("set-cookie")!.match(/=([^;]+)/u)?.[1];
    expect(unsealProviderCredential(token!, ENVIRONMENT, NOW)).toMatchObject({
      profileId: "anthropic-compatible",
      model: "claude-vendor-small",
    });
  });

  it("does not spend a sentinel when discovery exposes only non-text models", async () => {
    const provider = vi.fn<typeof fetch>(async () => modelList("text-embedding-4-small", "audio-realtime"));
    const response = await connectProviderSession(
      jsonRequest("POST", { ...BODY, endpoint: "https://mirror.vendor.ai/v1" }),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(502);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not broaden an explicit completion path after sentinel failure", async () => {
    const provider = vi.fn<typeof fetch>(async (_url, init) => (
      init?.method === "GET"
        ? modelList("gpt-4.1-mini")
        : new Response(null, { status: 401 })
    ));
    const response = await connectProviderSession(
      jsonRequest("POST", {
        ...BODY,
        endpoint: "https://mirror.vendor.ai/v1/chat/completions",
      }),
      ENVIRONMENT,
      NOW,
      provider,
    );
    expect(response.status).toBe(502);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("settles a stalled official sentinel at its bounded attempt deadline", async () => {
    vi.useFakeTimers();
    const provider = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
        once: true,
      });
    }));
    const pending = connectProviderSession(jsonRequest("POST", BODY), ENVIRONMENT, NOW, provider);
    await vi.advanceTimersByTimeAsync(2_500);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(provider).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([" MATTER_READY", "MATTER_READY\n", "\tMATTER_READY\r\n"])(
    "accepts harmless whitespace around the sentinel (%j)",
    async (answer) => {
      const response = await connectProviderSession(
        jsonRequest("POST", BODY),
        ENVIRONMENT,
        NOW,
        async () => completion(answer),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain(`${PROVIDER_SESSION_COOKIE}=v4.active.`);
    },
  );

  it.each(["MATTER_READY!", "MATTER READY", "prefix MATTER_READY"])(
    "rejects additional sentinel content (%j)",
    async (answer) => {
      const response = await connectProviderSession(
        jsonRequest("POST", BODY),
        ENVIRONMENT,
        NOW,
        async () => completion(answer),
      );
      expect(response.status).toBe(502);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each([
    ["missing", undefined],
    ["null", null],
    ["unknown", "future_state"],
    ["foreign complete", "end_turn"],
  ] as const)("rejects an OpenAI sentinel with a %s terminator", async (_name, terminator) => {
    const response = await connectProviderSession(
      jsonRequest("POST", BODY),
      ENVIRONMENT,
      NOW,
      async () => terminator === undefined
        ? new Response(JSON.stringify({
          choices: [{ message: { content: "MATTER_READY" } }],
        }), { headers: { "content-type": "application/json" } })
        : completion("MATTER_READY", terminator),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["created status", 201, "application/json"],
    ["partial status", 206, "application/json"],
    ["non-JSON media", 200, "text/plain"],
  ] as const)("does not issue a cookie for %s", async (_name, responseStatus, contentType) => {
    const response = await connectProviderSession(
      jsonRequest("POST", BODY),
      ENVIRONMENT,
      NOW,
      async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "MATTER_READY" } }],
      }), { status: responseStatus, headers: { "content-type": contentType } }),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns only non-secret status and removes the lease with the same narrow path", async () => {
    const sealed = sealProviderCredential(
      OPENAI_SELECTION,
      BODY.apiKey,
      GENERATION_ID,
      ENVIRONMENT,
      NOW,
    )!;
    const request = new Request("https://matter.example/matter/api/provider-session", {
      headers: { cookie: [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
      ].join("; ") },
    });
    const response = await getProviderSessionStatus(request, ENVIRONMENT, NOW + 1);
    const text = await response.text();
    expect(text).not.toContain(BODY.apiKey);
    expect(text).toContain(OPENAI_SELECTION.baseUrl);
    expect(text).not.toContain(OPENAI_SELECTION.model);
    expect(JSON.parse(text)).toEqual({
      protocolVersion: "4",
      available: true,
      credentialPresent: true,
      resetRequired: false,
      credentialId: sealed.credential.scopeId,
      endpoint: "https://api.openai.com/v1",
      expiresAt: new Date(NOW + PROVIDER_SESSION_TTL_MS).toISOString(),
    });

    const removed = removeProviderSession(jsonRequest("DELETE"), ENVIRONMENT);
    expect(await removed.json()).toEqual({
      protocolVersion: "4",
      available: true,
      credentialPresent: false,
      resetRequired: false,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    });
    expect(removed.headers.get("set-cookie")).toContain("Path=/matter/api");
    expect(removed.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it.each([
    ["old v2", `${PROVIDER_SESSION_COOKIE}=v2.active.invalid.invalid.invalid`],
    ["old v3", `${PROVIDER_SESSION_COOKIE}=v3.active.invalid.invalid.invalid`],
    ["malformed", `${PROVIDER_SESSION_COOKIE}=v4.invalid`],
    ["expired", (() => {
      const sealed = sealProviderCredential(
        OPENAI_SELECTION,
        BODY.apiKey,
        GENERATION_ID,
        ENVIRONMENT,
        NOW,
      )!;
      return [
        `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
        `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
      ].join("; ");
    })()],
  ])("fails a %s cookie closed without allowing a stale GET to mutate it", async (kind, cookie) => {
    const now = kind === "expired" ? NOW + PROVIDER_SESSION_TTL_MS : NOW;
    const response = await getProviderSessionStatus(new Request(
      "https://matter.example/matter/api/provider-session",
      { headers: { cookie } },
    ), ENVIRONMENT, now);
    expect(await response.json()).toEqual({
      protocolVersion: "4",
      available: true,
      credentialPresent: false,
      resetRequired: false,
      credentialId: null,
      endpoint: null,
      expiresAt: null,
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("rejects cross-origin mutation before reading or probing a key", async () => {
    const probe = vi.fn(async () => completion());
    const response = await connectProviderSession(jsonRequest("POST", BODY, {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }), PRODUCTION_ENVIRONMENT, NOW, probe);
    expect(response.status).toBe(403);
    expect(probe).not.toHaveBeenCalled();

    const removed = removeProviderSession(jsonRequest("DELETE", undefined, {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }), PRODUCTION_ENVIRONMENT);
    expect(removed.status).toBe(403);
    expect(removed.headers.get("set-cookie")).toBeNull();
  });

  it("keeps same-origin removal available after the probe rate window is exhausted", async () => {
    for (let index = 0; index < 8; index += 1) {
      const response = await connectProviderSession(
        sameOriginRequest("POST", { invalid: index }),
        PRODUCTION_ENVIRONMENT,
        NOW,
      );
      expect(response.status).toBe(400);
    }
    const rateLimited = await connectProviderSession(
      sameOriginRequest("POST", BODY),
      PRODUCTION_ENVIRONMENT,
      NOW,
      async () => completion(),
    );
    expect(rateLimited.status).toBe(429);
    const removed = removeProviderSession(sameOriginRequest("DELETE"), PRODUCTION_ENVIRONMENT);
    expect(removed.status).toBe(200);
    expect(removed.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps removal outside the occupied probe lane and makes every older save unusable", async () => {
    const releases: Array<(response: Response) => void> = [];
    const checks = Array.from({ length: 3 }, () => connectProviderSession(
      sameOriginRequest("POST", BODY),
      PRODUCTION_ENVIRONMENT,
      NOW,
      async () => new Promise<Response>((resolve) => releases.push(resolve)),
    ));
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    const removed = removeProviderSession(
      sameOriginRequest("DELETE"),
      PRODUCTION_ENVIRONMENT,
      NOW + 1,
    );
    expect(removed.status).toBe(200);
    const removalCookies = removed.headers.getSetCookie();
    expect(removalCookies).toHaveLength(2);
    const generationCookie = removalCookies.find((cookie) => (
      cookie.startsWith(`${PROVIDER_SESSION_GENERATION_COOKIE}=`)
    ));
    expect(generationCookie).toBeDefined();
    for (const release of releases) release(completion());
    const olderSaves = await Promise.all(checks);
    for (const response of olderSaves) {
      expect(response.status).toBe(200);
      const credentialCookie = response.headers.getSetCookie().find((cookie) => (
        cookie.startsWith(`${PROVIDER_SESSION_COOKIE}=`)
      ));
      expect(credentialCookie).toBeDefined();
      const replay = new Request("https://matter.example/matter/api/provider-session", {
        headers: { cookie: [credentialCookie!, generationCookie!]
          .map((cookie) => cookie.split(";", 1)[0])
          .join("; ") },
      });
      const statusAfterLateSave = await getProviderSessionStatus(
        replay,
        PRODUCTION_ENVIRONMENT,
        NOW + 2,
      );
      expect(await statusAfterLateSave.json()).toMatchObject({ credentialPresent: false });
      expect(statusAfterLateSave.headers.getSetCookie()).toHaveLength(0);
    }
  });
});
