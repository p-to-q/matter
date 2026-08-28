import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POOL_LIMITS,
  createPoolAdapter,
  readModelPool,
  resetPoolHealth,
  resolvePoolAdapter,
  type PoolCandidate,
} from "./model-pool";
import {
  ScenarioGovernor,
  runScenario,
  type MatterScenario,
  type ScenarioPerformanceObservation,
} from "./harness";

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
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: text } }] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => resetPoolHealth());
afterEach(() => resetPoolHealth());

describe("readModelPool", () => {
  it("keeps the shared output ceiling even when a caller asks for more", async () => {
    expect(DEFAULT_POOL_LIMITS.maxOutputTokens).toBe(1_200);
    let maxTokens: unknown;
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        maxTokens = (JSON.parse(String((init as RequestInit).body)) as { max_tokens?: unknown })
          .max_tokens;
        return chatResponse("完整");
      },
    );

    await adapter(
      { ...adapterInput(), maxOutputTokens: 2_600 },
      new AbortController().signal,
    );

    expect(maxTokens).toBe(1_200);
  });

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

  it.each([
    { candidateMode: undefined, disabled: false, expected: undefined },
    { candidateMode: undefined, disabled: true, expected: undefined },
    { candidateMode: false, disabled: false, expected: false },
    { candidateMode: false, disabled: true, expected: false },
    { candidateMode: true, disabled: false, expected: true },
    { candidateMode: true, disabled: true, expected: false },
  ] as const)(
    "keeps the provider-specific thinking field capability-scoped ($candidateMode, $disabled)",
    async ({ candidateMode, disabled, expected }) => {
      let body: Record<string, unknown> = {};
      const base = candidate("thinking-capability");
      const configured = candidateMode === undefined
        ? base
        : { ...base, enableThinking: candidateMode };
      const adapter = createPoolAdapter(
        [configured],
        DEFAULT_POOL_LIMITS,
        Date.now,
        async (_url, init) => {
          body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return chatResponse("bounded answer");
        },
      );

      await adapter({
        ...adapterInput(),
        ...(disabled ? { disableThinking: true as const } : {}),
      }, new AbortController().signal);

      expect(body.enable_thinking).toBe(expected);
      expect(Object.hasOwn(body, "enable_thinking")).toBe(expected !== undefined);
    },
  );

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

  it("cancels an irrelevant error body before trying the next candidate", async () => {
    const cancelled = vi.fn();
    const adapter = createPoolAdapter(
      [candidate("refusing"), candidate("steady")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        if (model === "steady") return chatResponse("cost boundary");
        return new Response(new ReadableStream<Uint8Array>({
          pull: () => new Promise(() => undefined),
          cancel: cancelled,
        }), { status: 503 });
      },
    );

    await expect(adapter(adapterInput(), new AbortController().signal))
      .resolves.toEqual({ text: "cost boundary" });
    expect(cancelled).toHaveBeenCalledOnce();
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

  it("drains a late response and never lets it replace the fallback winner", async () => {
    vi.useFakeTimers();
    try {
      let resolveLate!: (response: Response) => void;
      let releaseCancel!: () => void;
      let cancelSettled!: Promise<void>;
      const cancelled = vi.fn();
      const tried: string[] = [];
      const events: string[] = [];
      let lateCalls = 0;
      const adapter = createPoolAdapter(
        [candidate("late"), candidate("steady")],
        { ...DEFAULT_POOL_LIMITS, cooldownMs: 0 },
        Date.now,
        async (_url, init) => {
          const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
          tried.push(model);
          if (model === "steady") return chatResponse("SECOND");
          lateCalls += 1;
          if (lateCalls > 1) return chatResponse("RECOVERED");
          return new Promise<Response>((resolve) => {
            resolveLate = resolve;
          });
        },
      );

      const first = adapter(
        { ...adapterInput(1_000), observeCandidate: (event) => events.push(event) },
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(500);
      await expect(first).resolves.toEqual({ text: "SECOND" });
      expect(tried).toEqual(["late", "steady"]);

      // Even with a zero cooldown, the unresolved transport owns a lease and is
      // not multiplied by the next request.
      tried.length = 0;
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "SECOND" });
      expect(tried).toEqual(["steady"]);

      resolveLate(new Response(new ReadableStream<Uint8Array>({
        cancel: () => {
          cancelled();
          cancelSettled = new Promise<void>((resolve) => {
            releaseCancel = resolve;
          });
          return cancelSettled;
        },
      })));
      await Promise.resolve();
      await Promise.resolve();
      expect(cancelled).toHaveBeenCalledOnce();

      // A resolved Response is still a live resource until its body disposer
      // settles. The lease must not open a multiplication window in between.
      tried.length = 0;
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "SECOND" });
      expect(tried).toEqual(["steady"]);

      releaseCancel();
      await cancelSettled;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      tried.length = 0;
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "RECOVERED" });
      expect(tried).toEqual(["late"]);
      expect(events).toEqual(["pool", "stalled", "answered"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a lease for a claimed response whose body cancellation has not settled", async () => {
    vi.useFakeTimers();
    try {
      let releaseCancel!: () => void;
      let cancelSettled!: Promise<void>;
      let firstBody = true;
      const tried: string[] = [];
      const adapter = createPoolAdapter(
        [candidate("body-stalls"), candidate("steady")],
        { ...DEFAULT_POOL_LIMITS, cooldownMs: 0 },
        Date.now,
        async (_url, init) => {
          const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
          tried.push(model);
          if (model === "steady") return chatResponse("SECOND");
          if (!firstBody) return chatResponse("RECOVERED");
          firstBody = false;
          return new Response(new ReadableStream<Uint8Array>({
            pull: () => new Promise(() => undefined),
            cancel: () => {
              cancelSettled = new Promise<void>((resolve) => {
                releaseCancel = resolve;
              });
              return cancelSettled;
            },
          }));
        },
      );

      const first = adapter(adapterInput(1_000), new AbortController().signal);
      await vi.advanceTimersByTimeAsync(500);
      await expect(first).resolves.toEqual({ text: "SECOND" });
      expect(tried).toEqual(["body-stalls", "steady"]);

      tried.length = 0;
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "SECOND" });
      expect(tried).toEqual(["steady"]);

      releaseCancel();
      await cancelSettled;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      tried.length = 0;
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "RECOVERED" });
      expect(tried).toEqual(["body-stalls"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives the full remaining budget to the last non-draining candidate", async () => {
    vi.useFakeTimers();
    let releaseDrain: ((response: Response) => void) | undefined;
    try {
      let slowCalls = 0;
      let drainingCalls = 0;
      const adapter = createPoolAdapter(
        [candidate("slow"), candidate("already-draining")],
        DEFAULT_POOL_LIMITS,
        Date.now,
        async (_url, init) => {
          const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
          if (model === "already-draining") {
            drainingCalls += 1;
            if (drainingCalls > 1) return chatResponse("DRAIN-CLEARED");
            return new Promise<Response>((resolve) => { releaseDrain = resolve; });
          }
          slowCalls += 1;
          if (slowCalls === 1 || slowCalls === 3) return chatResponse("", 503);
          return new Promise<Response>((resolve) => {
            setTimeout(() => resolve(chatResponse("LATE-BUT-IN-BOUNDS")), 700);
          });
        },
      );

      const seedDrain = adapter(adapterInput(1_000), new AbortController().signal);
      const seedAssertion = expect(seedDrain).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1_000);
      await seedAssertion;

      const next = adapter(adapterInput(1_000), new AbortController().signal);
      await vi.advanceTimersByTimeAsync(700);
      await expect(next).resolves.toEqual({ text: "LATE-BUT-IN-BOUNDS" });

      releaseDrain?.(chatResponse("STALE"));
      releaseDrain = undefined;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await expect(adapter(adapterInput(1_000), new AbortController().signal))
        .resolves.toEqual({ text: "DRAIN-CLEARED" });
    } finally {
      releaseDrain?.(chatResponse("STALE"));
      vi.useRealTimers();
    }
  });

  it("does not mistake healthy concurrent requests for abandoned transport", async () => {
    const releases: Array<(response: Response) => void> = [];
    let calls = 0;
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => {
        calls += 1;
        return new Promise<Response>((resolve) => releases.push(resolve));
      },
    );
    const first = adapter(adapterInput(), new AbortController().signal);
    const second = adapter(adapterInput(), new AbortController().signal);
    await Promise.resolve();
    expect(calls).toBe(2);
    releases[0]?.(chatResponse("FIRST"));
    releases[1]?.(chatResponse("SECOND"));
    await expect(first).resolves.toEqual({ text: "FIRST" });
    await expect(second).resolves.toEqual({ text: "SECOND" });
  });

  it("cools a stalled relay after one hang, not after two", async () => {
    // The production failure this exists for: one relay stops answering
    // without refusing. Graded like a fast error it stays first in order for a
    // second full-ceiling attempt, so the next caller pays the same stall
    // again before the pool ever reaches a working relay.
    const clock = 1_000;
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

  it("expires old fast-failure evidence before it can trigger a later cooldown", async () => {
    let clock = 1_000;
    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("flaky"), candidate("steady")],
      { ...DEFAULT_POOL_LIMITS, failuresBeforeCooldown: 2 },
      () => clock,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        return model === "flaky" ? chatResponse("", 500) : chatResponse("成本问题");
      },
    );

    await adapter(adapterInput(), new AbortController().signal);
    clock += (5 * 60_000) + 1;
    await adapter(adapterInput(), new AbortController().signal);

    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["flaky", "steady"]);
  });

  it("evicts the oldest health evidence when rotating pools exceed the bound", async () => {
    const limits = { ...DEFAULT_POOL_LIMITS, failuresBeforeCooldown: 1, cooldownMs: 60_000 };
    const fail = async () => chatResponse("", 500);
    for (let index = 0; index <= 256; index += 1) {
      const adapter = createPoolAdapter([candidate(`rotated-${index}`)], limits, () => 1_000, fail);
      await expect(adapter(adapterInput(), new AbortController().signal)).rejects.toThrow();
    }

    const tried: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("rotated-0"), candidate("steady")],
      limits,
      () => 1_000,
      async (_url, init) => {
        const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
        tried.push(model);
        return model === "rotated-0" ? chatResponse("", 500) : chatResponse("成本问题");
      },
    );

    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["rotated-0", "steady"]);
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

  it.each([
    ["length", "openai chat completions"],
    ["max_tokens", "anthropic and relays that forward it"],
    ["MAX_TOKENS", "a relay that shouts its terminators"],
    ["model_context_window_exceeded", "anthropic context overflow"],
  ])("refuses a %s completion so a half answer loses to the floor", async (terminator) => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: terminator, message: { content: "半句话" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toContain("truncated");
  });

  it("demotes a relay that truncates while still trying the next one", async () => {
    // The clock never advances: cooling would have to come from grading,
    // not from time passing.
    const clock = 1_000;
    const tried: string[] = [];
    const respond = async (_url: unknown, init: unknown) => {
      const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
      tried.push(model);
      return model === "cuts"
        ? new Response(
            JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "半句" } }] }),
            { headers: { "content-type": "application/json" } },
          )
        : chatResponse("完整");
    };
    const limits = { ...DEFAULT_POOL_LIMITS, failuresBeforeCooldown: 1, cooldownMs: 60_000 };
    const adapter = createPoolAdapter(
      [candidate("cuts"), candidate("steady")],
      limits,
      () => clock,
      respond,
    );

    // The truncating relay is skipped over, not used, and the next one answers.
    await expect(adapter(adapterInput(), new AbortController().signal))
      .resolves.toEqual({ text: "完整" });
    expect(tried).toEqual(["cuts", "steady"]);

    // Candidate-local demotion keeps the repeatedly incomplete relay from
    // charging every later request; it does not cool the whole surface.
    tried.length = 0;
    await adapter(adapterInput(), new AbortController().signal);
    expect(tried).toEqual(["steady"]);
  });

  it("settles on the floor when every relay truncates", async () => {
    const adapter = createPoolAdapter(
      [candidate("one"), candidate("two")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "半句" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(adapterInput(), new AbortController().signal)).rejects.toThrow();
  });

  it("records every truncated relay as one terminal attempt", async () => {
    const observations: ScenarioPerformanceObservation[] = [];
    const adapter = createPoolAdapter(
      [candidate("one"), candidate("two")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "半句" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const scenario: MatterScenario<null, string> = Object.freeze({
      id: "matter-inquiry",
      promptVersion: "test/1",
      locale: () => "zh-CN",
      compile: () => "answer",
      budget: () => ({ deadlineMs: 3_000, maxOutputTokens: 32 }),
      adjudicate: (answer) => typeof answer === "string"
        ? { ok: true, value: answer }
        : { ok: false, reason: "empty" },
    });
    const outcome = await runScenario(scenario, null, adapter, new ScenarioGovernor(), {
      observePerformance: (observation) => observations.push(observation),
    });
    expect(outcome).toEqual({ ok: false, fallback: "MODEL_UNAVAILABLE" });
    expect(observations).toEqual([expect.objectContaining({
      outcome: "unavailable",
      candidateAttempts: 2,
      candidateTruncations: 2,
      candidateRefusals: 0,
    })]);
  });

  it.each([
    ["stop", "openai"],
    ["end_turn", "anthropic"],
    ["eos", "together"],
  ])("accepts a %s completion without counting it as unknown", async (terminator) => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: terminator, message: { content: "完整" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).resolves.toEqual({ text: "完整" });
    expect(events).not.toContain("unknown-terminator");
  });

  it("fails closed on an explicitly empty terminator", async () => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: "", message: { content: "半句" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toEqual(["pool", "unknown-terminator", "refused"]);
  });

  it("accepts a relay that reports no terminator at all", async () => {
    // Several OpenAI-compatible relays omit the field. Absent must never read
    // as bad: an allowlist here would silently settle every scenario on its
    // floor, and a floor does not announce itself.
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ message: { content: "完整" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).resolves.toEqual({ text: "完整" });
    expect(events).not.toContain("unknown-terminator");
    expect(events).not.toContain("truncated");
    expect(events).toContain("missing-terminator");
  });

  it.each([
    "content_filter",
    "guardrail_intervened",
    "refusal",
    "tool_calls",
    "function_call",
    "tool_use",
    "pause_turn",
  ])("refuses an explicit non-complete %s terminator", async (terminator) => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: terminator, message: { content: "不应显示" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toContain("refused");
  });

  it.each([
    ["a structured refusal", { finish_reason: "stop", message: { content: "不应显示", refusal: "blocked" } }],
    ["a structured tool call", { finish_reason: "stop", message: { content: "不应显示", tool_calls: [{ id: "call_1" }] } }],
    ["an object-shaped refusal", { finish_reason: "stop", message: { content: "不应显示", refusal: { reason: "blocked" } } }],
    ["a malformed tool call", { finish_reason: "stop", message: { content: "不应显示", tool_calls: { id: "call_1" } } }],
    ["a malformed function call", { finish_reason: "stop", message: { content: "不应显示", function_call: "pending" } }],
    ["a choice tool call hidden by an empty message field", {
      finish_reason: "stop",
      tool_calls: [{ id: "call_1" }],
      message: { content: "不应显示", tool_calls: [] },
    }],
  ])("refuses %s even when the terminator says complete", async (_name, choice) => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(JSON.stringify({ choices: [choice] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toContain("refused");
  });

  it("does not count a missing terminator until the response carries text", async () => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toEqual(["pool", "failed"]);
  });

  it("fails closed on an unknown explicit terminator and counts it anonymously", async () => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: "new_relay_state", message: { content: "不应显示" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toEqual(["pool", "unknown-terminator", "refused"]);
  });

  it("counts an unknown explicit terminator even when a structured refusal also rejects the choice", async () => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({
          choices: [{
            finish_reason: "future_provider_state",
            message: { content: "不应显示", refusal: "blocked" },
          }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toEqual(["pool", "unknown-terminator", "refused"]);
  });

  it("treats a complete and truncating terminator conflict as truncated", async () => {
    const events: string[] = [];
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({
          choices: [{
            finish_reason: "stop",
            stop_reason: "length",
            message: { content: "半句" },
          }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(
      { ...adapterInput(), observeCandidate: (event) => events.push(event) },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(events).toEqual(["pool", "truncated"]);
  });

  it("does not let an empty finish_reason hide a truncating stop_reason", async () => {
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ finish_reason: "", stop_reason: "max_tokens", message: { content: "半句" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(adapter(adapterInput(), new AbortController().signal)).rejects.toThrow();
  });

  it("reads an anthropic-shaped stop_reason when finish_reason is absent", async () => {
    const adapter = createPoolAdapter(
      [candidate("only")],
      DEFAULT_POOL_LIMITS,
      Date.now,
      async () => new Response(
        JSON.stringify({ choices: [{ stop_reason: "max_tokens", message: { content: "半句" } }] }),
        { headers: { "content-type": "application/json" } },
      ),
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
    let releaseCancel: (() => void) | undefined;
    let cancelSettled: Promise<void> | undefined;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelSettled = new Promise<void>((resolve) => { releaseCancel = resolve; });
        return cancelSettled;
      },
    });
    let calls = 0;
    const adapter = createPoolAdapter(
      [candidate("oversize-never-cancels")],
      { ...DEFAULT_POOL_LIMITS, maxResponseBytes: 128 },
      Date.now,
      async () => {
        calls += 1;
        return calls === 1
          ? new Response(body, { headers: { "content-length": "129" } })
          : chatResponse("RECOVERED");
      },
    );
    try {
      await expect(adapter(adapterInput(), new AbortController().signal))
        .rejects.toThrow("too large");
      releaseCancel?.();
      releaseCancel = undefined;
      await cancelSettled;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await expect(adapter(adapterInput(), new AbortController().signal))
        .resolves.toEqual({ text: "RECOVERED" });
    } finally {
      releaseCancel?.();
      await cancelSettled;
    }
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
