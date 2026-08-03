import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../../app/api/arrow/transcribe/route";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function transcriptionRequest(form: FormData) {
  return new Request("http://localhost/api/arrow/transcribe", {
    method: "POST",
    body: form,
  });
}

describe("transcription route", () => {
  it("keeps fixture requests on the normal multipart route", async () => {
    process.env.ARROW_DEMO_FIXTURES = "true";
    const form = new FormData();
    form.append(
      "audio",
      new Blob([], { type: "audio/webm" }),
      "matter-voice.webm",
    );
    form.append("locale", "zh-CN");
    form.append("durationMs", "800");
    form.append("fixtureMode", "true");
    form.append("purpose", "create");

    const response = await POST(transcriptionRequest(form));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ language: "zh-CN", durationMs: 800 });
  });

  it("returns a stable error envelope for malformed requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/arrow/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRANSCRIPTION_FAILED",
        message: "The recording request format was invalid.",
        retryable: false,
      },
    });
  });

  it("rejects an invalid purpose before invoking an adapter", async () => {
    const form = new FormData();
    form.append(
      "audio",
      new Blob(["voice"], { type: "audio/webm" }),
      "voice.webm",
    );
    form.append("durationMs", "800");
    form.append("fixtureMode", "false");
    form.append("purpose", "delete");

    const response = await POST(transcriptionRequest(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "TRANSCRIPTION_FAILED", retryable: false },
    });
  });
});
