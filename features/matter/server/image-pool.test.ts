import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "../protocol/image-contract";
import { imageChatTransport, imageGenerationsTransport } from "./image-transport";
import {
  DEFAULT_POOL_LIMITS,
  IMAGE_POOL_LIMITS,
  createPoolAdapter,
  readImagePool,
  readModelPool,
  resetPoolHealth,
  type PoolCandidate,
} from "./model-pool";

const IMAGE_ENVIRONMENT = Object.freeze({
  MATTER_IMAGE_POOL: "draw-chat,draw-images",
  MATTER_IMAGE_DRAW_CHAT_BASE_URL: "https://relay.example/v1/",
  MATTER_IMAGE_DRAW_CHAT_API_KEY: "key-one",
  MATTER_IMAGE_DRAW_CHAT_MODELS: "gemini-image",
  MATTER_IMAGE_DRAW_CHAT_SHAPE: "chat",
  MATTER_IMAGE_DRAW_IMAGES_BASE_URL: "https://relay.example/v1",
  MATTER_IMAGE_DRAW_IMAGES_API_KEY: "key-one",
  MATTER_IMAGE_DRAW_IMAGES_MODELS: "gpt-image-a,gpt-image-b",
  MATTER_IMAGE_DRAW_IMAGES_SHAPE: "images",
});

const CHAT_ENVIRONMENT = Object.freeze({
  MATTER_MODEL_POOL: "abc",
  MATTER_MODEL_ABC_BASE_URL: "https://relay.example/v1",
  MATTER_MODEL_ABC_API_KEY: "key-chat",
  MATTER_MODEL_ABC_MODELS: "Qwen-flash",
});

function singleStation(overrides: Record<string, string | undefined>) {
  return {
    MATTER_IMAGE_POOL: "draw",
    MATTER_IMAGE_DRAW_BASE_URL: "https://relay.example/v1",
    MATTER_IMAGE_DRAW_API_KEY: "key",
    MATTER_IMAGE_DRAW_MODELS: "image-model",
    MATTER_IMAGE_DRAW_SHAPE: "chat",
    ...overrides,
  };
}

beforeEach(() => resetPoolHealth());
afterEach(() => resetPoolHealth());

describe("readImagePool", () => {
  it("parses the image namespace and attaches the transport for each shape", () => {
    const pool = readImagePool(IMAGE_ENVIRONMENT);

    expect(pool.map((entry) => [entry.station, entry.model, entry.baseUrl])).toEqual([
      ["draw-chat", "gemini-image", "https://relay.example/v1"],
      ["draw-images", "gpt-image-a", "https://relay.example/v1"],
      ["draw-images", "gpt-image-b", "https://relay.example/v1"],
    ]);
    expect(pool[0]?.transport?.id).toBe(imageChatTransport.id);
    expect(pool[1]?.transport?.id).toBe(imageGenerationsTransport.id);
    expect(pool[2]?.transport?.id).toBe(imageGenerationsTransport.id);
    expect(imageChatTransport.id).not.toBe(imageGenerationsTransport.id);
    expect(pool.every((entry) => entry.apiKey === "key-one")).toBe(true);
  });

  it("is empty for a chat-only environment", () => {
    expect(readImagePool(CHAT_ENVIRONMENT)).toEqual([]);
    expect(readImagePool({ ...CHAT_ENVIRONMENT, MATTER_LABEL_POOL: "legacy" })).toEqual([]);
  });

  it("stays invisible to the chat reader", () => {
    expect(readImagePool(IMAGE_ENVIRONMENT).length).toBe(3);
    expect(readModelPool(IMAGE_ENVIRONMENT)).toEqual([]);
  });

  it("leaves the chat pool unchanged when both namespaces are configured", () => {
    const both = { ...CHAT_ENVIRONMENT, ...IMAGE_ENVIRONMENT };

    expect(readModelPool(both)).toEqual(readModelPool(CHAT_ENVIRONMENT));
    expect(readModelPool(both).map((entry) => entry.model)).toEqual(["Qwen-flash"]);
    expect(readImagePool(both)).toEqual(readImagePool(IMAGE_ENVIRONMENT));
  });

  it("skips a station whose shape is missing or unknown", () => {
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_SHAPE: undefined }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_SHAPE: "" }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_SHAPE: "completions" }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_SHAPE: "Chat" }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_SHAPE: " images " }))[0]?.transport?.id)
      .toBe(imageGenerationsTransport.id);
  });

  it("does not let one bad station disturb the others", () => {
    const pool = readImagePool({
      ...IMAGE_ENVIRONMENT,
      MATTER_IMAGE_DRAW_CHAT_SHAPE: "nope",
    });

    expect(pool.map((entry) => entry.station)).toEqual(["draw-images", "draw-images"]);
  });

  it("skips non-https bases other than loopback, and stations missing a key or model", () => {
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_BASE_URL: "http://relay.example/v1" })))
      .toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_BASE_URL: "http://localhost:8080/v1" })))
      .toHaveLength(1);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_API_KEY: "  " }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_API_KEY: undefined }))).toEqual([]);
    expect(readImagePool(singleStation({ MATTER_IMAGE_DRAW_MODELS: " , " }))).toEqual([]);
  });

  it("ignores ENABLE_THINKING for image stations, valid or not", () => {
    for (const value of ["true", "false", "maybe"]) {
      const pool = readImagePool(singleStation({ MATTER_IMAGE_DRAW_ENABLE_THINKING: value }));

      expect(pool).toHaveLength(1);
      expect(pool[0]).not.toHaveProperty("enableThinking");
    }
  });

  it("does not fall back to the legacy or model namespaces", () => {
    expect(readImagePool({
      MATTER_MODEL_POOL: "draw",
      MATTER_MODEL_DRAW_BASE_URL: "https://relay.example/v1",
      MATTER_MODEL_DRAW_API_KEY: "key",
      MATTER_MODEL_DRAW_MODELS: "image-model",
      MATTER_MODEL_DRAW_SHAPE: "chat",
    })).toEqual([]);
  });
});

describe("IMAGE_POOL_LIMITS", () => {
  it("covers the base64 form of the largest accepted image plus an envelope", () => {
    const base64Length = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

    expect(IMAGE_POOL_LIMITS.maxResponseBytes).toBeGreaterThan(base64Length);
    expect(IMAGE_POOL_LIMITS.maxResponseBytes).toBeGreaterThan(DEFAULT_POOL_LIMITS.maxResponseBytes);
  });

  it("keeps a single long attempt whole and the cooldown policy unchanged", () => {
    expect(IMAGE_POOL_LIMITS.maxAttemptShare).toBe(0.95);
    expect(IMAGE_POOL_LIMITS.failuresBeforeCooldown).toBe(2);
    expect(IMAGE_POOL_LIMITS.cooldownMs).toBe(60_000);
    expect(IMAGE_POOL_LIMITS.minimumAttemptMs).toBeGreaterThanOrEqual(10_000);
    expect(IMAGE_POOL_LIMITS.maxOutputTokens).toBeGreaterThan(0);
  });
});

describe("candidate health", () => {
  it("is keyed per scenario, so matter-inquiry failures do not demote matter-image", async () => {
    const pool: readonly PoolCandidate[] = [
      { station: "a", baseUrl: "https://relay.example/v1", apiKey: "k", model: "first" },
      { station: "b", baseUrl: "https://relay.example/v1", apiKey: "k", model: "steady" },
    ];
    const tried: string[] = [];
    // Neutral limits: this test is about how health is keyed per scenario, and
    // the image limits' one-attempt cap would stop the second candidate being
    // tried at all.
    const adapter = createPoolAdapter(pool, DEFAULT_POOL_LIMITS, Date.now, async (_url, init) => {
      const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
      tried.push(model);
      if (model === "steady") {
        return new Response(
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("no", { status: 503 });
    });
    const call = (scenario: "matter-inquiry" | "matter-image") => adapter({
      scenario,
      prompt: "p",
      locale: "en",
      input: null,
      deadlineMs: 30_000,
      maxOutputTokens: 1,
    }, new AbortController().signal);

    await call("matter-inquiry");
    await call("matter-inquiry");
    tried.length = 0;
    await call("matter-inquiry");
    expect(tried).toEqual(["steady"]);

    tried.length = 0;
    await call("matter-image");
    expect(tried).toEqual(["first", "steady"]);
  });
});

describe("one generation per request", () => {
  const pool: readonly PoolCandidate[] = [
    { station: "a", baseUrl: "https://relay.example/v1", apiKey: "k", model: "first" },
    { station: "b", baseUrl: "https://relay.example/v1", apiKey: "k", model: "second" },
  ];

  /** A relay that answered, and answered with something the pool cannot use. */
  function unusableThenGood(tried: string[]): typeof fetch {
    return (async (_url, init) => {
      const model = (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
      tried.push(model);
      return model === "first"
        // Finished and unusable: exactly the response a billed generation that
        // came back as a link, or was refused after rendering, produces.
        ? new Response(
          JSON.stringify({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
        : new Response(
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
    }) as typeof fetch;
  }

  const call = (adapter: ReturnType<typeof createPoolAdapter>) => adapter({
    scenario: "matter-image",
    prompt: "p",
    locale: "en",
    input: null,
    deadlineMs: 40_000,
    maxOutputTokens: 1,
  }, new AbortController().signal);

  it("never starts a second candidate after the first, so a billed render is not paid for twice", async () => {
    const tried: string[] = [];
    const adapter = createPoolAdapter(pool, IMAGE_POOL_LIMITS, Date.now, unusableThenGood(tried));
    await expect(call(adapter)).rejects.toBeDefined();
    expect(tried).toEqual(["first"]);
  });

  it("is the cap that does it: the same setup without it does fall through", async () => {
    // Guards the test above against passing for the wrong reason — if neither
    // limit set changed behaviour, the cap would be doing nothing.
    const tried: string[] = [];
    const adapter = createPoolAdapter(pool, DEFAULT_POOL_LIMITS, Date.now, unusableThenGood(tried));
    await expect(call(adapter)).resolves.toEqual({ text: "ok" });
    expect(tried).toEqual(["first", "second"]);
  });

  it("applies to a plain HTTP failure as well, not only an unusable completion", async () => {
    const tried: string[] = [];
    const failing = (async (_url, init) => {
      tried.push((JSON.parse(String((init as RequestInit).body)) as { model: string }).model);
      return new Response("no", { status: 503 });
    }) as typeof fetch;
    const adapter = createPoolAdapter(pool, IMAGE_POOL_LIMITS, Date.now, failing);
    await expect(call(adapter)).rejects.toBeDefined();
    expect(tried).toEqual(["first"]);
  });

  it("declares the image pool as one attempt", () => {
    expect(IMAGE_POOL_LIMITS.maxCandidateAttempts).toBe(1);
  });

  it("leaves text scenarios uncapped", () => {
    expect(DEFAULT_POOL_LIMITS.maxCandidateAttempts).toBeUndefined();
  });
});

