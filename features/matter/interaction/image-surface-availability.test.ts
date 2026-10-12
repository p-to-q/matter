import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createImageSurfaceAvailabilityCache,
  readImageSurfaceAvailability,
  type ImageSurfaceAvailability,
} from "./image-surface-availability";

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
process.on("unhandledRejection", onUnhandled);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(unhandled).toEqual([]);
});

function health(imageGeneration: unknown, extra: Record<string, unknown> = {}): unknown {
  return {
    protocolVersion: 1,
    status: "ok",
    surfaces: { material: "available", inquiry: "unavailable", imageGeneration, ...extra },
  };
}

function json(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const never = () => new Promise<Response>(() => undefined);

describe("readImageSurfaceAvailability", () => {
  describe("request", () => {
    it("asks the same-origin health route once, uncached, refusing redirects", async () => {
      const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return json(health("available"));
      });
      await readImageSurfaceAvailability({ fetch: send });
      expect(send).toHaveBeenCalledOnce();
      const [url, init] = send.mock.calls[0]!;
      expect(url).toBe("/matter/api/health");
      expect(init?.method).toBe("GET");
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
      expect(init?.credentials).toBeUndefined();
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("falls back to the global transport when none is injected", async () => {
      const global = vi.fn(async () => json(health("available")));
      vi.stubGlobal("fetch", global);
      await expect(readImageSurfaceAvailability()).resolves.toBe("available");
      expect(global).toHaveBeenCalledOnce();
    });

    it("uses the injected transport and never the global one", async () => {
      vi.stubGlobal("fetch", vi.fn(() => { throw new Error("global fetch used"); }));
      await expect(readImageSurfaceAvailability({ fetch: async () => json(health("available")) }))
        .resolves.toBe("available");
    });
  });

  describe("the value", () => {
    it("is available only for the literal available state", async () => {
      await expect(readImageSurfaceAvailability({ fetch: async () => json(health("available")) }))
        .resolves.toBe("available");
    });

    it.each([
      ["fixture"], ["user-configurable"], ["unavailable"], ["Available"], [" available"],
      ["available "], ["AVAILABLE"], [""], [true], [1], [null], [["available"]], [{ value: "available" }],
    ])("is unavailable for %j", async (value) => {
      await expect(readImageSurfaceAvailability({ fetch: async () => json(health(value)) }))
        .resolves.toBe("unavailable");
    });

    it("is unavailable when the surface is absent", async () => {
      const body = { status: "ok", surfaces: { material: "available" } };
      await expect(readImageSurfaceAvailability({ fetch: async () => json(body) })).resolves.toBe("unavailable");
    });

    it.each([
      ["null", null],
      ["an array", [health("available")]],
      ["a string", "available"],
      ["a number", 1],
      ["no surfaces", { status: "ok" }],
      ["null surfaces", { surfaces: null }],
      ["array surfaces", { surfaces: ["available"] }],
      ["string surfaces", { surfaces: "available" }],
      ["a misplaced field", { imageGeneration: "available", surfaces: {} }],
      ["a nested misplaced field", { surfaces: { nested: { imageGeneration: "available" } } }],
    ])("is unavailable for an unknown shape: %s", async (_name, body) => {
      await expect(readImageSurfaceAvailability({ fetch: async () => json(body) })).resolves.toBe("unavailable");
    });

    it("reads nothing but the one field", async () => {
      const body = { surfaces: { imageGeneration: "available" }, unrelated: { anything: [1, 2, 3] } };
      await expect(readImageSurfaceAvailability({ fetch: async () => json(body) })).resolves.toBe("available");
    });
  });

  describe("every failure is unavailable, never a throw, never a second attempt", () => {
    it.each([201, 202, 301, 400, 404, 500, 503])("for status %i carrying an available body", async (status) => {
      const send = vi.fn(async () => json(health("available"), { status }));
      await expect(readImageSurfaceAvailability({ fetch: send })).resolves.toBe("unavailable");
      expect(send).toHaveBeenCalledOnce();
    });

    it.each([204, 304])("for the empty status %i", async (status) => {
      const send = vi.fn(async () => new Response(null, { status }));
      await expect(readImageSurfaceAvailability({ fetch: send })).resolves.toBe("unavailable");
      expect(send).toHaveBeenCalledOnce();
    });

    it("for a rejected transport", async () => {
      const send = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
      await expect(readImageSurfaceAvailability({ fetch: send })).resolves.toBe("unavailable");
      expect(send).toHaveBeenCalledOnce();
    });

    it("for a transport that throws synchronously", async () => {
      const send = vi.fn(() => { throw new Error("boom"); });
      await expect(readImageSurfaceAvailability({ fetch: send as unknown as typeof fetch })).resolves.toBe("unavailable");
      expect(send).toHaveBeenCalledOnce();
    });

    it.each([
      ["unparsable text", "not json"],
      ["a truncated document", '{"surfaces":{"imageGeneration":"avail'],
      ["an empty body", ""],
    ])("for %s", async (_name, text) => {
      await expect(readImageSurfaceAvailability({ fetch: async () => json(text) })).resolves.toBe("unavailable");
    });

    it("for invalid UTF-8", async () => {
      const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
      await expect(readImageSurfaceAvailability({ fetch: async () => new Response(bytes, { status: 200 }) }))
        .resolves.toBe("unavailable");
    });

    it("for a declared body over the bound, even when the document would say available", async () => {
      const response = json(health("available"), { headers: { "content-length": String(8 * 1024 + 1) } });
      await expect(readImageSurfaceAvailability({ fetch: async () => response })).resolves.toBe("unavailable");
    });

    it("for a streamed body that crosses the bound with no declared length", async () => {
      const filler = " ".repeat(9 * 1024);
      const text = `${JSON.stringify(health("available")).slice(0, -1)},"pad":"${filler}"}`;
      const response = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }), { status: 200 });
      await expect(readImageSurfaceAvailability({ fetch: async () => response })).resolves.toBe("unavailable");
    });

    it("for a body that errors mid-stream", async () => {
      const response = new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error("reset")); },
      }), { status: 200 });
      await expect(readImageSurfaceAvailability({ fetch: async () => response })).resolves.toBe("unavailable");
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("for an invalid deadline %s, without sending", async (deadlineMs) => {
      const send = vi.fn(async () => json(health("available")));
      await expect(readImageSurfaceAvailability({ fetch: send, deadlineMs })).resolves.toBe("unavailable");
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("time and cancellation", () => {
    it("gives up on a silent transport after three seconds", async () => {
      vi.useFakeTimers();
      const reading = readImageSurfaceAvailability({ fetch: never });
      let settled: ImageSurfaceAvailability | null = null;
      void reading.then((value) => { settled = value; });
      await vi.advanceTimersByTimeAsync(2_999);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe("unavailable");
    });

    it("honours a shorter injected deadline", async () => {
      vi.useFakeTimers();
      const reading = readImageSurfaceAvailability({ fetch: never, deadlineMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await expect(reading).resolves.toBe("unavailable");
    });

    it("gives up on a body that never finishes", async () => {
      vi.useFakeTimers();
      const stalled = new Response(new ReadableStream<Uint8Array>({ start() { /* never closes */ } }), { status: 200 });
      const reading = readImageSurfaceAvailability({ fetch: async () => stalled });
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(reading).resolves.toBe("unavailable");
    });

    it("leaves no timer behind once it has answered", async () => {
      vi.useFakeTimers();
      await readImageSurfaceAvailability({ fetch: async () => json(health("available")) });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("stops when the caller aborts, and does not send when already aborted", async () => {
      const controller = new AbortController();
      const reading = readImageSurfaceAvailability({ fetch: never, signal: controller.signal });
      controller.abort();
      await expect(reading).resolves.toBe("unavailable");

      const send = vi.fn(async () => json(health("available")));
      await expect(readImageSurfaceAvailability({ fetch: send, signal: controller.signal })).resolves.toBe("unavailable");
    });
  });
});

describe("image availability cache", () => {
  function harness(ttlMs?: number) {
    let clock = 1_000;
    const read = vi.fn(async (): Promise<ImageSurfaceAvailability> => "available");
    const cache = createImageSurfaceAvailabilityCache({
      read,
      now: () => clock,
      ...(ttlMs === undefined ? {} : { ttlMs }),
    });
    return { cache, read, advance: (ms: number) => { clock += ms; } };
  }

  it("answers unavailable before any answer", () => {
    const { cache, read } = harness();
    expect(cache.peek()).toBe("unavailable");
    expect(read).not.toHaveBeenCalled();
  });

  it("shares one read among every caller while it is in flight", async () => {
    let finish!: (value: ImageSurfaceAvailability) => void;
    const read = vi.fn(() => new Promise<ImageSurfaceAvailability>((resolve) => { finish = resolve; }));
    const cache = createImageSurfaceAvailabilityCache({ read });
    const first = cache.get();
    const second = cache.get();
    const third = cache.get();
    expect(read).toHaveBeenCalledOnce();
    expect(cache.peek()).toBe("unavailable");
    finish("available");
    await expect(Promise.all([first, second, third])).resolves.toEqual(["available", "available", "available"]);
    expect(read).toHaveBeenCalledOnce();
    expect(cache.peek()).toBe("available");
  });

  it("remembers the answer for the default minute and reads again after it", async () => {
    const { cache, read, advance } = harness();
    await cache.get();
    advance(59_999);
    await expect(cache.get()).resolves.toBe("available");
    expect(cache.peek()).toBe("available");
    expect(read).toHaveBeenCalledOnce();

    advance(1);
    expect(cache.peek()).toBe("unavailable");
    await cache.get();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("honours an injected ttl", async () => {
    const { cache, read, advance } = harness(5_000);
    await cache.get();
    advance(4_999);
    await cache.get();
    expect(read).toHaveBeenCalledOnce();
    advance(1);
    await cache.get();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("measures the ttl from when the read finished, not when it began", async () => {
    let clock = 0;
    let finish!: (value: ImageSurfaceAvailability) => void;
    const read = vi.fn(() => new Promise<ImageSurfaceAvailability>((resolve) => { finish = resolve; }));
    const cache = createImageSurfaceAvailabilityCache({ read, ttlMs: 1_000, now: () => clock });
    const reading = cache.get();
    clock = 900;
    finish("available");
    await reading;
    clock = 1_800;
    expect(cache.peek()).toBe("available");
    clock = 1_900;
    expect(cache.peek()).toBe("unavailable");
  });

  it("invalidates a remembered answer", async () => {
    const { cache, read } = harness();
    await cache.get();
    cache.invalidate();
    expect(cache.peek()).toBe("unavailable");
    await cache.get();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("invalidates a read in flight: its answer reaches its callers but is not remembered", async () => {
    const finishers: Array<(value: ImageSurfaceAvailability) => void> = [];
    const read = vi.fn(() => new Promise<ImageSurfaceAvailability>((resolve) => { finishers.push(resolve); }));
    const cache = createImageSurfaceAvailabilityCache({ read });
    const stale = cache.get();
    cache.invalidate();
    const current = cache.get();
    expect(read).toHaveBeenCalledTimes(2);

    finishers[0]!("available");
    await expect(stale).resolves.toBe("available");
    expect(cache.peek()).toBe("unavailable");

    finishers[1]!("unavailable");
    await expect(current).resolves.toBe("unavailable");
    expect(cache.peek()).toBe("unavailable");
    await cache.get();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("treats a failed read as an answer and does not repeat it inside the ttl", async () => {
    const read = vi.fn(async (): Promise<ImageSurfaceAvailability> => { throw new Error("boom"); });
    const cache = createImageSurfaceAvailabilityCache({ read });
    await expect(cache.get()).resolves.toBe("unavailable");
    await expect(cache.get()).resolves.toBe("unavailable");
    expect(read).toHaveBeenCalledOnce();
  });

  it("survives a read that throws synchronously", async () => {
    const read = vi.fn((): Promise<ImageSurfaceAvailability> => { throw new Error("boom"); });
    const cache = createImageSurfaceAvailabilityCache({ read });
    await expect(cache.get()).resolves.toBe("unavailable");
  });

  it("only ever hands out the two literal answers", async () => {
    const read = vi.fn(async () => "fixture" as unknown as ImageSurfaceAvailability);
    const cache = createImageSurfaceAvailabilityCache({ read });
    await expect(cache.get()).resolves.toBe("unavailable");
    expect(cache.peek()).toBe("unavailable");
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a ttl of %s", (ttlMs) => {
    expect(() => createImageSurfaceAvailabilityCache({ read: async () => "available", ttlMs })).toThrow(RangeError);
  });
});
