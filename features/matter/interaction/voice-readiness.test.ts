import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLocalTranscriptionForTests } from "./local-transcription-client";
import { prepareVoiceReadiness } from "./voice-readiness";

class FakeWorker {
  addEventListener(): void {}
  postMessage = vi.fn();
  terminate = vi.fn();
}

afterEach(() => {
  resetLocalTranscriptionForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("voice readiness", () => {
  it("accepts browser speech without asking for microphone permission", async () => {
    vi.stubEnv("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED", "false");
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: class {},
    } as unknown as Window;

    await expect(prepareVoiceReadiness()).resolves.toEqual({
      status: "ready",
      transport: "speech",
    });
  });

  it("warms the recorded-audio worker without transcribing", async () => {
    vi.stubEnv("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED", "true");
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);

    await expect(prepareVoiceReadiness()).resolves.toEqual({
      status: "ready",
      transport: "audio",
    });
  });
});
