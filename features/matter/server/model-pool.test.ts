import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_POOL_LIMITS,
  createPoolAdapter,
  readModelPool,
  resetPoolHealth,
  resolvePoolAdapter,
  type PoolCandidate,
} from "./model-pool";

const ENVIRONMENT = Object.freeze({
  MATTER_LABEL_POOL: "abc,backup",
  MATTER_LABEL_ABC_BASE_URL: "https://relay.example/v1/",
  MATTER_LABEL_ABC_API_KEY: "key-one",
  MATTER_LABEL_ABC_MODELS: "Qwen-flash,DeepSeek-V3",
  MATTER_LABEL_BACKUP_BASE_URL: "https://other.example/v1",
  MATTER_LABEL_BACKUP_API_KEY: "key-two",
  MATTER_LABEL_BACKUP_MODELS: "Qwen-flash",
});

function candidate(model: string, station = "abc"): PoolCandidate {
  return { station, baseUrl: "https://relay.example/v1", apiKey: "key", model };
}

function adapterInput(deadlineMs = 3_000) {
  return {
    scenario: "matter-thought-label" as const,
    prompt: "name it",
    locale: "zh-CN",
    input: null,
    deadlineMs,
    maxOutputTokens: 32,
  };
}

function chatResponse(text: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => resetPoolHealth());
afterEach(() => resetPoolHealth());

describe("readModelPool", () => {
  it("flattens stations into ordered candidates and trims the base URL", () => {
    expect(readModelPool(ENVIRONMENT)).toEqual([
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "Qwen-flash" },
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "DeepSeek-V3" },
      { station: "backup", baseUrl: "https://other.example/v1", apiKey: "key-two", model: "Qwen-flash" },
    ]);
  });

  it("is empty when nothing is configured", () => {
    expect(readModelPool({})).toEqual([]);
    expect(resolvePoolAdapter({})).toBeNull();
  });

  it.each([
    ["a missing key", { ...ENVIRONMENT, MATTER_LABEL_ABC_API_KEY: undefined }],
    ["a missing base URL", { ...ENVIRONMENT, MATTER_LABEL_ABC_BASE_URL: undefined }],
    ["no models", { ...ENVIRONMENT, MATTER_LABEL_ABC_MODELS: "" }],
    ["plain HTTP off the loopback", { ...ENVIRONMENT, MATTER_LABEL_ABC_BASE_URL: "http://relay.example/v1" }],
    ["a malformed base URL", { ...ENVIRONMENT, MATTER_LABEL_ABC_BASE_URL: "relay.example" }],
  ])("drops a station with %s without losing the rest", (_name, environment) => {
    const pool = readModelPool(environment as Record<string, string | undefined>);
    expect(pool.every((entry) => entry.station === "backup")).toBe(true);
    expect(pool).toHaveLength(1);
  });

  it("allows plain HTTP on the loopback interface", () => {
    const pool = readModelPool({
      MATTER_LABEL_POOL: "local",
      MATTER_LABEL_LOCAL_BASE_URL: "http://127.0.0.1:11434/v1",
      MATTER_LABEL_LOCAL_API_KEY: "unused",
      MATTER_LABEL_LOCAL_MODELS: "qwen2.5",
    });
    expect(pool).toHaveLength(1);
  });

  it("reads an explicit station-level thinking mode", () => {
    const [entry] = readModelPool({
      MATTER_LABEL_POOL: "aiping",
      MATTER_LABEL_AIPING_BASE_URL: "https://aiping.cn/api/v1",
      MATTER_LABEL_AIPING_API_KEY: "key",
      MATTER_LABEL_AIPING_MODELS: "Qwen3.5-Flash",
      MATTER_LABEL_AIPING_ENABLE_THINKING: "false",
    });
    expect(entry).toMatchObject({ model: "Qwen3.5-Flash", enableThinking: false });
  });

  it("ignores a station name that could not be an environment suffix", () => {
    expect(readModelPool({ MATTER_LABEL_POOL: "a b,../etc" })).toEqual([]);
  });
});

describe("pool adapter", () => {
  it("sends an OpenAI-compatible deterministic request and returns the text", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = createPoolAdapter(
      [candidate("Qwen-flash")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (url, init) => {
        calls.push({ url: String(url), init: init as RequestInit });
        return chatResponse("想象的生活");
      },
    );
    await expect(adapter(adapterInput(), new AbortController().signal))
      .resolves.toEqual({ text: "想象的生活" });

    const [call] = calls;
    expect(call?.url).toBe("https://relay.example/v1/chat/completions");
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "Qwen-flash", temperature: 0, stream: false });
    expect((call?.init.headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("sends a configured non-thinking mode at the provider boundary", async () => {
    let body: Record<string, unknown> = {};
    const adapter = createPoolAdapter(
      [{ ...candidate("Qwen3.5-Flash"), enableThinking: false }],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return chatResponse("想象的余地");
      },
    );
    await adapter(adapterInput(), new AbortController().signal);
    expect(body.enable_thinking).toBe(false);
  });

  it("falls through to the next candidate on failure", async () => {
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("first"), candidate("second")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        return model === "first" ? chatResponse("", 503) : chatResponse("成本问题");
      },
    );
    await expect(adapter(adapterInput(), new AbortController().signal))
      .resolves.toEqual({ text: "成本问题" });
    expect(tried).toEqual(["first", "second"]);
  });

  it("does not start an attempt that cannot finish inside the deadline", async () => {
    let clock = 1_000;
    let calls = 0;
    const adapter = createPoolAdapter(
      [candidate("first"), candidate("second")],
      DEFAULT_POOL_LIMITS,
      () => clock,
      async () => {
        calls += 1;
        clock += 2_900;
        return chatResponse("", 500);
      },
    );
    await expect(adapter(adapterInput(3_000), new AbortController().signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("prefers a healthy candidate after another has failed repeatedly", async () => {
    let clock = 1_000;
    const tried: string[] = [];
    const respond = async (_url: unknown, init: unknown) => {
      const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
      tried.push(model);
      return model === "flaky" ? chatResponse("", 500) : chatResponse("成本问题");
    };
    const pool = [candidate("flaky"), candidate("steady")];
    const limits = { ...DEFAULT_POOL_LIMITS, failuresBeforeCooldown: 1, cooldownMs: 60_000 };
    const adapter = createPoolAdapter(pool, limits, () => clock, respond);

    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["flaky", "steady"]);

    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["steady"]);

    // A cooling candidate is deprioritised, never abandoned.
    clock += 120_000;
    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried[0]).toBe("flaky");
  });

  it("propagates caller cancellation instead of trying the next candidate", async () => {
    const controller = new AbortController();
    let calls = 0;
    const adapter = createPoolAdapter(
      [candidate("first"), candidate("second")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => {
        calls += 1;
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    );
    await expect(adapter(adapterInput(), controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it.each([
    ["no choices", JSON.stringify({ choices: [] })],
    ["no message text", JSON.stringify({ choices: [{ message: {} }] })],
    ["a non-object body", JSON.stringify("nope")],
  ])("rejects a response with %s", async (_name, body) => {
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(body, { headers: { "content-type": "application/json" } }),
    );
    await expect(adapter(adapterInput(), new AbortController().signal)).rejects.toThrow();
  });

  it("refuses a response beyond the byte bound", async () => {
    const adapter = createPoolAdapter(
      [candidate("only")],
      { ...DEFAULT_POOL_LIMITS, maxResponseBytes: 64 },
      Date.now,
      async () => chatResponse("x".repeat(4_096)),
    );
    await expect(adapter(adapterInput(), new AbortController().signal)).rejects.toThrow();
  });

  it("never puts the key in a thrown message", async () => {
    const adapter = createPoolAdapter(
      [{ station: "abc", baseUrl: "https://relay.example/v1", apiKey: "sk-secret-value", model: "only" }],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => chatResponse("nope", 401),
    );
    await expect(adapter(adapterInput(), new AbortController().signal))
      .rejects.toThrow(/HTTP 401/u);
    await expect(adapter(adapterInput(), new AbortController().signal))
      .rejects.not.toThrow(/sk-secret-value/u);
  });
});
