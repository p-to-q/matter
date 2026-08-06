import { RECORDING_LIMIT_MS } from "./audio-policy";
import { VoiceError, type VoiceCallbacks, type VoiceOperation, type VoicePort, type VoiceRecording } from "./browser-voice";

type SpeechAlternative = { readonly transcript: string };
type SpeechResult = ArrayLike<SpeechAlternative> & { readonly isFinal: boolean };
type SpeechEvent = { readonly resultIndex: number; readonly results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

export function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const target = window as SpeechWindow;
  return target.SpeechRecognition ?? target.webkitSpeechRecognition;
}

export function isBrowserSpeechRecognitionAvailable(): boolean {
  return speechRecognitionConstructor() !== undefined;
}

export class BrowserSpeechVoicePort implements VoicePort {
  private recognition: SpeechRecognitionLike | null = null;
  private operation: VoiceOperation | null = null;
  private callbacks: VoiceCallbacks = {};
  private startedAt = 0;
  private timer: number | null = null;
  private stopping = false;
  private finalTranscript = "";
  private interimTranscript = "";
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<VoiceRecording> | null = null;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((error: VoiceError) => void) | null = null;
  private resolveStop: ((recording: VoiceRecording) => void) | null = null;
  private rejectStop: ((error: VoiceError) => void) | null = null;

  start(operation: VoiceOperation, callbacks: VoiceCallbacks = {}): Promise<void> {
    if (this.recognition !== null) return Promise.reject(new VoiceError("RECORDING_ACTIVE"));
    const Constructor = speechRecognitionConstructor();
    if (Constructor === undefined) return Promise.reject(new VoiceError("VOICE_UNSUPPORTED"));
    this.operation = Object.freeze({ ...operation });
    this.callbacks = callbacks;
    this.finalTranscript = "";
    this.interimTranscript = "";
    this.stopping = false;
    const startPromise = new Promise<void>((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    this.startPromise = startPromise;
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = callbacks.locale ?? "zh-CN";
    recognition.onstart = () => {
      this.startedAt = performance.now();
      this.timer = window.setTimeout(() => this.callbacks.onDurationLimit?.(this.operation!), RECORDING_LIMIT_MS);
      this.resolveStart?.();
      this.resolveStart = null;
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += text; else interimText += text;
      }
      if (finalText) this.finalTranscript += finalText;
      this.interimTranscript = interimText;
      const preview = `${this.finalTranscript} ${this.interimTranscript}`.trim();
      if (preview) this.callbacks.onTranscript?.(preview);
    };
    recognition.onerror = (event) => {
      if (this.stopping && event.error === "aborted") return;
      const code = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "MICROPHONE_DENIED"
        : event.error === "audio-capture" ? "MICROPHONE_UNAVAILABLE"
          : event.error === "no-speech" ? "RECORDING_EMPTY" : "RECORDING_FAILED";
      this.fail(new VoiceError(code));
    };
    recognition.onend = () => {
      if (!this.stopping) { this.fail(new VoiceError("RECORDING_FAILED")); return; }
      const operationValue = this.operation!;
      const transcript = this.finalTranscript.trim();
      if (!transcript) { this.fail(new VoiceError("RECORDING_EMPTY")); return; }
      const recording: VoiceRecording = Object.freeze({ operation: operationValue, audio: new Blob([], { type: "audio/webm" }), durationMs: Math.max(1, Math.round(performance.now() - this.startedAt)), transcript });
      this.resolveStop?.(recording);
      this.callbacks.onRecording?.(recording);
      this.cleanup();
    };
    try { recognition.start(); } catch { this.fail(new VoiceError("RECORDING_FAILED")); }
    return startPromise;
  }

  stop(operation: VoiceOperation): Promise<VoiceRecording> {
    if (this.operation === null || this.operation.interactionId !== operation.interactionId || this.operation.attempt !== operation.attempt || this.recognition === null) return Promise.reject(new VoiceError("RECORDING_NOT_ACTIVE"));
    if (this.stopPromise !== null) return this.stopPromise;
    this.stopping = true;
    const stopPromise = new Promise<VoiceRecording>((resolve, reject) => { this.resolveStop = resolve; this.rejectStop = reject; });
    this.stopPromise = stopPromise;
    if (this.timer !== null) window.clearTimeout(this.timer);
    try { this.recognition.stop(); } catch { this.fail(new VoiceError("RECORDING_FAILED")); }
    return stopPromise;
  }

  cancel(operation: VoiceOperation): void {
    if (this.operation?.interactionId !== operation.interactionId || this.operation.attempt !== operation.attempt) return;
    this.rejectStart?.(new VoiceError("RECORDING_CANCELLED"));
    this.rejectStop?.(new VoiceError("RECORDING_CANCELLED"));
    try { this.recognition?.abort(); } catch { /* cleanup remains authoritative */ }
    this.cleanup();
  }

  private fail(error: VoiceError): void {
    this.rejectStart?.(error);
    this.rejectStop?.(error);
    this.callbacks.onError?.(error);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.recognition !== null) {
      this.recognition.onstart = null;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
    this.recognition = null;
    this.operation = null;
    this.callbacks = {};
    this.resolveStart = null;
    this.rejectStart = null;
    this.resolveStop = null;
    this.rejectStop = null;
    this.startPromise = null;
    this.stopPromise = null;
  }
}

export function createBrowserSpeechVoicePort(): BrowserSpeechVoicePort {
  return new BrowserSpeechVoicePort();
}
