import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoiceAdapter } from "./browser-voice-adapter";

class FakeMediaRecorder {
  static latest: FakeMediaRecorder | null = null;
  static supported = new Set(["audio/mp4;codecs=mp4a.40.2"]);

  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.latest = this;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.ondataavailable?.({
      data: new Blob(["voice"], { type: this.mimeType }),
    } as BlobEvent);
    this.state = "inactive";
    this.onstop?.(new Event("stop"));
  }
}

describe("BrowserVoiceAdapter", () => {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn(async () => ({
    getTracks: () => [{ stop: stopTrack }],
  }));

  beforeEach(() => {
    FakeMediaRecorder.latest = null;
    FakeMediaRecorder.supported = new Set(["audio/mp4;codecs=mp4a.40.2"]);
    stopTrack.mockClear();
    getUserMedia.mockClear();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("records a supported browser format and releases the microphone", async () => {
    const adapter = new BrowserVoiceAdapter();
    await adapter.start(() => undefined);
    const recording = await adapter.stop();

    expect(recording.audio.type).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(await recording.audio.text()).toBe("voice");
    expect(recording.durationMs).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("does not request permission when the browser has no accepted format", async () => {
    FakeMediaRecorder.supported.clear();
    const adapter = new BrowserVoiceAdapter();

    await expect(adapter.start(() => undefined)).rejects.toThrow(
      "cannot create a supported audio recording",
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("cancels an active recording and releases the microphone", async () => {
    const adapter = new BrowserVoiceAdapter();
    await adapter.start(() => undefined);
    adapter.cancel();

    expect(FakeMediaRecorder.latest?.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("settles a pending stop when the adapter is cancelled", async () => {
    const adapter = new BrowserVoiceAdapter();
    await adapter.start(() => undefined);
    const recorder = FakeMediaRecorder.latest;
    if (!recorder) throw new Error("Recorder was not created.");
    recorder.stop = () => {
      recorder.state = "inactive";
    };

    const stopping = adapter.stop();
    adapter.cancel();

    await expect(stopping).rejects.toThrow("cancelled");
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
