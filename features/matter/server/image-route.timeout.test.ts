import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Each step's own deadline is normally shorter than the route's, so the route's
// timer can only end a step if the lattice drifts. This file makes it drift on
// purpose: both steps are allowed longer than the route.
vi.mock("../config/model-deadlines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/model-deadlines")>();
  return {
    ...actual,
    MODEL_DEADLINES: Object.freeze({
      ...actual.MODEL_DEADLINES,
      image: Object.freeze({ ...actual.MODEL_DEADLINES.image, briefMs: 200_000, providerMs: 200_000 }),
    }),
  };
});
import { IMAGE_REQUEST_VERSION } from "../protocol/image-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import type { ScenarioAdapter } from "./harness";
import { resetImageAdmissionForTests } from "./image-admission";
import { imageErrorResponse } from "./image-errors";
import { FIXTURE_IMAGE_BRIEF, FIXTURE_IMAGE_DATA_URL } from "./image-fixtures";
import {
  IMAGE_ROUTE_TIMEOUT_MS,
  handleImageRequest,
  resetImageGovernors,
  type ImageAdapters,
} from "./image-route";

const SAME_ORIGIN = Object.freeze({
  origin: "https://matter.test",
  "sec-fetch-site": "same-origin",
});

beforeEach(() => {
  resetImageAdmissionForTests();
  resetImageGovernors();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function adapters(image: ScenarioAdapter): ImageAdapters {
  return Object.freeze({
    brief: vi.fn<ScenarioAdapter>(async () => ({ text: FIXTURE_IMAGE_BRIEF })),
    image: vi.fn<ScenarioAdapter>(image),
  });
}

const BODY = {
  protocolVersion: PROTOCOL_VERSION,
  requestVersion: IMAGE_REQUEST_VERSION,
  id: "img_abc",
  locale: "en-US",
  passage: { nodeId: "thought1", text: "A passage." },
};

async function answerAfter(pending: Promise<Response>, ms: number): Promise<Response | null> {
  let response: Response | null = null;
  void pending.then((value) => { response = value; });
  await vi.advanceTimersByTimeAsync(ms);
  return response;
}

describe("the route's own timer and what a request has already cost", () => {
  it("does not invite a retry when the timer fires while the renderer is running", async () => {
    vi.useFakeTimers();
    const opened = Date.now();
    // The route believes it has a minute more than its timer allows, so the
    // renderer's ceiling outlasts the timer and the timer is what ends the request.
    vi.setSystemTime(opened + 60_000);
    const pair = adapters(() => new Promise(() => undefined));
    const pending = handleImageRequest(
      new Request("https://matter.test/api/image", {
        method: "POST",
        headers: { "content-type": "application/json", ...SAME_ORIGIN },
        body: JSON.stringify(BODY),
      }),
      pair,
    ).catch(imageErrorResponse);
    vi.setSystemTime(opened);
    const answered = await answerAfter(pending, IMAGE_ROUTE_TIMEOUT_MS + 1_000);
    expect(pair.image).toHaveBeenCalledOnce();
    expect(answered?.status).toBe(504);
    // The renderer began and may have been paid; a retry would pay for a second picture.
    expect(await answered?.json()).toMatchObject({ error: { code: "IMAGE_UNAVAILABLE", retryable: false } });
  });

  it("invites a retry when the timer fires during the text step, before any render began", async () => {
    vi.useFakeTimers();
    const pair = Object.freeze({
      brief: vi.fn<ScenarioAdapter>(() => new Promise(() => undefined)),
      image: vi.fn<ScenarioAdapter>(async () => ({ text: FIXTURE_IMAGE_DATA_URL })),
    });
    const pending = handleImageRequest(
      new Request("https://matter.test/api/image", {
        method: "POST",
        headers: { "content-type": "application/json", ...SAME_ORIGIN },
        body: JSON.stringify(BODY),
      }),
      pair,
    ).catch(imageErrorResponse);
    const answered = await answerAfter(pending, IMAGE_ROUTE_TIMEOUT_MS + 1_000);
    expect(pair.brief).toHaveBeenCalledOnce();
    expect(answered?.status).toBe(504);
    expect(await answered?.json()).toMatchObject({ error: { code: "IMAGE_UNAVAILABLE", retryable: true } });
    expect(pair.image).not.toHaveBeenCalled();
  });

  it("invites a retry when the timer fires before any step began", async () => {
    vi.useFakeTimers();
    const pair = adapters(async () => ({ text: FIXTURE_IMAGE_DATA_URL }));
    const pending = handleImageRequest(
      new Request("https://matter.test/api/image", {
        method: "POST",
        headers: { "content-type": "application/json", ...SAME_ORIGIN },
        body: new ReadableStream<Uint8Array>({ start: () => undefined }),
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
      pair,
    ).catch(imageErrorResponse);
    const answered = await answerAfter(pending, IMAGE_ROUTE_TIMEOUT_MS + 1_000);
    expect(answered?.status).toBe(504);
    expect(await answered?.json()).toMatchObject({ error: { code: "IMAGE_UNAVAILABLE", retryable: true } });
    expect(pair.brief).not.toHaveBeenCalled();
    expect(pair.image).not.toHaveBeenCalled();
  });
});
