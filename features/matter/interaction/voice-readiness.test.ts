import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBrowserSpeechPreparationForTests } from "./browser-speech-voice";
import { createBrowserVoicePort } from "./browser-voice";
import { resetLocalTranscriptionForTests } from "./local-transcription-client";
import { prepareVoiceReadiness } from "./voice-readiness";

class FakeWorker {
  static instances: FakeWorker[] = [];
  private messageListener: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === "message") this.messageListener = listener;
  }

  emit(data: unknown): void {
    this.messageListener?.({ data } as MessageEvent<unknown>);
  }
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  lang = "";
  onstart: (() => void) | null = null;
  onresult = null;
  onerror = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }
}

afterEach(() => {
  resetLocalTranscriptionForTests();
  resetBrowserSpeechPreparationForTests();
  FakeWorker.instances = [];
  FakeRecognition.instances = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("voice readiness", () => {
  it("accepts browser speech without asking for microphone permission", async () => {
    vi.stubEnv("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED", "false");
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;

    await expect(prepareVoiceReadiness()).resolves.toEqual({
      status: "ready",
      transport: "speech",
    });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0]?.start).not.toHaveBeenCalled();

    const port = createBrowserVoicePort();
    await port.start({ interactionId: "prepared", attempt: 1 });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    port.cancel({ interactionId: "prepared", attempt: 1 });
  });

  it("treats a native constructor failure as unavailable before first input", async () => {
    vi.stubEnv("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED", "false");
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: class {
        constructor() { throw new Error("native constructor failed"); }
      },
    } as unknown as Window;

    await expect(prepareVoiceReadiness()).resolves.toEqual({
      status: "unavailable",
      transport: "speech",
    });
  });

  it("warms the recorded-audio worker without transcribing", async () => {
    vi.stubEnv("NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED", "true");
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("Worker", FakeWorker);

    const readiness = prepareVoiceReadiness();
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    expect(FakeWorker.instances[0]?.postMessage).not.toHaveBeenCalled();
    FakeWorker.instances[0]?.emit({ status: "ready" });

    await expect(readiness).resolves.toEqual({
      status: "ready",
      transport: "audio",
    });
  });
});
