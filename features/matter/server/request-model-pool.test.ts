import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const publicFetches = vi.hoisted(() => ({
  chat: vi.fn<typeof fetch>(),
  anthropic: vi.fn<typeof fetch>(),
  models: vi.fn<typeof fetch>(),
}));
vi.mock("./public-provider-fetch", () => ({
  fetchPublicChatCompletions: publicFetches.chat,
  fetchPublicAnthropicMessages: publicFetches.anthropic,
  fetchPublicProviderModels: publicFetches.models,
}));

import { DEFAULT_POOL_LIMITS } from "./model-pool";
import { PROVIDER_SESSION_COOKIE, sealProviderCredential } from "./provider-session-crypto";
import {
  resolveRequestModelAdapter,
  resolveScenarioRequestModelAdapter,
} from "./request-model-pool";
import type { ScenarioAdapter } from "./harness";
import type { UserProviderSelection } from "./user-provider-registry";

const KEY = Buffer.alloc(32, 5).toString("base64url");
const ENVIRONMENT = Object.freeze({
  MATTER_PROVIDER_SESSION_KEYS: `active:${KEY}`,
  MATTER_MODEL_POOL: "managed",
  MATTER_MODEL_MANAGED_BASE_URL: "https://managed.example/v1",
  MATTER_MODEL_MANAGED_API_KEY: "managed-key",
  MATTER_MODEL_MANAGED_MODELS: "managed-model",
});

function sealedRequest(selection: UserProviderSelection = {
  profileId: "openai-current" as const,
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
}): Request {
  const sealed = sealProviderCredential(selection, "user-secret-key", ENVIRONMENT)!;
  return new Request("https://matter.example/matter/api/inquiry", {
    headers: { cookie: `${PROVIDER_SESSION_COOKIE}=${sealed.token}` },
  });
}

beforeEach(() => {
  publicFetches.chat.mockReset();
  publicFetches.anthropic.mockReset();
  publicFetches.models.mockReset();
});

describe("request model pool", () => {
  it.each([
    ["inquiry-route.ts", "matter-inquiry"],
    ["label-route.ts", "matter-thought-label"],
    ["repair-route.ts", "matter-transcript-repair"],
    ["transform-route.ts", "matter-transform"],
    ["text-swap-route.ts", "matter-text-swap"],
  ] as const)("wires %s to the exact request-local scenario gate", (file, scenario) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    expect(source).toContain(`resolveScenarioRequestModelAdapter(request, "${scenario}", {`);
    expect(source).toMatch(/adapter\?: ScenarioAdapter \| null/u);
    expect(source).toContain("adapter === undefined");
  });

  it.each([
    ["matter-transcript-repair", "MATTER_REPAIR_ADAPTER"],
    ["matter-thought-label", "MATTER_LABEL_ADAPTER"],
    ["matter-inquiry", "MATTER_INQUIRY_ADAPTER"],
  ] as const)("lets a user lease supply the public %s surface independently of its managed gate", (scenario, gate) => {
    const fallback: ScenarioAdapter = async () => ({ text: "fixture" });
    const closed = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, [gate]: "fixture" },
    });
    expect(closed.adapter).not.toBe(fallback);
    expect(closed.cacheScope).not.toBe("managed");

    const live = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, [gate]: "live" },
    });
    expect(live.adapter).not.toBe(fallback);
    expect(live.cacheScope).not.toBe("managed");
  });

  it("does not smuggle a disabled managed pool behind a public user-provider surface", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("{}", { status: 503 });
    }));
    try {
      const resolution = resolveScenarioRequestModelAdapter(sealedRequest(), "matter-inquiry", {
        fallback: null,
        limits: DEFAULT_POOL_LIMITS,
        environment: { ...ENVIRONMENT, MATTER_INQUIRY_ADAPTER: "fixture" },
      });
      await expect(resolution.adapter!({
        scenario: "matter-inquiry",
        prompt: "bounded fixture",
        locale: "en-US",
        input: null,
        deadlineMs: 3_000,
        maxOutputTokens: 20,
      }, new AbortController().signal)).rejects.toThrow();
      expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["matter-transform", "MATTER_TRANSFORM_ADAPTER"],
    ["matter-text-swap", "MATTER_TEXT_SWAP_ADAPTER"],
  ] as const)("keeps the private %s surface behind its product gate", (scenario, gate) => {
    const fallback: ScenarioAdapter = async () => ({ text: "fixture" });
    const closed = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, [gate]: "fixture" },
    });
    expect(closed).toEqual({ adapter: fallback, cacheScope: "managed" });

    const live = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, [gate]: "live" },
    });
    expect(live.adapter).not.toBe(fallback);
    expect(live.cacheScope).not.toBe("managed");
  });

  it.each([
    ["matter-transcript-repair", "MATTER_REPAIR_ADAPTER"],
    ["matter-thought-label", "MATTER_LABEL_ADAPTER"],
    ["matter-inquiry", "MATTER_INQUIRY_ADAPTER"],
    ["matter-transform", "MATTER_TRANSFORM_ADAPTER"],
    ["matter-text-swap", "MATTER_TEXT_SWAP_ADAPTER"],
  ] as const)("tries the user lease before managed fallback for %s", async (scenario, gate) => {
    const calls: Array<Readonly<{ url: string; authorization: string | null }>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(Object.freeze({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
      }));
      if (String(url).startsWith("https://api.openai.com/")) {
        return new Response("{}", { status: 503 });
      }
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "managed answer" } }],
      }), { headers: { "content-type": "application/json" } });
    }));
    try {
      const resolution = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
        fallback: null,
        limits: DEFAULT_POOL_LIMITS,
        environment: { ...ENVIRONMENT, [gate]: "live" },
      });
      await expect(resolution.adapter!({
        scenario,
        prompt: "bounded fixture",
        locale: "en-US",
        input: null,
        deadlineMs: 3_000,
        maxOutputTokens: 20,
      }, new AbortController().signal)).resolves.toEqual({ text: "managed answer" });
      expect(calls).toEqual([
        {
          url: "https://api.openai.com/v1/chat/completions",
          authorization: "Bearer user-secret-key",
        },
        {
          url: "https://managed.example/v1/chat/completions",
          authorization: "Bearer managed-key",
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not let a credential enable a gated scenario", () => {
    const fallback: ScenarioAdapter = async () => ({ text: "fixture" });
    const resolution = resolveRequestModelAdapter(sealedRequest(), {
      userAuthorized: false,
      managedAuthorized: false,
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: ENVIRONMENT,
    });
    expect(resolution.adapter).toBe(fallback);
    expect(resolution.cacheScope).toBe("managed");
  });

  it("prepends one request-scoped candidate without mutating the managed pool", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "answer" } }],
      }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const resolution = resolveRequestModelAdapter(sealedRequest(), {
        userAuthorized: true,
        managedAuthorized: true,
        fallback: null,
        limits: DEFAULT_POOL_LIMITS,
        environment: ENVIRONMENT,
      });
      expect(resolution.cacheScope).not.toBe("managed");
      await expect(resolution.adapter!({
        scenario: "matter-inquiry",
        prompt: "question",
        locale: "en-US",
        input: null,
        deadlineMs: 3_000,
        maxOutputTokens: 20,
      }, new AbortController().signal)).resolves.toEqual({ text: "answer" });
      expect(urls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a sealed custom profile directly without runtime discovery", async () => {
    publicFetches.chat.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "custom answer" } }],
    }), { headers: { "content-type": "application/json" } }));
    const request = sealedRequest({
      profileId: "openai-compatible",
      model: "gpt-4.1-mini",
      baseUrl: "https://mirror.vendor.ai/gateway/v1",
    });
    const resolution = resolveRequestModelAdapter(request, {
      userAuthorized: true,
      managedAuthorized: true,
      fallback: null,
      limits: DEFAULT_POOL_LIMITS,
      environment: ENVIRONMENT,
    });

    await expect(resolution.adapter!({
      scenario: "matter-inquiry",
      prompt: "question",
      locale: "en-US",
      input: null,
      deadlineMs: 3_000,
      maxOutputTokens: 20,
    }, new AbortController().signal)).resolves.toEqual({ text: "custom answer" });
    expect(publicFetches.models).not.toHaveBeenCalled();
    expect(publicFetches.anthropic).not.toHaveBeenCalled();
    expect(publicFetches.chat).toHaveBeenCalledOnce();
    expect(String(publicFetches.chat.mock.calls[0]![0]))
      .toBe("https://mirror.vendor.ai/gateway/v1/chat/completions");
  });
});
