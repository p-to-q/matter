import { PROTOCOL_VERSION } from "../tree/model";
import {
  audioUploadName,
  isAcceptedAudioType,
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPTION_RESPONSE_BYTES,
  TRANSCRIPTION_CLIENT_TIMEOUT_MS,
  type TranscriptionErrorCode,
  type TranscriptionErrorEnvelope,
  type TranscriptionPurpose,
  type TranscriptionSuccess,
} from "../protocol/transcription-contract";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { normalizeTextSwapDirection } from "../protocol/text-swap-policy";
import { clientMatterBasePath } from "../config/base-path";
import { readBoundedJsonResponse } from "./bounded-json-response";

export class TranscriptionClientError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function requestTranscription(input: {
  interactionId: string;
  attempt: number;
  purpose: TranscriptionPurpose;
  locale: string;
  durationMs: number;
  audio: Blob;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<TranscriptionSuccess> {
  validateClientRecording(input.audio, input.durationMs);
  if (localTranscriptionIsEnabled()) return requestLocalTranscription(input);
  const form = new FormData();
  form.append("protocolVersion", PROTOCOL_VERSION);
  form.append("interactionId", input.interactionId);
  form.append("attempt", String(input.attempt));
  form.append("purpose", input.purpose);
  form.append("locale", input.locale);
  form.append("durationMs", String(input.durationMs));
  form.append("audio", input.audio, audioUploadName(input.audio.type));
  const deadline = withDeadline(
    input.signal,
    input.timeoutMs ?? TRANSCRIPTION_CLIENT_TIMEOUT_MS,
  );
  let response: Response | undefined;
  try {
    response = await Promise.race([
      fetch(`${basePath()}/api/transcribe`, {
        method: "POST",
        body: form,
        signal: deadline.signal,
      }),
      deadline.settlement,
    ]);
    const payload = await Promise.race([
      readBoundedJsonResponse(
        response,
        MAX_TRANSCRIPTION_RESPONSE_BYTES,
        deadline.signal,
      ),
      deadline.settlement,
    ]);
    if (!response.ok) throw parseErrorEnvelope(payload);
    if (!isSuccess(payload, input.interactionId, input.attempt, input.purpose)) {
      throw invalidProviderResponse();
    }
    return payload;
  } catch (error) {
    if (deadline.didTimeout()) {
      throw new TranscriptionClientError(
        "TRANSCRIPTION_TIMEOUT",
        "Speech transcription timed out.",
        true,
      );
    }
    if (input.signal.aborted) throw error;
    if (response === undefined && error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof TranscriptionClientError) throw error;
    if (response !== undefined) {
      throw response.ok
        ? invalidProviderResponse()
        : parseErrorEnvelope(null);
    }
    throw new TranscriptionClientError(
      "TRANSCRIPTION_UNAVAILABLE",
      "Speech transcription is unavailable.",
      true,
    );
  } finally {
    deadline.dispose();
  }
}

async function requestLocalTranscription(input: {
  interactionId: string;
  attempt: number;
  purpose: TranscriptionPurpose;
  locale: string;
  audio: Blob;
  signal: AbortSignal;
}): Promise<TranscriptionSuccess> {
  let local: typeof import("./local-transcription-client") | undefined;
  try {
    local = await import("./local-transcription-client");
    const rawTranscript = await local.transcribeLocally(input);
    const transcript = input.purpose === "swap-direction"
      ? normalizeTextSwapDirection(rawTranscript)
      : rawTranscript;
    if (transcript === null) {
      throw new TranscriptionClientError(
        "INVALID_PROVIDER_RESPONSE",
        "Speech transcription returned an invalid response.",
        true,
      );
    }
    const result: TranscriptionSuccess = {
      protocolVersion: PROTOCOL_VERSION,
      interactionId: input.interactionId,
      attempt: input.attempt,
      transcript,
    };
    if (!isSuccess(result, input.interactionId, input.attempt, input.purpose)) {
      throw new TranscriptionClientError(
        "INVALID_PROVIDER_RESPONSE",
        "Speech transcription returned an invalid response.",
        true,
      );
    }
    return result;
  } catch (error) {
    if (input.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    if (error instanceof TranscriptionClientError) throw error;
    if (local !== undefined && error instanceof local.LocalTranscriptionError) {
      if (error.reason === "no-speech") {
        throw new TranscriptionClientError("NO_SPEECH", "No words were heard.", true);
      }
      if (error.reason === "timeout") {
        throw new TranscriptionClientError(
          "TRANSCRIPTION_TIMEOUT",
          "On-device speech transcription timed out.",
          true,
        );
      }
      throw new TranscriptionClientError(
        error.reason === "unavailable" ? "TRANSCRIPTION_UNAVAILABLE" : "TRANSCRIPTION_FAILED",
        "On-device speech transcription is unavailable.",
        true,
      );
    }
    throw new TranscriptionClientError(
      "TRANSCRIPTION_UNAVAILABLE",
      "On-device speech transcription is unavailable.",
      true,
    );
  }
}

function withDeadline(parent: AbortSignal, timeoutMs: number): {
  signal: AbortSignal;
  settlement: Promise<never>;
  didTimeout: () => boolean;
  dispose: () => void;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TranscriptionClientError(
      "INVALID_REQUEST",
      "The transcription timeout is invalid.",
      false,
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  let rejectSettlement!: (reason: unknown) => void;
  const settlement = new Promise<never>((_resolve, reject) => {
    rejectSettlement = reject;
  });
  const abortFromParent = () => {
    controller.abort(parent.reason);
    rejectSettlement(parent.reason ?? new DOMException("Aborted", "AbortError"));
  };
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("Transcription timed out.", "TimeoutError");
    controller.abort(reason);
    rejectSettlement(reason);
  }, timeoutMs);

  return {
    signal: controller.signal,
    settlement,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}

function validateClientRecording(audio: Blob, durationMs: number): void {
  if (audio.size === 0) throw new TranscriptionClientError("AUDIO_EMPTY", "No speech was recorded.", true);
  if (audio.size > MAX_AUDIO_BYTES) throw new TranscriptionClientError("AUDIO_TOO_LARGE", "The recording is too large.", false);
  if (!isAcceptedAudioType(audio.type)) throw new TranscriptionClientError("UNSUPPORTED_AUDIO", "The recording format is unsupported.", false);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new TranscriptionClientError("INVALID_REQUEST", "The recording duration is invalid.", false);
  if (durationMs > MAX_ACCEPTED_RECORDING_MS) throw new TranscriptionClientError("AUDIO_TOO_LONG", "The recording is too long.", false);
}

function parseErrorEnvelope(payload: unknown): TranscriptionClientError {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    "message" in payload.error &&
    "retryable" in payload.error &&
    typeof payload.error.code === "string" &&
    typeof payload.error.message === "string" &&
    typeof payload.error.retryable === "boolean" &&
    exactKeys(payload, ["error"]) &&
    exactKeys(payload.error, ["code", "message", "retryable", "interactionId", "attempt"]) &&
    isTranscriptionErrorCode(payload.error.code)
  ) {
    const error = payload as TranscriptionErrorEnvelope;
    return new TranscriptionClientError(error.error.code, error.error.message, error.error.retryable);
  }
  return new TranscriptionClientError("TRANSCRIPTION_FAILED", "The recording could not be transcribed.", true);
}

function invalidProviderResponse(): TranscriptionClientError {
  return new TranscriptionClientError(
    "INVALID_PROVIDER_RESPONSE",
    "Speech transcription returned an invalid response.",
    true,
  );
}

function isSuccess(
  value: unknown,
  interactionId: string,
  attempt: number,
  purpose: TranscriptionPurpose,
): value is TranscriptionSuccess {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TranscriptionSuccess>;
  return exactKeys(candidate, ["protocolVersion", "interactionId", "attempt", "transcript"]) &&
    candidate.protocolVersion === PROTOCOL_VERSION &&
    candidate.interactionId === interactionId &&
    candidate.attempt === attempt &&
    typeof candidate.transcript === "string" &&
    candidate.transcript.trim().length > 0 &&
    candidate.transcript.length <= MAX_NODE_TEXT_CODE_UNITS &&
    (purpose !== "swap-direction" || normalizeTextSwapDirection(candidate.transcript) === candidate.transcript);
}

function basePath(): string {
  return clientMatterBasePath();
}

export function localTranscriptionIsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED === "true";
}

const TRANSCRIPTION_ERROR_CODES = new Set<TranscriptionErrorCode>([
  "INVALID_REQUEST", "UNSUPPORTED_AUDIO", "AUDIO_EMPTY", "AUDIO_TOO_LARGE",
  "AUDIO_TOO_LONG", "NO_SPEECH", "TRANSCRIPTION_TIMEOUT",
  "TRANSCRIPTION_UNAVAILABLE", "TRANSCRIPTION_FAILED", "INVALID_PROVIDER_RESPONSE",
]);

function isTranscriptionErrorCode(value: unknown): value is TranscriptionErrorCode {
  return typeof value === "string" && TRANSCRIPTION_ERROR_CODES.has(value as TranscriptionErrorCode);
}

function exactKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}
