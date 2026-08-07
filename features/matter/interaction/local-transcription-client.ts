const WHISPER_SAMPLE_RATE = 16_000;
const LOCAL_TRANSCRIPTION_TIMEOUT_MS = 180_000;

type LocalTranscriptionFailure = "unavailable" | "failed" | "no-speech" | "timeout";

export class LocalTranscriptionError extends Error {
  constructor(readonly reason: LocalTranscriptionFailure) {
    super(reason);
    this.name = "LocalTranscriptionError";
  }
}

type Pending = Readonly<{
  resolve: (text: string) => void;
  reject: (error: LocalTranscriptionError) => void;
  dispose: () => void;
}>;

let worker: Worker | null = null;
const pending = new Map<string, Pending>();

export async function transcribeLocally(input: Readonly<{
  interactionId: string;
  attempt: number;
  locale: string;
  audio: Blob;
  signal: AbortSignal;
}>): Promise<string> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new LocalTranscriptionError("unavailable");
  }
  const audio = await decodeRecording(input.audio, input.signal);
  throwIfAborted(input.signal);
  const id = `${input.interactionId}:${input.attempt}`;
  const target = localTranscriptionWorker();
  return new Promise<string>((resolve, reject) => {
    const abort = () => settle(id, new LocalTranscriptionError("failed"));
    const timeout = window.setTimeout(
      () => settle(id, new LocalTranscriptionError("timeout")),
      LOCAL_TRANSCRIPTION_TIMEOUT_MS,
    );
    const dispose = () => {
      window.clearTimeout(timeout);
      input.signal.removeEventListener("abort", abort);
    };
    pending.set(id, { resolve, reject, dispose });
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) {
      abort();
      return;
    }
    target.postMessage({
      id,
      audio,
      language: whisperLanguage(input.locale),
    }, [audio.buffer]);
  });
}

function localTranscriptionWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL("./local-transcription.worker.ts", import.meta.url), {
    name: "matter-local-transcription",
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerResponse(event.data)) return;
    const request = pending.get(event.data.id);
    if (request === undefined) return;
    pending.delete(event.data.id);
    request.dispose();
    if (event.data.status === "failed") {
      request.reject(new LocalTranscriptionError("failed"));
      return;
    }
    const text = event.data.text.trim();
    if (text.length === 0) request.reject(new LocalTranscriptionError("no-speech"));
    else request.resolve(text);
  });
  worker.addEventListener("error", () => {
    for (const [id] of pending) settle(id, new LocalTranscriptionError("failed"));
    worker?.terminate();
    worker = null;
  });
  return worker;
}

async function decodeRecording(audio: Blob, signal: AbortSignal): Promise<Float32Array> {
  const AudioContextConstructor = window.AudioContext;
  if (AudioContextConstructor === undefined) {
    throw new LocalTranscriptionError("unavailable");
  }
  const context = new AudioContextConstructor();
  try {
    const encoded = await audio.arrayBuffer();
    throwIfAborted(signal);
    const decoded = await context.decodeAudioData(encoded);
    throwIfAborted(signal);
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index),
    );
    return resampleChannels(channels, decoded.sampleRate, WHISPER_SAMPLE_RATE);
  } catch (error) {
    if (error instanceof LocalTranscriptionError) throw error;
    throw new LocalTranscriptionError("failed");
  } finally {
    void context.close().catch(() => undefined);
  }
}

export function resampleChannels(
  channels: readonly Float32Array[],
  sourceRate: number,
  targetRate: number,
): Float32Array {
  const sourceLength = channels[0]?.length ?? 0;
  if (
    channels.length === 0 ||
    sourceLength === 0 ||
    !channels.every((channel) => channel.length === sourceLength) ||
    !Number.isFinite(sourceRate) ||
    !Number.isFinite(targetRate) ||
    sourceRate <= 0 ||
    targetRate <= 0
  ) {
    throw new LocalTranscriptionError("no-speech");
  }
  const targetLength = Math.max(1, Math.round(sourceLength * targetRate / sourceRate));
  const output = new Float32Array(targetLength);
  const step = sourceRate / targetRate;
  for (let index = 0; index < targetLength; index += 1) {
    const position = Math.min(sourceLength - 1, index * step);
    const left = Math.floor(position);
    const right = Math.min(sourceLength - 1, left + 1);
    const mix = position - left;
    let sample = 0;
    for (const channel of channels) {
      sample += channel[left]! + (channel[right]! - channel[left]!) * mix;
    }
    output[index] = sample / channels.length;
  }
  return output;
}

function settle(id: string, error: LocalTranscriptionError): void {
  const request = pending.get(id);
  if (request === undefined) return;
  pending.delete(id);
  request.dispose();
  request.reject(error);
}

function whisperLanguage(locale: string): string {
  switch (locale) {
    case "zh-CN":
    case "zh-TW":
      return "chinese";
    case "ja-JP":
      return "japanese";
    case "de-DE":
      return "german";
    default:
      return "english";
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

function isWorkerResponse(value: unknown): value is
  | Readonly<{ id: string; status: "failed" }>
  | Readonly<{ id: string; status: "complete"; text: string }> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && (
    candidate.status === "failed" ||
    (candidate.status === "complete" && typeof candidate.text === "string")
  );
}
