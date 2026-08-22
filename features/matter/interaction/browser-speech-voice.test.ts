import { afterEach, describe, expect, it, vi } from "vitest";
import { RECORDING_LIMIT_MS } from "./audio-policy";
import {
  BrowserSpeechVoicePort,
  prepareBrowserSpeechRecognition,
  resetBrowserSpeechPreparationForTests,
  SPEECH_START_TIMEOUT_MS,
} from "./browser-speech-voice";
import type { VoiceOperation } from "./browser-voice";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

const OPERATION: VoiceOperation = { interactionId: "speech_1", attempt: 1 };
const originalWindow = globalThis.window;

class FakeRecognition {
  static instance: FakeRecognition | null = null;
  static instances: FakeRecognition[] = [];
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

  constructor() {
    FakeRecognition.instance = this;
    FakeRecognition.instances.push(this);
  }
}

afterEach(() => {
  vi.useRealTimers();
  if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
  else globalThis.window = originalWindow;
  FakeRecognition.instance = null;
  FakeRecognition.instances = [];
  FakeRecognition.autoStart = true;
  resetBrowserSpeechPreparationForTests();
  vi.unstubAllGlobals();
});

describe("BrowserSpeechVoicePort", () => {
  it("drops an unstarted readiness lease across BFCache and rebuilds on later intent", async () => {
    const pageWindow = Object.assign(new EventTarget(), {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    });
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "visible";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);

    prepareBrowserSpeechRecognition();
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0]?.start).not.toHaveBeenCalled();
    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    pageWindow.dispatchEvent(new Event("pagehide"));
    pageWindow.dispatchEvent(new Event("pageshow"));
    pageDocument.visibilityState = "visible";
    pageDocument.dispatchEvent(new Event("visibilitychange"));

    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(FakeRecognition.instances[0]?.start).not.toHaveBeenCalled();
    expect(FakeRecognition.instances[1]?.start).toHaveBeenCalledTimes(1);
    port.cancel(OPERATION);
  });

  it("does not retain a readiness lease prepared while already hidden", async () => {
    const pageWindow = Object.assign(new EventTarget(), {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    });
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "hidden";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);

    prepareBrowserSpeechRecognition();
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0]?.start).not.toHaveBeenCalled();

    pageDocument.visibilityState = "visible";
    pageWindow.dispatchEvent(new Event("pageshow"));
    expect(FakeRecognition.instances).toHaveLength(1);
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(FakeRecognition.instances[1]?.start).toHaveBeenCalledTimes(1);
    port.cancel(OPERATION);
  });
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

  it("does not leave a first browser start waiting forever", async () => {
    vi.useFakeTimers();
    FakeRecognition.autoStart = false;
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    const started = port.start(OPERATION);
    const assertion = expect(started).rejects.toMatchObject({ code: "RECORDING_FAILED" });

    await vi.advanceTimersByTimeAsync(SPEECH_START_TIMEOUT_MS);

    await assertion;
  });

  it("settles a constructor failure instead of stranding the operation", async () => {
    class ThrowingRecognition {
      constructor() { throw new Error("native constructor failed"); }
    }
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: ThrowingRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();

    await expect(port.start(OPERATION)).rejects.toMatchObject({
      code: "RECORDING_FAILED",
    });
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

  it("restarts a browser-ended session until the person explicitly stops", async () => {
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION);
    const recognition = FakeRecognition.instance!;
    recognition.onend?.();
    expect(recognition.start).toHaveBeenCalledTimes(2);
    port.cancel(OPERATION);
  });

  it("keeps one cumulative duration limit across a browser restart", async () => {
    vi.useFakeTimers();
    const onDurationLimit = vi.fn();
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION, { onDurationLimit });
    const recognition = FakeRecognition.instance!;
    vi.advanceTimersByTime(RECORDING_LIMIT_MS - 1);
    recognition.onend?.();
    vi.advanceTimersByTime(1);
    expect(onDurationLimit).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(2);
    port.cancel(OPERATION);
  });

  it("does not revive a cancelled session from a queued browser end event", async () => {
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION);
    const recognition = FakeRecognition.instance!;
    const lateEnd = recognition.onend!;
    port.cancel(OPERATION);
    lateEnd();
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it("commits the latest interim hypothesis when stop produces no final event", async () => {
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION);
    const recognition = FakeRecognition.instance!;
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "还没有最终事件" } }],
    });
    await expect(port.stop(OPERATION)).resolves.toMatchObject({
      transcript: "还没有最终事件",
    });
  });

  it("rejects a native transcript beyond the material text bound", async () => {
    const onError = vi.fn();
    (globalThis as { window?: unknown }).window = {
      SpeechRecognition: FakeRecognition,
      setTimeout,
      clearTimeout,
    } as unknown as Window;
    const port = new BrowserSpeechVoicePort();
    await port.start(OPERATION, { onError });
    const recognition = FakeRecognition.instance!;
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: "念".repeat(MAX_NODE_TEXT_CODE_UNITS + 1) } }],
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "RECORDING_TOO_LARGE" }));
  });
});
