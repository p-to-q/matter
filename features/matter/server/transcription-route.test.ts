import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/transcribe/route";
import {
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_REQUEST_BYTES,
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
    const response = await POST(requestFrom(validForm()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocolVersion: "0.2",
      interactionId: "voice_01",
      attempt: 1,
      transcript: "原样留下这句话。",
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
    ["bad purpose", (form: FormData) => form.set("purpose", "delete")],
    ["bad protocol", (form: FormData) => form.set("protocolVersion", "0.1")],
  ] as const)("rejects %s fields before transcription", async (_name, mutate) => {
    const form = validForm();
    mutate(form);
    const response = await POST(requestFrom(form));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("rejects non-multipart and oversized declared requests before parsing", async () => {
    const malformed = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    const oversized = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(MAX_AUDIO_REQUEST_BYTES + 1),
      },
      body: "--x--",
    }));

    expect(malformed.status).toBe(415);
    expect(oversized.status).toBe(413);
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
