import { PROTOCOL_VERSION } from "../tree/model";
import {
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_REQUEST_BYTES,
  MAX_INTERACTION_ID_LENGTH,
  MAX_LOCALE_LENGTH,
  TRANSCRIPTION_SERVER_TIMEOUT_MS,
  isAcceptedAudioType,
  type TranscriptionPurpose,
  type TranscriptionRequest,
} from "./transcription-contract";
import { isMatterLocale } from "../config/locales";
import { isTimeoutSignal, TranscriptionServerError } from "./transcription-errors";
import { transcribeRecording } from "./transcriber";

const FIELD_NAMES = new Set([
  "protocolVersion",
  "interactionId",
  "attempt",
  "purpose",
  "locale",
  "durationMs",
  "audio",
]);

export async function handleTranscriptionRequest(request: Request): Promise<Response> {
  const boundary = createRequestBoundary(request.signal);
  try {
    return await handleBoundedTranscriptionRequest(request, boundary.signal);
  } finally {
    boundary.dispose();
  }
}

async function handleBoundedTranscriptionRequest(
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  const declaredLength = parseOptionalContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > MAX_AUDIO_REQUEST_BYTES) {
    cancelBody(request.body);
    throw audioTooLarge();
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    cancelBody(request.body);
    throw invalidRequest("The recording request format is invalid.", 415);
  }
  // Content-Length is a fast-fail hint only. Count the bounded stream before
  // handing any bytes to the buffering multipart parser.
  const body = await readBoundedBody(request.body, signal);
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throwIfRequestInterrupted(signal);
    throw invalidRequest("The recording request could not be read.");
  }
  throwIfRequestInterrupted(signal);
  validateFieldShape(form);
  const interactionId = requiredString(form, "interactionId", MAX_INTERACTION_ID_LENGTH);
  const attempt = requiredPositiveSafeInteger(form, "attempt");
  const protocolVersion = requiredString(form, "protocolVersion", 8);
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw invalidRequest("The transcription protocol version is unsupported.");
  }
  const purpose = requiredString(form, "purpose", 16);
  if (purpose !== "admission" && purpose !== "direction") {
    throw invalidRequest("The transcription purpose is invalid.");
  }
  const locale = requiredString(form, "locale", MAX_LOCALE_LENGTH);
  if (!isMatterLocale(locale)) {
    throw invalidRequest("The transcription locale is invalid.");
  }
  const durationMs = requiredPositiveSafeInteger(form, "durationMs");
  if (durationMs > MAX_ACCEPTED_RECORDING_MS) {
    throw new TranscriptionServerError(
      "AUDIO_TOO_LONG",
      "The recording is too long.",
      false,
      413,
      interactionId,
      attempt,
    );
  }
  const audioValue = form.get("audio");
  if (!(audioValue instanceof File)) throw invalidRequest("The audio field is invalid.");
  if (audioValue.size === 0) {
    throw new TranscriptionServerError(
      "AUDIO_EMPTY",
      "No speech was recorded.",
      true,
      422,
      interactionId,
      attempt,
    );
  }
  if (audioValue.size > MAX_AUDIO_BYTES) {
    throw new TranscriptionServerError(
      "AUDIO_TOO_LARGE",
      "The recording is too large.",
      false,
      413,
      interactionId,
      attempt,
    );
  }
  if (!isAcceptedAudioType(audioValue.type)) {
    throw new TranscriptionServerError(
      "UNSUPPORTED_AUDIO",
      "The recording format is unsupported.",
      false,
      415,
      interactionId,
      attempt,
    );
  }
  const parsed: TranscriptionRequest = {
    protocolVersion: PROTOCOL_VERSION,
    interactionId,
    attempt,
    purpose: purpose as TranscriptionPurpose,
    locale,
    durationMs,
    audio: audioValue,
  };
  throwIfRequestInterrupted(signal);
  return Response.json(await transcribeRecording(parsed, signal));
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (body === null) {
    throwIfRequestInterrupted(signal);
    return new ArrayBuffer(0);
  }
  const reader = body.getReader();
  if (signal.aborted) {
    cancelReader(reader);
    throw requestInterruptionError(signal);
  }
  const interruption = rejectOnAbort(signal);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let completed = false;
  try {
    while (true) {
      const next = await Promise.race([reader.read(), interruption.promise]);
      if (next.done) {
        completed = true;
        break;
      }
      if (next.value.byteLength > MAX_AUDIO_REQUEST_BYTES - byteLength) {
        throw audioTooLarge();
      }
      chunks.push(next.value);
      byteLength += next.value.byteLength;
    }
  } catch (error) {
    cancelReader(reader);
    if (error instanceof TranscriptionServerError) throw error;
    if (signal.aborted) throw requestInterruptionError(signal);
    throw invalidRequest("The recording request could not be read.");
  } finally {
    interruption.dispose();
    if (completed) reader.releaseLock();
  }

  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

function createRequestBoundary(requestSignal: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  // This deadline starts at route entry and remains authoritative through both
  // request admission and provider transcription.
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException("Cancelled", "AbortError"));
  if (requestSignal.aborted) cancel();
  else requestSignal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    TRANSCRIPTION_SERVER_TIMEOUT_MS,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", cancel);
    },
  };
}

function rejectOnAbort(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let rejectPromise!: (error: TranscriptionServerError) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  const reject = () => rejectPromise(requestInterruptionError(signal));
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return {
    promise,
    dispose: () => signal.removeEventListener("abort", reject),
  };
}

function throwIfRequestInterrupted(signal: AbortSignal): void {
  if (signal.aborted) throw requestInterruptionError(signal);
}

function requestInterruptionError(signal: AbortSignal): TranscriptionServerError {
  return isTimeoutSignal(signal)
    ? new TranscriptionServerError(
        "TRANSCRIPTION_TIMEOUT",
        "Speech transcription timed out.",
        true,
        504,
      )
    : new TranscriptionServerError(
        "TRANSCRIPTION_FAILED",
        "The transcription request was cancelled.",
        true,
        499,
      );
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  let cancellation: Promise<void> | null = null;
  try {
    cancellation = reader.cancel();
  } catch {
    // Releasing the reader remains best-effort after a broken stream source.
  }
  // Stream cancellation is advisory and its underlying promise may never
  // settle. Releasing our reader cannot depend on hostile source cleanup.
  try {
    reader.releaseLock();
  } catch {
    // The route has already settled through its stable cancellation boundary.
  }
  if (cancellation !== null) void cancellation.catch(() => undefined);
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return;
  try {
    cancelReader(body.getReader());
  } catch {
    // A pre-locked invalid body is still rejected before parsing or delegation.
  }
}

function audioTooLarge(): TranscriptionServerError {
  return new TranscriptionServerError(
    "AUDIO_TOO_LARGE",
    "The recording is too large.",
    false,
    413,
  );
}

function validateFieldShape(form: FormData): void {
  for (const key of form.keys()) {
    if (!FIELD_NAMES.has(key)) throw invalidRequest("The recording request contains an unknown field.");
  }
  for (const key of FIELD_NAMES) {
    if (form.getAll(key).length !== 1) {
      throw invalidRequest("Every recording request field must occur exactly once.");
    }
  }
}

function requiredString(form: FormData, field: string, maxLength: number): string {
  const value = form.get(field);
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw invalidRequest(`The ${field} field is invalid.`);
  }
  return value;
}

function requiredPositiveSafeInteger(form: FormData, field: string): number {
  const value = requiredString(form, field, 20);
  if (!/^\d+$/.test(value)) throw invalidRequest(`The ${field} field is invalid.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw invalidRequest(`The ${field} field is invalid.`);
  }
  return parsed;
}

function parseOptionalContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw invalidRequest("The content length is invalid.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidRequest("The content length is invalid.");
  }
  return parsed;
}

function invalidRequest(message: string, status = 400): TranscriptionServerError {
  return new TranscriptionServerError("INVALID_REQUEST", message, false, status);
}
