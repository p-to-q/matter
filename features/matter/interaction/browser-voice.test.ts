import { describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES, RECORDING_LIMIT_MS } from "./audio-policy";
import {
  BrowserVoicePort,
  resolveBrowserVoiceTransport,
  VoiceError,
  type BrowserVoiceDependencies,
  type VoiceOperation,
  type VoiceRecording,
} from "./browser-voice";

const OPERATION: VoiceOperation = Object.freeze({
  interactionId: "interaction-1",
  attempt: 1,
});

class FakeTrack extends EventTarget {
  stop = vi.fn();
}

class FakeRecorder {
  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
  });

  chunk(blob: Blob): void {
    this.ondataavailable?.({ data: blob } as BlobEvent);
  }

  stopped(): void {
    this.onstop?.(new Event("stop"));
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }
}

function harness(options: {
  permission?: Promise<MediaStream>;
  supported?: string[];
  meterThrows?: boolean;
  meter?: boolean;
} = {}) {
  const track = new FakeTrack();
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  const recorder = new FakeRecorder();
  let now = 100;
  let timer: (() => void) | null = null;
  let frameCallback: FrameRequestCallback | null = null;
  const clearTimer = vi.fn(() => {
    timer = null;
  });
  const close = vi.fn(async () => undefined);
  const getByteFrequencyData = vi.fn((samples: Uint8Array) => {
    samples.fill(20);
  });
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 4,
    getByteFrequencyData,
  };
  const context = {
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
    close,
  };
  const dependencies: BrowserVoiceDependencies = {
    getUserMedia: vi.fn(
      () => options.permission ?? Promise.resolve(stream),
    ),
    isTypeSupported: (type) =>
      (options.supported ?? ["audio/webm;codecs=opus"]).includes(type),
    createRecorder: vi.fn(() => recorder as unknown as MediaRecorder),
    createAudioContext: options.meterThrows
      ? () => {
          throw new Error("meter unavailable");
        }
      : options.meter
        ? () => context as unknown as AudioContext
        : undefined,
    now: () => now,
    setTimer: (callback) => {
      timer = callback;
      return 1;
    },
    clearTimer,
    requestFrame: vi.fn((callback) => {
      frameCallback = callback;
      return 2;
    }),
    cancelFrame: vi.fn(),
  };
  const port = new BrowserVoicePort(dependencies);
  return {
    port,
    recorder,
    stream,
    track,
    dependencies,
    close,
    getByteFrequencyData,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    fireTimer: () => timer?.(),
    fireFrame: () => {
      const callback = frameCallback;
      frameCallback = null;
      callback?.(0);
    },
    timer: () => timer,
  };
}

async function expectVoiceError(
  promise: Promise<unknown>,
  code: VoiceError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "VoiceError", code });
}

describe("BrowserVoicePort", () => {
  it("prefers native speech and requires explicit authority before audio upload", () => {
    expect(resolveBrowserVoiceTransport({
      browserSpeechEnabled: true,
      speechRecognitionAvailable: true,
      audioUploadEnabled: true,
    })).toBe("speech");
    expect(resolveBrowserVoiceTransport({
      browserSpeechEnabled: false,
      speechRecognitionAvailable: true,
      audioUploadEnabled: true,
    })).toBe("audio");
    expect(resolveBrowserVoiceTransport({
      browserSpeechEnabled: true,
      speechRecognitionAvailable: false,
      audioUploadEnabled: true,
    })).toBe("audio");
    expect(resolveBrowserVoiceTransport({
      browserSpeechEnabled: true,
      speechRecognitionAvailable: false,
      audioUploadEnabled: false,
    })).toBe("unavailable");
  });
  it("negotiates MIME, records the final chunk, and releases exactly once", async () => {
    const h = harness({ supported: ["audio/mp4;codecs=mp4a.40.2"] });
    h.recorder.mimeType = "audio/mp4;codecs=mp4a.40.2";
    await h.port.start(OPERATION);
    expect(h.dependencies.createRecorder).toHaveBeenCalledWith(h.stream, {
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      audioBitsPerSecond: 64_000,
    });

    h.advance(850);
    const stopped = h.port.stop(OPERATION);
    h.recorder.chunk(new Blob(["final"], { type: h.recorder.mimeType }));
    h.recorder.stopped();
    await expect(stopped).resolves.toMatchObject({
      operation: OPERATION,
      durationMs: 850,
    });
    expect((await stopped).audio.size).toBe(5);
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    expect(h.dependencies.clearTimer).toHaveBeenCalledTimes(1);
  });

  it("tries the next supported MIME when a hinted recorder cannot be constructed", async () => {
    const h = harness({
      supported: [
        "audio/webm;codecs=opus",
        "audio/mp4;codecs=mp4a.40.2",
      ],
    });
    h.recorder.mimeType = "audio/mp4;codecs=mp4a.40.2";
    vi.mocked(h.dependencies.createRecorder)
      .mockImplementationOnce(() => {
        throw new DOMException("codec unavailable", "NotSupportedError");
      })
      .mockImplementationOnce(() => h.recorder as unknown as MediaRecorder);

    await expect(h.port.start(OPERATION)).resolves.toBeUndefined();
    expect(h.dependencies.createRecorder).toHaveBeenNthCalledWith(1, h.stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 64_000,
    });
    expect(h.dependencies.createRecorder).toHaveBeenNthCalledWith(2, h.stream, {
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      audioBitsPerSecond: 64_000,
    });
    h.port.cancel(OPERATION);
  });

  it("uses the platform default recorder after every supported hint fails", async () => {
    const h = harness({ supported: ["audio/webm;codecs=opus", "audio/webm"] });
    h.recorder.mimeType = "audio/webm";
    vi.mocked(h.dependencies.createRecorder)
      .mockImplementationOnce(() => {
        throw new DOMException("hint rejected", "NotSupportedError");
      })
      .mockImplementationOnce(() => {
        throw new DOMException("hint rejected", "NotSupportedError");
      })
      .mockImplementationOnce(() => h.recorder as unknown as MediaRecorder);

    await expect(h.port.start(OPERATION)).resolves.toBeUndefined();
    expect(h.dependencies.createRecorder).toHaveBeenNthCalledWith(3, h.stream, undefined);
    h.port.cancel(OPERATION);
  });

  it("returns the same stop operation and waits for stop after dataavailable", async () => {
    const h = harness();
    await h.port.start(OPERATION);
    const first = h.port.stop(OPERATION);
    const second = h.port.stop(OPERATION);
    expect(second).toBe(first);
    h.recorder.chunk(new Blob(["voice"], { type: h.recorder.mimeType }));
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    h.recorder.stopped();
    await expect(first).resolves.toBeDefined();
  });

  it("maps permission failures to stable typed errors", async () => {
    for (const [name, code] of [
      ["NotAllowedError", "MICROPHONE_DENIED"],
      ["NotFoundError", "MICROPHONE_NOT_FOUND"],
      ["NotReadableError", "MICROPHONE_UNAVAILABLE"],
    ] as const) {
      const error = Object.assign(new Error(name), { name });
      const h = harness({ permission: Promise.reject(error) });
      await expectVoiceError(h.port.start(OPERATION), code);
    }
  });

  it("cleans a late permission grant after cancellation without creating a recorder", async () => {
    let grant!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      grant = resolve;
    });
    const h = harness({ permission });
    const starting = h.port.start(OPERATION);
    h.port.cancel(OPERATION);
    await expectVoiceError(starting, "RECORDING_CANCELLED");
    grant(h.stream);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    expect(h.dependencies.createRecorder).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized recordings and cleans resources", async () => {
    const empty = harness();
    await empty.port.start(OPERATION);
    const emptyStop = empty.port.stop(OPERATION);
    empty.recorder.stopped();
    await expectVoiceError(emptyStop, "RECORDING_EMPTY");
    expect(empty.track.stop).toHaveBeenCalledTimes(1);

    const large = harness();
    await large.port.start(OPERATION);
    large.recorder.chunk(new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]));
    expect(large.recorder.stop).toHaveBeenCalledTimes(1);
    expect(large.track.stop).toHaveBeenCalledTimes(1);
    await expectVoiceError(
      large.port.stop(OPERATION),
      "RECORDING_NOT_ACTIVE",
    );
  });

  it("reports the keyed duration limit without crossing the runtime stop boundary", async () => {
    const h = harness();
    const onDurationLimit = vi.fn();
    let completed: VoiceRecording | undefined;
    await h.port.start(OPERATION, {
      onDurationLimit,
      onRecording: (recording) => {
        completed = recording;
      },
    });
    expect(h.timer()).not.toBeNull();
    h.advance(RECORDING_LIMIT_MS);
    h.fireTimer();
    h.fireTimer();
    expect(onDurationLimit).toHaveBeenCalledTimes(1);
    expect(onDurationLimit).toHaveBeenCalledWith(OPERATION);
    expect(h.recorder.stop).not.toHaveBeenCalled();
    const stopping = h.port.stop(OPERATION);
    expect(h.recorder.stop).toHaveBeenCalledTimes(1);
    h.recorder.chunk(new Blob(["bounded"]));
    h.recorder.stopped();
    await stopping;
    expect(completed).toMatchObject({ durationMs: RECORDING_LIMIT_MS });
  });

  it("cancels the limit timer and never reports a stale duration event", async () => {
    const h = harness();
    const onDurationLimit = vi.fn();
    await h.port.start(OPERATION, { onDurationLimit });
    const staleTimer = h.timer();
    h.port.cancel(OPERATION);
    staleTimer?.();
    expect(onDurationLimit).not.toHaveBeenCalled();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
  });

  it("settles cancellation during stop once and ignores late recorder events", async () => {
    const h = harness();
    await h.port.start(OPERATION);
    const stopping = h.port.stop(OPERATION);
    const lateData = h.recorder.ondataavailable;
    const lateStop = h.recorder.onstop;
    h.port.cancel(OPERATION);
    await expectVoiceError(stopping, "RECORDING_CANCELLED");
    lateData?.({ data: new Blob(["late"]) } as BlobEvent);
    lateStop?.(new Event("stop"));
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    h.port.cancel(OPERATION);
    expect(h.track.stop).toHaveBeenCalledTimes(1);
  });

  it("handles track end, recorder error, and optional meter failure", async () => {
    const ended = harness();
    let endedError: VoiceError | undefined;
    await ended.port.start(OPERATION, {
      onError: (error) => {
        endedError = error;
      },
    });
    ended.track.dispatchEvent(new Event("ended"));
    expect(endedError?.code).toBe("MICROPHONE_UNAVAILABLE");
    expect(ended.track.stop).toHaveBeenCalledTimes(1);

    const failed = harness();
    let recorderError: VoiceError | undefined;
    await failed.port.start(OPERATION, {
      onError: (error) => {
        recorderError = error;
      },
    });
    failed.recorder.fail();
    expect(recorderError?.code).toBe("RECORDING_FAILED");

    const meter = harness({ meterThrows: true });
    await expect(
      meter.port.start(OPERATION, { onSample: vi.fn() }),
    ).resolves.toBeUndefined();
    const stopping = meter.port.stop(OPERATION);
    meter.recorder.chunk(new Blob(["voice"]));
    meter.recorder.stopped();
    await expect(stopping).resolves.toBeDefined();
  });

  it("uses negotiated MIME when a recorder reports no MIME", async () => {
    const h = harness();
    h.recorder.mimeType = "";
    await h.port.start(OPERATION);
    const stopping = h.port.stop(OPERATION);
    h.recorder.chunk(new Blob(["voice"]));
    h.recorder.stopped();
    await expect(stopping).resolves.toMatchObject({
      audio: expect.objectContaining({ type: "audio/webm;codecs=opus" }),
    });
  });

  it.each(["recording", "error"] as const)(
    "contains throwing %s callbacks and still releases resources",
    async (kind) => {
      const h = harness();
      if (kind === "recording") {
        await h.port.start(OPERATION, {
          onRecording: () => {
            throw new Error("consumer failed");
          },
        });
        const stopping = h.port.stop(OPERATION);
        h.recorder.chunk(new Blob(["voice"]));
        h.recorder.stopped();
        await expect(stopping).resolves.toBeDefined();
      } else {
        await h.port.start(OPERATION, {
          onError: () => {
            throw new Error("consumer failed");
          },
        });
        h.recorder.fail();
      }
      expect(h.track.stop).toHaveBeenCalledTimes(1);
      await expect(h.port.start({ ...OPERATION, attempt: 2 })).resolves.toBeUndefined();
      h.port.cancel({ ...OPERATION, attempt: 2 });
    },
  );

  it("contains permission callback exceptions after releasing operation ownership", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const h = harness({ permission: Promise.reject(denied) });
    await expectVoiceError(
      h.port.start(OPERATION, {
        onError: () => {
          throw new Error("consumer failed");
        },
      }),
      "MICROPHONE_DENIED",
    );
    // A second permission error proves the first session released ownership;
    // otherwise start would reject synchronously as RECORDING_ACTIVE.
    await expectVoiceError(
      h.port.start({ ...OPERATION, attempt: 2 }),
      "MICROPHONE_DENIED",
    );
  });

  it.each(["success", "cancel", "error"] as const)(
    "closes and cancels a working meter on %s",
    async (outcome) => {
      const h = harness({ meter: true });
      await h.port.start(OPERATION, { onSample: vi.fn() });
      if (outcome === "success") {
        const stopping = h.port.stop(OPERATION);
        h.recorder.chunk(new Blob(["voice"]));
        h.recorder.stopped();
        await stopping;
      } else if (outcome === "cancel") {
        h.port.cancel(OPERATION);
      } else {
        h.recorder.fail();
      }
      expect(h.close).toHaveBeenCalledTimes(1);
      expect(h.dependencies.cancelFrame).toHaveBeenCalledTimes(1);
    },
  );

  it("disables only the meter when a later sample callback fails", async () => {
    const h = harness({ meter: true });
    let samples = 0;
    await h.port.start(OPERATION, {
      onSample: () => {
        samples += 1;
        if (samples === 2) throw new Error("visual meter failed");
      },
    });
    h.fireFrame();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.track.stop).not.toHaveBeenCalled();

    const stopping = h.port.stop(OPERATION);
    h.recorder.chunk(new Blob(["voice"]));
    h.recorder.stopped();
    await expect(stopping).resolves.toBeDefined();
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported browsers, invalid operations, and mismatched owners", async () => {
    const unsupported = harness({ supported: [] });
    unsupported.recorder.mimeType = "audio/ogg";
    await expectVoiceError(
      unsupported.port.start(OPERATION),
      "VOICE_UNSUPPORTED",
    );

    const invalid = harness();
    await expectVoiceError(
      invalid.port.start({ interactionId: "", attempt: 0 }),
      "RECORDING_FAILED",
    );

    const active = harness();
    await active.port.start(OPERATION);
    await expectVoiceError(active.port.start(OPERATION), "RECORDING_ACTIVE");
    await expectVoiceError(
      active.port.stop({ ...OPERATION, attempt: 2 }),
      "RECORDING_NOT_ACTIVE",
    );
    active.port.cancel({ ...OPERATION, attempt: 2 });
    expect(active.track.stop).not.toHaveBeenCalled();
    active.port.cancel(OPERATION);
  });
});
