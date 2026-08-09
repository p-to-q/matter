import {
  isAcceptedAudioMimeType,
  MAX_AUDIO_BYTES,
  RECORDING_MIME_CANDIDATES,
  RECORDING_LIMIT_MS,
} from "./audio-policy";
import { createBrowserSpeechVoicePort, isBrowserSpeechRecognitionAvailable } from "./browser-speech-voice";
import {
  VoiceError,
  type VoiceCallbacks,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
  type VoiceSample,
} from "./voice-port";

// Re-exported so the vocabulary keeps one import site for its callers, while
// the transports below depend on `voice-port` directly.
export {
  VoiceError,
  type VoiceCallbacks,
  type VoiceErrorCode,
  type VoiceOperation,
  type VoicePort,
  type VoiceRecording,
  type VoiceSample,
} from "./voice-port";

type RecorderLike = Pick<
  MediaRecorder,
  | "state"
  | "mimeType"
  | "start"
  | "stop"
  | "ondataavailable"
  | "onerror"
  | "onstop"
>;

type AudioContextLike = Pick<
  AudioContext,
  "createMediaStreamSource" | "createAnalyser" | "close"
>;

export type BrowserVoiceDependencies = Readonly<{
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isTypeSupported: (mimeType: string) => boolean;
  createRecorder: (
    stream: MediaStream,
    options?: MediaRecorderOptions,
  ) => RecorderLike;
  createAudioContext?: () => AudioContextLike;
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (timer: unknown) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frame: number) => void;
}>;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: VoiceError) => void;
}>;

type Session = {
  operation: VoiceOperation;
  phase: "permission" | "recording" | "stopping" | "settled";
  stream: MediaStream | null;
  recorder: RecorderLike | null;
  context: AudioContextLike | null;
  frame: number | null;
  timer: unknown | null;
  durationLimitReported: boolean;
  chunks: Blob[];
  bytes: number;
  mimeType: string;
  startedAt: number;
  start: Deferred<void>;
  stop: Deferred<VoiceRecording> | null;
  callbacks: VoiceCallbacks;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: VoiceError) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function sameOperation(left: VoiceOperation, right: VoiceOperation): boolean {
  return (
    left.interactionId === right.interactionId && left.attempt === right.attempt
  );
}

function validOperation(operation: VoiceOperation): boolean {
  return (
    operation.interactionId.length > 0 &&
    Number.isSafeInteger(operation.attempt) &&
    operation.attempt > 0
  );
}

function permissionError(error: unknown): VoiceError {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new VoiceError("MICROPHONE_DENIED");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new VoiceError("MICROPHONE_NOT_FOUND");
  }
  return new VoiceError("MICROPHONE_UNAVAILABLE");
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Owns ephemeral browser capture resources only. Operation identity makes late
 * permission and recorder events harmless without entering material history.
 */
export class BrowserVoicePort implements VoicePort {
  private readonly dependencies: BrowserVoiceDependencies;
  private session: Session | null = null;

  constructor(dependencies: BrowserVoiceDependencies) {
    this.dependencies = dependencies;
  }

  start(
    operation: VoiceOperation,
    callbacks: VoiceCallbacks = {},
  ): Promise<void> {
    if (!validOperation(operation)) {
      return Promise.reject(new VoiceError("RECORDING_FAILED"));
    }
    if (this.session !== null) {
      return Promise.reject(new VoiceError("RECORDING_ACTIVE"));
    }

    const session: Session = {
      operation: Object.freeze({ ...operation }),
      phase: "permission",
      stream: null,
      recorder: null,
      context: null,
      frame: null,
      timer: null,
      durationLimitReported: false,
      chunks: [],
      bytes: 0,
      mimeType: "",
      startedAt: 0,
      start: deferred<void>(),
      stop: null,
      callbacks,
    };
    this.session = session;

    void this.dependencies
      .getUserMedia({ audio: true, video: false })
      .then((stream) => this.permissionGranted(session, stream))
      .catch((error: unknown) => {
        if (this.session !== session || session.phase !== "permission") return;
        const failure = permissionError(error);
        session.start.reject(failure);
        this.settle(session, failure);
        notify(() => session.callbacks.onError?.(failure));
      });

    return session.start.promise;
  }

  stop(operation: VoiceOperation): Promise<VoiceRecording> {
    const session = this.session;
    if (
      session === null ||
      !sameOperation(session.operation, operation) ||
      session.phase === "permission" ||
      session.phase === "settled"
    ) {
      return Promise.reject(new VoiceError("RECORDING_NOT_ACTIVE"));
    }
    return this.beginStop(session);
  }

  cancel(operation: VoiceOperation): void {
    const session = this.session;
    if (session === null || !sameOperation(session.operation, operation)) return;
    const failure = new VoiceError("RECORDING_CANCELLED");
    session.start.reject(failure);
    session.stop?.reject(failure);

    // Detach before stop: cancellation must not be revived by final recorder events.
    const recorder = session.recorder;
    if (recorder !== null && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Cleanup below is authoritative even when a browser rejects stop().
      }
    }
    this.settle(session);
  }

  private permissionGranted(
    session: Session,
    stream: MediaStream,
  ): void {
    if (this.session !== session || session.phase !== "permission") {
      stopTracks(stream);
      return;
    }

    session.stream = stream;
    try {
      const recorder = this.createStartedRecorder(session, stream);
      session.recorder = recorder;
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => {
          if (this.session === session && session.phase === "recording") {
            this.fail(session, new VoiceError("MICROPHONE_UNAVAILABLE"));
          }
        }, { once: true });
      }
      session.startedAt = this.dependencies.now();
      session.phase = "recording";
      session.timer = this.dependencies.setTimer(
        () => {
          session.timer = null;
          if (
            this.session !== session ||
            session.phase !== "recording" ||
            session.durationLimitReported
          ) return;
          session.durationLimitReported = true;
          notify(() => session.callbacks.onDurationLimit?.(session.operation));
        },
        RECORDING_LIMIT_MS,
      );
      this.startMeter(session, session.callbacks.onSample);
      session.start.resolve();
    } catch (error) {
      const failure =
        error instanceof VoiceError
          ? error
          : new VoiceError("RECORDING_FAILED");
      session.start.reject(failure);
      this.settle(session, failure);
      notify(() => session.callbacks.onError?.(failure));
    }
  }

  private createStartedRecorder(
    session: Session,
    stream: MediaStream,
  ): RecorderLike {
    const hintedOptions: MediaRecorderOptions[] = [];
    for (const mimeType of RECORDING_MIME_CANDIDATES) {
      try {
        if (this.dependencies.isTypeSupported(mimeType)) {
          hintedOptions.push({ mimeType, audioBitsPerSecond: 64_000 });
        }
      } catch {
        // A broken capability probe must not hide later candidates or the UA default.
      }
    }

    for (const options of [...hintedOptions, undefined]) {
      let recorder: RecorderLike | null = null;
      try {
        recorder = this.dependencies.createRecorder(stream, options);
        const actualMimeType = recorder.mimeType || options?.mimeType || "";
        if (!isAcceptedAudioMimeType(actualMimeType)) {
          this.discardRecorderCandidate(recorder);
          continue;
        }
        recorder.ondataavailable = (event) =>
          this.receiveChunk(session, event.data);
        recorder.onerror = () =>
          this.fail(session, new VoiceError("RECORDING_FAILED"));
        recorder.onstop = () => this.finishStop(session);
        recorder.start(250);
        session.mimeType = recorder.mimeType || actualMimeType;
        return recorder;
      } catch {
        if (recorder !== null) this.discardRecorderCandidate(recorder);
      }
    }

    throw new VoiceError("VOICE_UNSUPPORTED");
  }

  private discardRecorderCandidate(recorder: RecorderLike): void {
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
    if (recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      // Candidate cleanup is best effort; the shared stream remains session-owned.
    }
  }

  private beginStop(session: Session): Promise<VoiceRecording> {
    if (session.stop !== null) return session.stop.promise;
    session.stop = deferred<VoiceRecording>();
    if (this.session !== session || session.phase !== "recording") {
      session.stop.reject(new VoiceError("RECORDING_NOT_ACTIVE"));
      return session.stop.promise;
    }
    session.phase = "stopping";
    this.clearTimer(session);
    try {
      session.recorder?.stop();
    } catch {
      this.fail(session, new VoiceError("RECORDING_FAILED"));
    }
    return session.stop.promise;
  }

  private receiveChunk(session: Session, chunk: Blob): void {
    if (
      this.session !== session ||
      (session.phase !== "recording" && session.phase !== "stopping") ||
      chunk.size === 0
    ) {
      return;
    }
    session.bytes += chunk.size;
    if (session.bytes > MAX_AUDIO_BYTES) {
      this.fail(session, new VoiceError("RECORDING_TOO_LARGE"));
      return;
    }
    session.chunks.push(chunk);
  }

  private finishStop(session: Session): void {
    if (this.session !== session || session.phase !== "stopping") return;
    const audio = new Blob(session.chunks, { type: session.mimeType });
    if (audio.size === 0) {
      this.fail(session, new VoiceError("RECORDING_EMPTY"));
      return;
    }
    if (!isAcceptedAudioMimeType(audio.type)) {
      this.fail(session, new VoiceError("VOICE_UNSUPPORTED"));
      return;
    }
    const recording: VoiceRecording = Object.freeze({
      operation: session.operation,
      audio,
      durationMs: Math.max(1, Math.round(this.dependencies.now() - session.startedAt)),
    });
    session.stop?.resolve(recording);
    this.settle(session);
    notify(() => session.callbacks.onRecording?.(recording));
  }

  private fail(session: Session, failure: VoiceError): void {
    if (this.session !== session || session.phase === "settled") return;
    session.start.reject(failure);
    session.stop?.reject(failure);
    const recorder = session.recorder;
    if (recorder !== null && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Failure settlement still releases all resources below.
      }
    }
    this.settle(session, failure);
    notify(() => session.callbacks.onError?.(failure));
  }

  private startMeter(
    session: Session,
    onSample?: (sample: VoiceSample) => void,
  ): void {
    if (onSample === undefined || this.dependencies.createAudioContext === undefined) {
      return;
    }
    try {
      const context = this.dependencies.createAudioContext();
      session.context = context;
      const source = context.createMediaStreamSource(session.stream!);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        session.frame = null;
        if (this.session !== session || session.phase !== "recording") return;
        try {
          analyser.getByteFrequencyData(samples);
          const squareSum = samples.reduce(
            (sum, value) => sum + value * value,
            0,
          );
          onSample({ level: Math.min(1, Math.sqrt(squareSum / samples.length) / 72) });
          session.frame = this.dependencies.requestFrame(update);
        } catch {
          this.closeMeter(session);
        }
      };
      update();
    } catch {
      void session.context?.close().catch(() => undefined);
      session.context = null;
    }
  }

  private clearTimer(session: Session): void {
    if (session.timer !== null) this.dependencies.clearTimer(session.timer);
    session.timer = null;
  }

  private closeMeter(session: Session): void {
    if (session.frame !== null) this.dependencies.cancelFrame(session.frame);
    session.frame = null;
    const context = session.context;
    session.context = null;
    void context?.close().catch(() => undefined);
  }

  private settle(session: Session, failure?: VoiceError): void {
    if (session.phase === "settled") return;
    session.phase = "settled";
    this.clearTimer(session);
    this.closeMeter(session);
    if (session.stream !== null) stopTracks(session.stream);
    session.stream = null;
    const recorder = session.recorder;
    if (recorder !== null) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
    }
    session.recorder = null;
    session.chunks = [];
    if (failure !== undefined) session.stop?.reject(failure);
    if (this.session === session) this.session = null;
  }
}

function notify(callback: () => void): void {
  try {
    callback();
  } catch {
    // Consumer feedback is observational and must never retain capture resources.
  }
}

export function createBrowserVoicePort(): VoicePort {
  const transport = resolveBrowserVoiceTransport({
    browserSpeechEnabled: browserSpeechIsEnabled(),
    speechRecognitionAvailable: isBrowserSpeechRecognitionAvailable(),
    audioUploadEnabled: recordedAudioFallbackIsEnabled(),
  });
  // Native recognition keeps raw audio out of the Matter server when the UA supports it.
  if (transport === "speech") return createBrowserSpeechVoicePort();
  // Audio upload is an explicit deployment capability. Missing configuration
  // fails before capture instead of collecting audio for a guaranteed 503.
  if (transport === "unavailable") throw new VoiceError("VOICE_UNSUPPORTED");
  if (
    typeof navigator === "undefined" ||
    navigator.mediaDevices?.getUserMedia === undefined ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new VoiceError("VOICE_UNSUPPORTED");
  }
  return new BrowserVoicePort({
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    createAudioContext:
      typeof AudioContext === "undefined"
        ? undefined
        : () => new AudioContext(),
    now: () => performance.now(),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (timer) => window.clearTimeout(timer as number),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (frame) => cancelAnimationFrame(frame),
  });
}

export function isBrowserVoiceTransportAvailable(): boolean {
  return resolveBrowserVoiceTransport({
    browserSpeechEnabled: browserSpeechIsEnabled(),
    speechRecognitionAvailable: isBrowserSpeechRecognitionAvailable(),
    audioUploadEnabled: recordedAudioFallbackIsEnabled(),
  }) !== "unavailable";
}

export function resolveBrowserVoiceTransport(input: Readonly<{
  browserSpeechEnabled: boolean;
  speechRecognitionAvailable: boolean;
  audioUploadEnabled: boolean;
}>): "speech" | "audio" | "unavailable" {
  if (input.browserSpeechEnabled && input.speechRecognitionAvailable) return "speech";
  return input.audioUploadEnabled ? "audio" : "unavailable";
}

function browserSpeechIsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED === "true";
}

function browserAudioUploadIsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED === "true";
}

function recordedAudioFallbackIsEnabled(): boolean {
  return browserAudioUploadIsEnabled() ||
    process.env.NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED === "true";
}
