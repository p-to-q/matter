import { PROTOCOL_VERSION } from "../tree/model";
import {
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_REQUEST_BYTES,
  MAX_INTERACTION_ID_LENGTH,
  MAX_LOCALE_LENGTH,
  isAcceptedAudioType,
  type TranscriptionPurpose,
  type TranscriptionRequest,
} from "./transcription-contract";
import { TranscriptionServerError } from "./transcription-errors";
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
  const declaredLength = parseOptionalContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > MAX_AUDIO_REQUEST_BYTES) {
    throw new TranscriptionServerError(
      "AUDIO_TOO_LARGE",
      "The recording is too large.",
      false,
      413,
    );
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    throw invalidRequest("The recording request format is invalid.", 415);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw invalidRequest("The recording request could not be read.");
  }
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
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
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
  return Response.json(await transcribeRecording(parsed, request.signal));
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
