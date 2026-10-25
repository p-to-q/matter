import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createImageSurfaceAvailabilityCache,
  readImageSurfaceAvailability,
  type ImageSurfaceAvailability,
} from "../interaction/image-surface-availability";
import {
  pictureAvailabilityWarmWanted,
  pictureOpeningAvailability,
  warmPictureAvailability,
} from "./picture-availability-timing";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function health(imageGeneration: string): Response {
  return new Response(JSON.stringify({
    protocolVersion: 1,
    status: "ok",
    surfaces: { material: "available", imageGeneration },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

/** The page's own memo over the real reader, answering after `latencyMs` of fake time. */
function page(state: { imageGeneration: string; latencyMs: number }) {
  const requests: number[] = [];
  const send = vi.fn(async () => {
    requests.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, state.latencyMs));
    return health(state.imageGeneration);
  });
  const cache = createImageSurfaceAvailabilityCache({
    read: () => readImageSurfaceAvailability({ fetch: send as unknown as typeof fetch }),
  });
  return { cache, requests, send };
}

describe("when the picture control's availability is asked", () => {
  it("asks nothing until a mark is shown: a page that is only loaded costs no request", async () => {
    const { send } = page({ imageGeneration: "off", latencyMs: 20 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("asks only for a shown mark on a page that has a picture store", () => {
    expect(pictureAvailabilityWarmWanted({ markShown: true, hasPictureStore: true })).toBe(true);
    expect(pictureAvailabilityWarmWanted({ markShown: false, hasPictureStore: true })).toBe(false);
    expect(pictureAvailabilityWarmWanted({ markShown: true, hasPictureStore: false })).toBe(false);
    expect(pictureAvailabilityWarmWanted({ markShown: false, hasPictureStore: false })).toBe(false);
  });

  it("costs one request for any number of marks and clicks inside the window, closed or not", async () => {
    for (const imageGeneration of ["unavailable", "available"]) {
      const { cache, send } = page({ imageGeneration, latencyMs: 30 });
      for (let click = 0; click < 25; click += 1) {
        warmPictureAvailability(cache);
        await vi.advanceTimersByTimeAsync(2_000);
        void pictureOpeningAvailability(cache, true);
      }
      expect(send, imageGeneration).toHaveBeenCalledOnce();
    }
  });

  it("asks a closed deployment again no sooner than a minute later, and then once", async () => {
    const { cache, requests } = page({ imageGeneration: "unavailable", latencyMs: 30 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(59_000);
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(500);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    warmPictureAvailability(cache);
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(100);
    expect(requests).toHaveLength(2);
    expect(requests[1]! - requests[0]!).toBeGreaterThanOrEqual(60_000);
  });

  it("shares the read that is already in flight with a mark shown a moment later", async () => {
    const { cache, send } = page({ imageGeneration: "available", latencyMs: 400 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(150);
    warmPictureAvailability(cache);
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("when an opening hears the answer", () => {
  it("decides its row from the answer the mark's read already brought", async () => {
    const { cache } = page({ imageGeneration: "available", latencyMs: 40 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(300);
    expect(pictureOpeningAvailability(cache, true)).toBe("available");
  });

  it("decides unavailable, once, when the answer is still on its way, and never revises that opening", async () => {
    const { cache } = page({ imageGeneration: "available", latencyMs: 400 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(100);
    const opening: ImageSurfaceAvailability = pictureOpeningAvailability(cache, true);
    expect(opening).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(1_000);
    // The value an opening took is a value, not a subscription: it is still what it was.
    expect(opening).toBe("unavailable");
    // The next opening hears the answer.
    expect(pictureOpeningAvailability(cache, true)).toBe("available");
  });

  it("keeps a lapsed answer for the next opening while the renewing read is still out", async () => {
    const { cache, requests } = page({ imageGeneration: "available", latencyMs: 30 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(cache.peek()).toBe("unavailable");
    warmPictureAvailability(cache);
    // A second read is out, and the opening still sees what the page last learned.
    expect(requests).toHaveLength(2);
    expect(pictureOpeningAvailability(cache, true)).toBe("available");
  });

  it("is unavailable, and unknown means no control, until anything has been learned", () => {
    const { cache, send } = page({ imageGeneration: "available", latencyMs: 30 });
    expect(pictureOpeningAvailability(cache, true)).toBe("unavailable");
    expect(send).not.toHaveBeenCalled();
  });

  it("is unavailable on a page with no picture store, whatever the page has learned", async () => {
    const { cache } = page({ imageGeneration: "available", latencyMs: 30 });
    warmPictureAvailability(cache);
    await vi.advanceTimersByTimeAsync(100);
    expect(pictureOpeningAvailability(cache, false)).toBe("unavailable");
  });

  it("hears a failed read as unavailable and does not repeat it inside the window", async () => {
    const send = vi.fn(async () => { throw new Error("offline"); });
    const cache = createImageSurfaceAvailabilityCache({
      read: () => readImageSurfaceAvailability({ fetch: send as unknown as typeof fetch }),
    });
    for (let mark = 0; mark < 5; mark += 1) {
      warmPictureAvailability(cache);
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(send).toHaveBeenCalledOnce();
    expect(pictureOpeningAvailability(cache, true)).toBe("unavailable");
  });
});
