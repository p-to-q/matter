import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TRANSCRIPTION_RESPONSE_BYTES } from "../protocol/transcription-contract";
import { requestTranscription, TranscriptionClientError } from "./transcription-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestTranscription", () => {
  it("accepts only the exact echoed success envelope", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({
        protocolVersion: "0.2",
        interactionId: "voice_1",
        attempt: 1,
        transcript: "保留原来的表达。",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(request()).resolves.toMatchObject({ transcript: "保留原来的表达。" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
  });

  it.each([
    ["extra field", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 1, transcript: "text", provider: "hidden" }],
    ["wrong attempt", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 2, transcript: "text" }],
    ["oversize text", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 1, transcript: "念".repeat(2_001) }],
  ] as const)("rejects %s success responses whole", async (_name, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    await expect(request()).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });

  it("accepts only canonical bounded swap-direction while preserving existing purposes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      protocolVersion: "0.2",
      interactionId: "voice_1",
      attempt: 1,
      transcript: "x".repeat(241),
    })));
    await expect(request({ purpose: "swap-direction" }))
      .rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    await expect(request({ purpose: "direction" }))
      .resolves.toMatchObject({ transcript: "x".repeat(241) });
  });

  it("rejects unknown error codes and extra error fields", async () => {
    for (const error of [
      { code: "PROVIDER_SECRET", message: "secret", retryable: true },
      { code: "NO_SPEECH", message: "No words", retryable: true, provider: "hidden" },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error }, { status: 422 })));
      await expect(request()).rejects.toEqual(
        new TranscriptionClientError(
          "TRANSCRIPTION_FAILED",
          "The recording could not be transcribed.",
          true,
        ),
      );
    }
  });

  it("refuses declared and actually oversized response bodies", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => undefined),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(stalled, {
        headers: { "content-length": String(MAX_TRANSCRIPTION_RESPONSE_BYTES + 1) },
      }))
      .mockResolvedValueOnce(new Response("x".repeat(MAX_TRANSCRIPTION_RESPONSE_BYTES + 1)));
    vi.stubGlobal("fetch", fetchMock);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(request()).rejects.toMatchObject({
        code: "INVALID_PROVIDER_RESPONSE",
        retryable: true,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed JSON and UTF-8 within the response bound", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{"))
      .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xfe])));
    vi.stubGlobal("fetch", fetchMock);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(request()).rejects.toMatchObject({
        code: "INVALID_PROVIDER_RESPONSE",
        retryable: true,
      });
    }
  });

  it("bounds a fetch that never settles and reports a retryable timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    const pending = request({ timeoutMs: 50 });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "TRANSCRIPTION_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(50);

    await assertion;
  });

  it("keeps the same deadline while a response body is stalled", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));

    const pending = request({ timeoutMs: 50 });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "TRANSCRIPTION_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(cancelled).toBe(true);
  });

  it("keeps person cancellation distinct from a deadline", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    ));

    const pending = request({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels a stalled response body when the owning interaction is cancelled", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));

    const pending = request({ signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new DOMException("Voice was cancelled.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });
});

function request(overrides: Partial<Parameters<typeof requestTranscription>[0]> = {}) {
  return requestTranscription({
    interactionId: "voice_1",
    attempt: 1,
    purpose: "admission",
    locale: "zh-CN",
    durationMs: 800,
    audio: new Blob(["voice"], { type: "audio/webm" }),
    signal: new AbortController().signal,
    ...overrides,
  });
}
