import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const publicFetches = vi.hoisted(() => ({
  chat: vi.fn<typeof fetch>(),
  responses: vi.fn<typeof fetch>(),
  anthropic: vi.fn<typeof fetch>(),
  models: vi.fn<typeof fetch>(),
}));
vi.mock("./public-provider-fetch", () => ({
  fetchPublicChatCompletions: publicFetches.chat,
  fetchPublicResponses: publicFetches.responses,
  fetchPublicAnthropicMessages: publicFetches.anthropic,
  fetchPublicProviderModels: publicFetches.models,
}));

import { DEFAULT_POOL_LIMITS } from "./model-pool";
import {
  PROVIDER_SESSION_COOKIE,
  PROVIDER_SESSION_GENERATION_COOKIE,
  sealProviderCredential,
} from "./provider-session-crypto";
import {
  resolveRequestModelAdapter,
  resolveScenarioRequestModelAdapter,
} from "./request-model-pool";
import {
  ScenarioGovernor,
  runScenario,
  type MatterScenario,
  type ScenarioAdapter,
} from "./harness";
import type { UserProviderSelection } from "./user-provider-registry";

const KEY = Buffer.alloc(32, 5).toString("base64url");
const GENERATION_ID = Buffer.alloc(16, 4).toString("base64url");
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
}, apiKey = "user-secret-key"): Request {
  const sealed = sealProviderCredential(
    selection,
    apiKey,
    GENERATION_ID,
    ENVIRONMENT,
  )!;
  return new Request("https://matter.example/matter/api/inquiry", {
    headers: { cookie: [
      `${PROVIDER_SESSION_COOKIE}=${sealed.token}`,
      `${PROVIDER_SESSION_GENERATION_COOKIE}=${GENERATION_ID}`,
    ].join("; ") },
  });
}

beforeEach(() => {
  publicFetches.chat.mockReset();
  publicFetches.responses.mockReset();
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
    const admissionIndex = source.indexOf("const admission =");
    const resolutionIndex = source.indexOf(
      `resolveScenarioRequestModelAdapter(request, "${scenario}", {`,
    );
    expect(admissionIndex).toBeGreaterThanOrEqual(0);
    expect(resolutionIndex).toBeGreaterThan(admissionIndex);
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

  it("does not let one user-only provider failure cool another credential", async () => {
    let healthy = false;
    vi.stubGlobal("fetch", vi.fn(async () => healthy
      ? new Response(JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "second user answer" } }],
        }), { headers: { "content-type": "application/json" } })
      : new Response("{}", { status: 503 })));
    try {
      const environment = { ...ENVIRONMENT, MATTER_INQUIRY_ADAPTER: "fixture" };
      const first = resolveScenarioRequestModelAdapter(
        sealedRequest(undefined, "first-user-key"),
        "matter-inquiry",
        { fallback: null, limits: DEFAULT_POOL_LIMITS, environment },
      );
      const governor = new ScenarioGovernor();
      const limits = Object.freeze({
        maxConcurrentModelCalls: 2,
        failuresBeforeCooldown: 1,
        cooldownMs: 15_000,
      });
      await expect(runScenario(USER_INQUIRY, "first", first.adapter, governor, {
        limits,
        observe: () => undefined,
      })).resolves.toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
      expect(governor.cooling(Date.now())).toBe(false);

      healthy = true;
      const second = resolveScenarioRequestModelAdapter(
        sealedRequest(undefined, "second-user-key"),
        "matter-inquiry",
        { fallback: null, limits: DEFAULT_POOL_LIMITS, environment },
      );
      await expect(runScenario(USER_INQUIRY, "second", second.adapter, governor, {
        limits,
        observe: () => undefined,
      })).resolves.toEqual({ ok: true, value: "second user answer" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not let a user-only deadline cool another credential", async () => {
    vi.useFakeTimers();
    let healthy = false;
    vi.stubGlobal("fetch", vi.fn(async () => healthy
      ? new Response(JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "second user answer" } }],
        }), { headers: { "content-type": "application/json" } })
      : await new Promise<Response>(() => undefined)));
    try {
      const environment = { ...ENVIRONMENT, MATTER_INQUIRY_ADAPTER: "fixture" };
      const poolLimits = Object.freeze({
        ...DEFAULT_POOL_LIMITS,
        minimumAttemptMs: 20,
        maxAttemptShare: 1,
      });
      const governor = new ScenarioGovernor();
      const governorLimits = Object.freeze({
        maxConcurrentModelCalls: 2,
        failuresBeforeCooldown: 1,
        cooldownMs: 15_000,
      });
      const first = resolveScenarioRequestModelAdapter(
        sealedRequest(undefined, "hanging-user-key"),
        "matter-inquiry",
        { fallback: null, limits: poolLimits, environment },
      );
      const firstOutcome = runScenario(SHORT_USER_INQUIRY, "first", first.adapter, governor, {
        limits: governorLimits,
        observe: () => undefined,
      });
      const firstAssertion = expect(firstOutcome).resolves.toEqual({
        ok: false,
        fallback: "MODEL_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(60);
      await firstAssertion;
      expect(governor.cooling(Date.now())).toBe(false);

      healthy = true;
      const second = resolveScenarioRequestModelAdapter(
        sealedRequest(undefined, "healthy-user-key"),
        "matter-inquiry",
        { fallback: null, limits: poolLimits, environment },
      );
      await expect(runScenario(SHORT_USER_INQUIRY, "second", second.adapter, governor, {
        limits: governorLimits,
        observe: () => undefined,
      })).resolves.toEqual({ ok: true, value: "second user answer" });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["matter-transform", "MATTER_TRANSFORM_ADAPTER"],
    ["matter-text-swap", "MATTER_TEXT_SWAP_ADAPTER"],
  ] as const)("keeps %s behind its independent product surface", (scenario, gate) => {
    const surface = scenario === "matter-transform"
      ? "MATTER_TRANSFORM_SURFACE"
      : "MATTER_TEXT_SWAP_SURFACE";
    const fallback: ScenarioAdapter = async () => ({ text: "fixture" });
    const closed = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, NODE_ENV: "production", [surface]: "off", [gate]: "live" },
    });
    expect(closed).toEqual({ adapter: null, cacheScope: "managed" });

    const userSupplied = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
      fallback: null,
      limits: DEFAULT_POOL_LIMITS,
      environment: { ...ENVIRONMENT, NODE_ENV: "production", [surface]: "public", [gate]: "off" },
    });
    expect(userSupplied.adapter).not.toBeNull();
    expect(userSupplied.cacheScope).not.toBe("managed");
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
      const materialSurface = scenario === "matter-transform"
        ? { MATTER_TRANSFORM_SURFACE: "public" }
        : scenario === "matter-text-swap"
          ? { MATTER_TEXT_SWAP_SURFACE: "public" }
          : {};
      const resolution = resolveScenarioRequestModelAdapter(sealedRequest(), scenario, {
        fallback: null,
        limits: DEFAULT_POOL_LIMITS,
        environment: { ...ENVIRONMENT, ...materialSurface, [gate]: "live" },
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

  it("uses a sealed custom Responses profile directly without runtime discovery", async () => {
    publicFetches.responses.mockResolvedValue(new Response(JSON.stringify({
      object: "response",
      status: "completed",
      error: null,
      incomplete_details: null,
      output: [{
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "custom response answer" }],
      }],
    }), { headers: { "content-type": "application/json" } }));
    const request = sealedRequest({
      profileId: "openai-responses-compatible",
      model: "vendor-response-small",
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
    }, new AbortController().signal)).resolves.toEqual({ text: "custom response answer" });
    expect(publicFetches.models).not.toHaveBeenCalled();
    expect(publicFetches.anthropic).not.toHaveBeenCalled();
    expect(publicFetches.chat).not.toHaveBeenCalled();
    expect(publicFetches.responses).toHaveBeenCalledOnce();
    const [url, init] = publicFetches.responses.mock.calls[0]!;
    expect(String(url)).toBe("https://mirror.vendor.ai/gateway/v1/responses");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "vendor-response-small",
      input: "question",
      max_output_tokens: 20,
      stream: false,
      store: false,
    });
  });
});

const USER_INQUIRY: MatterScenario<string, string> = Object.freeze({
  id: "matter-inquiry",
  promptVersion: "request-pool-test/1",
  locale: () => "en-US",
  compile: (input) => input,
  budget: () => Object.freeze({ deadlineMs: 3_000, maxOutputTokens: 20 }),
  adjudicate: (answer) => typeof answer === "string" && answer.length > 0
    ? Object.freeze({ ok: true as const, value: answer })
    : Object.freeze({ ok: false as const, reason: "empty" }),
});

const SHORT_USER_INQUIRY: MatterScenario<string, string> = Object.freeze({
  ...USER_INQUIRY,
  budget: () => Object.freeze({ deadlineMs: 60, maxOutputTokens: 20 }),
});
