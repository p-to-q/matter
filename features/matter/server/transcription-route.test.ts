import { afterEach, describe, expect, it, vi } from "vitest";
import { maxDuration, POST } from "../../../app/api/transcribe/route";
import {
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_REQUEST_BYTES,
  TRANSCRIPTION_SERVER_TIMEOUT_MS,
} from "./transcription-contract";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe("Matter transcription route", () => {
  it("uses the configured fixture adapter through the strict multipart contract", async () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "fixture";
    process.env.MATTER_FIXTURE_ADMISSION_TRANSCRIPT = "原样留下这句话。";
    const request = requestFrom(validForm());
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocolVersion: "0.2",
      interactionId: "voice_01",
      attempt: 1,
      transcript: "原样留下这句话。",
    });
  });

  it("refuses a fixture request when the public build disables voice", async () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "fixture";
    process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED = "false";

    const response = await POST(requestFrom(validForm()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "TRANSCRIPTION_UNAVAILABLE", retryable: true },
    });
  });

  it("does not let the browser select fixture mode or a provider", async () => {
    const form = validForm();
    form.append("fixtureMode", "true");
    const response = await POST(requestFrom(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it.each([
    ["duplicate", (form: FormData) => form.append("attempt", "2")],
    ["bad attempt", (form: FormData) => form.set("attempt", "1.5")],
    ["bad locale", (form: FormData) => form.set("locale", "../../secret")],
    ["unsupported locale", (form: FormData) => form.set("locale", "en-GB")],
    ["bad purpose", (form: FormData) => form.set("purpose", "delete")],
    ["bad protocol", (form: FormData) => form.set("protocolVersion", "0.1")],
  ] as const)("rejects %s fields before transcription", async (_name, mutate) => {
    const form = validForm();
    mutate(form);
    const response = await POST(requestFrom(form));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("rejects a non-multipart request before parsing", async () => {
    const malformed = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));

    expect(malformed.status).toBe(415);
  });

  it("fast-fails and cancels an honestly oversized declared request", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_AUDIO_REQUEST_BYTES + 1));
      },
      cancel: cancelled,
    });
    const oversized = await POST(requestFromStream(body, {
      "content-length": String(MAX_AUDIO_REQUEST_BYTES + 1),
    }));

    expect(oversized.status).toBe(413);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it.each([
    ["without Content-Length", undefined],
    ["with a falsely small Content-Length", "1"],
  ])("rejects actual request bytes over the limit %s", async (_name, contentLength) => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_AUDIO_REQUEST_BYTES + 1));
      },
      cancel: cancelled,
    });
    const response = await POST(requestFromStream(body, {
      ...(contentLength === undefined ? {} : { "content-length": contentLength }),
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUDIO_TOO_LARGE",
        message: "The recording is too large.",
        retryable: false,
      },
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("rejects actual request bytes that exceed the limit across chunks", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_AUDIO_REQUEST_BYTES - 1));
        controller.enqueue(new Uint8Array(2));
      },
      cancel: cancelled,
    });

    const response = await POST(requestFromStream(body));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUDIO_TOO_LARGE" },
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("admits the exact byte limit to multipart validation", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_AUDIO_REQUEST_BYTES - 1));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
      cancel: cancelled,
    });

    const response = await POST(requestFromStream(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("settles a stalled request stream at the route-entry deadline", async () => {
    vi.useFakeTimers();
    try {
      const cancelled = vi.fn();
      const responsePromise = POST(requestFromStream(new ReadableStream({ cancel: cancelled })));
      let settled = false;
      void responsePromise.then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(TRANSCRIPTION_SERVER_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const response = await responsePromise;
      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "TRANSCRIPTION_TIMEOUT",
          message: "Speech transcription timed out.",
          retryable: true,
        },
      });
      expect(cancelled).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles client cancellation without exposing the abort reason", async () => {
    const controller = new AbortController();
    const cancelled = vi.fn();
    const responsePromise = POST(requestFromStream(
      new ReadableStream({ cancel: cancelled }),
      {},
      controller.signal,
    ));

    controller.abort(new Error("private client reason"));

    const response = await responsePromise;
    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRANSCRIPTION_FAILED",
        message: "The transcription request was cancelled.",
        retryable: true,
      },
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("keeps cancellation stable when the request stream rejects first", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller.signal.addEventListener("abort", () => {
          streamController.error(new Error("private raw stream failure"));
        }, { once: true });
      },
    });
    const responsePromise = POST(requestFromStream(body, {}, controller.signal));

    controller.abort();

    const response = await responsePromise;
    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRANSCRIPTION_FAILED",
        message: "The transcription request was cancelled.",
        retryable: true,
      },
    });
  });

  it("cancels the body of a request that was already aborted", async () => {
    const controller = new AbortController();
    const cancelled = vi.fn();
    controller.abort(new Error("private client reason"));

    const response = await POST(requestFromStream(
      new ReadableStream({ cancel: cancelled }),
      {},
      controller.signal,
    ));

    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "TRANSCRIPTION_FAILED" },
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("keeps the platform duration longer than the total application deadline", () => {
    expect(maxDuration).toBe(35);
    expect(maxDuration * 1_000).toBeGreaterThan(TRANSCRIPTION_SERVER_TIMEOUT_MS);
  });

  it("preserves a multipart boundary's case while parsing bounded bytes", async () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "fixture";
    process.env.MATTER_FIXTURE_ADMISSION_TRANSCRIPT = "边界保持原样。";
    const boundary = "MatterBoundaryAaZz";
    const bytes = validMultipartBytes(boundary);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 64));
        controller.enqueue(bytes.subarray(64));
        controller.close();
      },
    });

    const response = await POST(requestFromStream(body, {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      interactionId: "voice_01",
      transcript: "边界保持原样。",
    });
  });

  it("rejects empty, unsupported, and overlong recordings with stable codes", async () => {
    const empty = validForm();
    empty.set("audio", new Blob([], { type: "audio/webm" }), "voice.webm");
    const unsupported = validForm();
    unsupported.set("audio", new Blob(["voice"], { type: "audio/ogg" }), "voice.ogg");
    const overlong = validForm();
    overlong.set("durationMs", String(MAX_ACCEPTED_RECORDING_MS + 1));

    const [emptyResponse, unsupportedResponse, overlongResponse] = await Promise.all([
      POST(requestFrom(empty)),
      POST(requestFrom(unsupported)),
      POST(requestFrom(overlong)),
    ]);
    await expect(emptyResponse.json()).resolves.toMatchObject({ error: { code: "AUDIO_EMPTY" } });
    await expect(unsupportedResponse.json()).resolves.toMatchObject({ error: { code: "UNSUPPORTED_AUDIO" } });
    await expect(overlongResponse.json()).resolves.toMatchObject({ error: { code: "AUDIO_TOO_LONG" } });
  });

  it("maps unsupported deployment configuration without exposing a provider", async () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "unsupported";
    const response = await POST(requestFrom(validForm()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRANSCRIPTION_UNAVAILABLE",
        message: "Speech transcription is not configured.",
        retryable: true,
      },
    });
  });
});

function validForm(): FormData {
  const form = new FormData();
  form.append("protocolVersion", "0.2");
  form.append("interactionId", "voice_01");
  form.append("attempt", "1");
  form.append("purpose", "admission");
  form.append("locale", "zh-CN");
  form.append("durationMs", "800");
  form.append("audio", new Blob(["voice"], { type: "audio/webm" }), "voice.webm");
  return form;
}

function requestFrom(form: FormData): Request {
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}

function requestFromStream(
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=x",
      ...headers,
    },
    body,
    signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function validMultipartBytes(boundary: string): Uint8Array {
  const field = (name: string, value: string) => [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${name}"`,
    "",
    value,
  ].join("\r\n");
  return new TextEncoder().encode([
    field("protocolVersion", "0.2"),
    field("interactionId", "voice_01"),
    field("attempt", "1"),
    field("purpose", "admission"),
    field("locale", "zh-CN"),
    field("durationMs", "800"),
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice.webm"\r\nContent-Type: audio/webm\r\n\r\nvoice`,
    `--${boundary}--`,
    "",
  ].join("\r\n"));
}
