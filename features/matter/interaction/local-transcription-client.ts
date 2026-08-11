const WHISPER_SAMPLE_RATE = 16_000;
const LOCAL_TRANSCRIPTION_TIMEOUT_MS = 180_000;
export const LOCAL_TRANSCRIPTION_PREPARE_TIMEOUT_MS = 15_000;

type LocalTranscriptionFailure = "unavailable" | "failed" | "no-speech" | "timeout";

export class LocalTranscriptionError extends Error {
  constructor(readonly reason: LocalTranscriptionFailure) {
    super(reason);
    this.name = "LocalTranscriptionError";
  }
}

type Pending = {
  resolve: (text: string) => void;
  reject: (error: LocalTranscriptionError) => void;
  dispose: () => void;
  worker: Worker;
  started: boolean;
};

let worker: Worker | null = null;
const pending = new Map<string, Pending>();
const cancelled = new WeakMap<Worker, Set<string>>();
const readiness = new WeakMap<Worker, Readonly<{
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: LocalTranscriptionError) => void;
}>>();

/** Test-only cleanup keeps the lazy singleton from crossing isolated cases. */
export function resetLocalTranscriptionForTests(): void {
  if (worker !== null) retireWorker(worker, new LocalTranscriptionError("failed"));
}

/**
 * Starts only the isolated worker and its code graph. It never opens a
 * microphone, decodes audio, or downloads the Whisper model; model work stays
 * behind an actual recorded utterance.
 */
export async function prepareLocalTranscription(): Promise<void> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new LocalTranscriptionError("unavailable");
  }
  const target = localTranscriptionWorker();
  const prepared = readiness.get(target);
  if (prepared === undefined) throw new LocalTranscriptionError("failed");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prepared.promise,
      new Promise<never>((_resolve, reject) => {
        timeout = globalThis.setTimeout(
          () => reject(new LocalTranscriptionError("timeout")),
          LOCAL_TRANSCRIPTION_PREPARE_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (worker === target) {
      retireWorker(
        target,
        error instanceof LocalTranscriptionError
          ? error
          : new LocalTranscriptionError("failed"),
      );
    }
    throw error;
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}

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
    const abort = () => cancelRequest(id, target, new LocalTranscriptionError("failed"));
    const timeout = window.setTimeout(
      () => cancelRequest(id, target, new LocalTranscriptionError("timeout")),
      LOCAL_TRANSCRIPTION_TIMEOUT_MS,
    );
    const dispose = () => {
      window.clearTimeout(timeout);
      input.signal.removeEventListener("abort", abort);
    };
    pending.set(id, { resolve, reject, dispose, worker: target, started: false });
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) {
      abort();
      return;
    }
    try {
      target.postMessage({
        type: "transcribe",
        id,
        audio,
        language: whisperLanguage(input.locale),
      }, [audio.buffer]);
    } catch {
      retireWorker(target, new LocalTranscriptionError("failed"));
    }
  });
}

function localTranscriptionWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL("./local-transcription.worker.ts", import.meta.url), {
    name: "matter-local-transcription",
    type: "module",
  });
  const target = worker;
  let resolveReadiness!: () => void;
  let rejectReadiness!: (error: LocalTranscriptionError) => void;
  const readinessPromise = new Promise<void>((resolve, reject) => {
    resolveReadiness = resolve;
    rejectReadiness = reject;
  });
  // Transcription may create the worker without calling the optional readiness
  // preflight. Keep a later retirement from becoming an unhandled rejection.
  void readinessPromise.catch(() => undefined);
  readiness.set(target, {
    promise: readinessPromise,
    resolve: resolveReadiness,
    reject: rejectReadiness,
  });
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerResponse(event.data)) return;
    if (event.data.status === "ready") {
      readiness.get(target)?.resolve();
      return;
    }
    if (event.data.status === "cancelled") {
      cancelled.get(target)?.delete(event.data.id);
      return;
    }
    const request = pending.get(event.data.id);
    if (event.data.status === "started") {
      // A retired lease may still deliver a queued message. It never speaks for
      // a request the current worker owns, even when the two ids agree.
      if (request !== undefined && request.worker === target) {
        request.started = true;
      } else if (cancelled.get(target)?.has(event.data.id) === true) {
        retireWorker(target, new LocalTranscriptionError("failed"));
      }
      return;
    }
    cancelled.get(target)?.delete(event.data.id);
    if (request === undefined || request.worker !== target) return;
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
    retireWorker(target, new LocalTranscriptionError("failed"));
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

/**
 * A queued job can be skipped by the worker. A job that has begun Whisper
 * inference cannot be safely interrupted by the library, so its worker lease
 * is retired instead; the next request creates a fresh lazy worker.
 */
function cancelRequest(id: string, target: Worker, error: LocalTranscriptionError): void {
  const request = pending.get(id);
  if (request === undefined || request.worker !== target) return;
  let ids = cancelled.get(target);
  if (ids === undefined) {
    ids = new Set<string>();
    cancelled.set(target, ids);
  }
  ids.add(id);
  if (request.started) {
    retireWorker(target, error);
    return;
  }
  settle(id, error);
  try {
    target.postMessage({ type: "cancel", id });
  } catch {
    retireWorker(target, error);
  }
}

function retireWorker(target: Worker, error: LocalTranscriptionError): void {
  if (worker === target) worker = null;
  cancelled.delete(target);
  readiness.get(target)?.reject(error);
  readiness.delete(target);
  target.terminate();
  for (const [id, request] of [...pending]) {
    if (request.worker === target) settle(id, error);
  }
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
  | Readonly<{ status: "ready" }>
  | Readonly<{ id: string; status: "started" }>
  | Readonly<{ id: string; status: "cancelled" }>
  | Readonly<{ id: string; status: "failed" }>
  | Readonly<{ id: string; status: "complete"; text: string }> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "ready") return Object.keys(candidate).length === 1;
  return typeof candidate.id === "string" && (
    candidate.status === "started" ||
    candidate.status === "cancelled" ||
    candidate.status === "failed" ||
    (candidate.status === "complete" && typeof candidate.text === "string")
  );
}
