import { afterEach, describe, expect, it, vi } from "vitest";
import { RECORDING_LIMIT_MS } from "./audio-policy";
import { BrowserSpeechVoicePort } from "./browser-speech-voice";
import type { VoiceOperation } from "./browser-voice";

const OPERATION: VoiceOperation = { interactionId: "speech_1", attempt: 1 };
const originalWindow = globalThis.window;

class FakeRecognition {
  static instance: FakeRecognition | null = null;
  static autoStart = true;
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => { if (FakeRecognition.autoStart) this.onstart?.(); });
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() { FakeRecognition.instance = this; }
}

afterEach(() => {
  vi.useRealTimers();
  if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
  else globalThis.window = originalWindow;
  FakeRecognition.instance = null;
  FakeRecognition.autoStart = true;
});

describe("BrowserSpeechVoicePort", () => {
  it("keeps interim text transient and returns only final text", async () => {
    vi.useFakeTimers();
    const onTranscript = vi.fn();
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION, { locale: "zh-CN", onTranscript });
    const recognition = FakeRecognition.instance!;
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "也许我们" } }],
    });
    expect(onTranscript).toHaveBeenLastCalledWith("也许我们");
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, length: 1, 0: { transcript: "也许我们怀念的过去" } }],
    });
    const recordingPromise = port.stop(OPERATION);
    const recording = await recordingPromise;
    expect(recording.transcript).toBe("也许我们怀念的过去");
    expect(recording.audio.size).toBe(0);
    expect(recognition.lang).toBe("zh-CN");
  });

  it("maps browser denial to a stable microphone error", async () => {
    FakeRecognition.autoStart = false;
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    const started = port.start(OPERATION);
    FakeRecognition.instance?.onerror?.({ error: "not-allowed" });
    await expect(started).rejects.toMatchObject({ code: "MICROPHONE_DENIED" });
  });

  it("reports the duration limit through the same transient callback", async () => {
    vi.useFakeTimers();
    const onDurationLimit = vi.fn();
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION, { onDurationLimit });
    vi.advanceTimersByTime(RECORDING_LIMIT_MS);
    expect(onDurationLimit).toHaveBeenCalledWith(OPERATION);
  });
});
