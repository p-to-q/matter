import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTranscription, TranscriptionClientError } from "./transcription-client";

afterEach(() => vi.unstubAllGlobals());

describe("requestTranscription", () => {
  it("accepts only the exact echoed success envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      protocolVersion: "0.2",
      interactionId: "voice_1",
      attempt: 1,
      transcript: "保留原来的表达。",
    })));
    await expect(request()).resolves.toMatchObject({ transcript: "保留原来的表达。" });
  });

  it.each([
    ["extra field", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 1, transcript: "text", provider: "hidden" }],
    ["wrong attempt", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 2, transcript: "text" }],
    ["oversize text", { protocolVersion: "0.2", interactionId: "voice_1", attempt: 1, transcript: "念".repeat(2_001) }],
  ] as const)("rejects %s success responses whole", async (_name, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    await expect(request()).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
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
    vi.useRealTimers();
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
