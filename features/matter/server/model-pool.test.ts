import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function adapterInput(
  deadlineMs = 3_000,
  scenario: "matter-thought-label" | "matter-transcript-repair" = "matter-thought-label",
) {
  return {
    scenario,
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
  it("uses the scenario-neutral model namespace for new deployments", () => {
    expect(readModelPool({
      MATTER_MODEL_POOL: "primary",
      MATTER_MODEL_PRIMARY_BASE_URL: "https://models.example/v1",
      MATTER_MODEL_PRIMARY_API_KEY: "key",
      MATTER_MODEL_PRIMARY_MODELS: "fast,steady",
    })).toEqual([
      { station: "primary", baseUrl: "https://models.example/v1", apiKey: "key", model: "fast" },
      { station: "primary", baseUrl: "https://models.example/v1", apiKey: "key", model: "steady" },
    ]);
  });

  it("flattens stations into ordered candidates and trims the base URL", () => {
    expect(readModelPool(ENVIRONMENT)).toEqual([
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "Qwen-flash" },
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "DeepSeek-V3" },
      { station: "backup", baseUrl: "https://other.example/v1", apiKey: "key-two", model: "Qwen-flash" },
    ]);
  });

  it("deduplicates repeated stations and models without changing first-seen order", () => {
    expect(readModelPool({
      ...ENVIRONMENT,
      MATTER_LABEL_POOL: "abc,abc,backup,abc",
      MATTER_LABEL_ABC_MODELS: "Qwen-flash,Qwen-flash,DeepSeek-V3,Qwen-flash",
    })).toEqual([
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "Qwen-flash" },
      { station: "abc", baseUrl: "https://relay.example/v1", apiKey: "key-one", model: "DeepSeek-V3" },
      { station: "backup", baseUrl: "https://other.example/v1", apiKey: "key-two", model: "Qwen-flash" },
    ]);
  });

  it("is empty when nothing is configured", () => {
    expect(readModelPool({})).toEqual([]);
    expect(resolvePoolAdapter({})).toBeNull();
  });

  it("fails closed instead of merging canonical and legacy pool namespaces", () => {
    expect(readModelPool({
      ...ENVIRONMENT,
      MATTER_MODEL_POOL: "primary",
      MATTER_MODEL_PRIMARY_BASE_URL: "https://models.example/v1",
      MATTER_MODEL_PRIMARY_API_KEY: "new-key",
      MATTER_MODEL_PRIMARY_MODELS: "fast",
    })).toEqual([]);
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
    expect(call?.init.cache).toBe("no-store");
    expect(call?.init.redirect).toBe("error");
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
    const events: string[] = [];
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
    await expect(adapter({
      ...adapterInput(),
      observeCandidate: (event) => events.push(event),
    }, new AbortController().signal))
      .resolves.toEqual({ text: "成本问题" });
    expect(tried).toEqual(["first", "second"]);
    expect(events).toEqual(["pool", "failed", "answered"]);
  });

  it("bounds one relay's attempt so a hang cannot spend the whole deadline", async () => {
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("hanging"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const request = init as RequestInit;
        const model = (JSON.parse(String(request.body)) as { model: string }).model;
        tried.push(model);
        if (model !== "hanging") return chatResponse("成本问题");
        return new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );
    await expect(adapter(adapterInput(1_000), new AbortController().signal))
      .resolves.toEqual({ text: "成本问题" });
    expect(tried).toEqual(["hanging", "steady"]);
  });

  it("preserves relay fallback when a transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    try {
      const tried: string[] = [];
      const adapter = createPoolAdapter(
        [candidate("ignores-abort"), candidate("steady")],
        DEFAULT_POOL_LIMITS,
        Date.now,
        async (_url, init) => {
          const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
          tried.push(model);
          return model === "steady"
            ? chatResponse("成本问题")
            : new Promise<Response>(() => undefined);
        },
      );

      const pending = adapter(adapterInput(1_000), new AbortController().signal);
      const assertion = expect(pending).resolves.toEqual({ text: "成本问题" });
      await vi.advanceTimersByTimeAsync(500);
      await assertion;
      expect(tried).toEqual(["ignores-abort", "steady"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cools a stalled relay after one hang, not after two", async () => {
    // The production failure this exists for: one relay stops answering
    // without refusing. Graded like a fast error it stays first in order for a
    // second full-ceiling attempt, so the next caller pays the same stall
    // again before the pool ever reaches a working relay.
    let clock = 1_000;
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("stalling"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      () => clock,
      async (_url, init) => {
        const request = init as RequestInit;
        const model = (JSON.parse(String(request.body)) as { model: string }).model;
        tried.push(model);
        if (model !== "stalling") return chatResponse("成本问题");
        return new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => {
              // The stall consumed the whole attempt ceiling.
              clock += 500;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
    );

    await expect(adapter(adapterInput(1_000), new AbortController().signal))
      .resolves.toEqual({ text: "成本问题" });
    expect(tried).toEqual(["stalling", "steady"]);

    // Second caller: the stalled relay is cooling, so the steady one answers
    // first and nobody pays the ceiling again.
    tried.length = 0;
    await expect(adapter(adapterInput(1_000), new AbortController().signal))
      .resolves.toEqual({ text: "成本问题" });
    expect(tried).toEqual(["steady"]);
  });

  it("keeps a stalled relay's cooldown inside the scenario that observed it", async () => {
    let clock = 1_000;
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("stalling"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      () => clock,
      async (_url, init) => {
        const request = init as RequestInit;
        const model = (JSON.parse(String(request.body)) as { model: string }).model;
        tried.push(model);
        if (model === "steady") return chatResponse("成本问题");
        return new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => {
              clock += 500;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
    );

    await adapter(adapterInput(1_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["stalling", "steady"]);

    tried.length = 0;
    await adapter(adapterInput(1_000, "matter-thought-label"), new AbortController().signal);
    expect(tried).toEqual(["stalling", "steady"]);

    tried.length = 0;
    await adapter(adapterInput(1_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["steady"]);
  });

  it("keeps candidate health isolated across delimiter-ambiguous identities", async () => {
    const urls: string[] = [];
    const adapter = createPoolAdapter(
      [
        { station: "ab", baseUrl: "c", apiKey: "key", model: "d" },
        { station: "a", baseUrl: "bc", apiKey: "key", model: "d" },
      ],
      { ...DEFAULT_POOL_LIMITS, failuresBeforeCooldown: 1 },
      Date.now,
      async (url) => {
        const value = String(url);
        urls.push(value);
        return value.startsWith("c/") ? chatResponse("", 503) : chatResponse("成本问题");
      },
    );

    await adapter(adapterInput(), new AbortController().signal);
    await adapter(adapterInput(), new AbortController().signal);
    expect(urls).toEqual([
      "c/chat/completions",
      "bc/chat/completions",
      "bc/chat/completions",
    ]);
  });

  it("does not let one scenario's success erase another scenario's failure evidence", async () => {
    const tried: string[] = [];
    let firstAnswers = false;
    const adapter = createPoolAdapter(
      [candidate("first"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        if (model === "steady" || firstAnswers) return chatResponse("成本问题");
        return chatResponse("no", 503);
      },
    );

    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["first", "steady"]);

    tried.length = 0;
    firstAnswers = true;
    await adapter(adapterInput(3_000, "matter-thought-label"), new AbortController().signal);
    expect(tried).toEqual(["first"]);

    tried.length = 0;
    firstAnswers = false;
    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["first", "steady"]);

    tried.length = 0;
    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["steady"]);
  });

  it("still lets a same-scenario success clear that scenario's failure evidence", async () => {
    const tried: string[] = [];
    let firstAnswers = false;
    const adapter = createPoolAdapter(
      [candidate("first"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        if (model === "steady" || firstAnswers) return chatResponse("成本问题");
        return chatResponse("no", 503);
      },
    );

    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    firstAnswers = true;
    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);

    firstAnswers = false;
    tried.length = 0;
    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    await adapter(adapterInput(3_000, "matter-transcript-repair"), new AbortController().signal);
    expect(tried).toEqual(["first", "steady", "first", "steady"]);
  });

  it("still needs two fast refusals before cooling a responsive relay", async () => {
    // A relay that refuses quickly costs the caller almost nothing, so it keeps
    // its place until it has actually proven unreliable.
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("refusing"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        return model === "refusing" ? chatResponse("no", 500) : chatResponse("成本问题");
      },
    );

    await adapter(adapterInput(), new AbortController().signal);
    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["refusing", "steady"]);
    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["steady"]);
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

  it("fast-fails a declared oversize without waiting for body cancellation", async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => undefined),
    });
    const adapter = createPoolAdapter(
      [candidate("only")],
      { ...DEFAULT_POOL_LIMITS, maxResponseBytes: 64 },
      Date.now,
      async () => new Response(body, { headers: { "content-length": "65" } }),
    );
    await expect(adapter(adapterInput(), new AbortController().signal))
      .rejects.toThrow("too large");
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
