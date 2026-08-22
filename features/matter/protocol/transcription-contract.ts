import { PROTOCOL_VERSION } from "../tree/model";

export const MAX_RECORDING_MS = 60_000;
export const MAX_ACCEPTED_RECORDING_MS = 65_000;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_REQUEST_BYTES = 2_200_000;
// A 2,000-code-unit transcript can expand to 12,000 UTF-8 bytes when JSON
// escapes every control code unit; leave bounded room for the echoed identity.
export const MAX_TRANSCRIPTION_RESPONSE_BYTES = 16 * 1024;
export const MAX_INTERACTION_ID_LENGTH = 128;
export const MAX_LOCALE_LENGTH = 35;
// These layers settle independently. The client grace lets ordinary uploads
// and timeout responses complete, but it is not an end-to-end network guarantee.
export const TRANSCRIPTION_SERVER_TIMEOUT_MS = 30_000;
export const TRANSCRIPTION_TRANSPORT_GRACE_MS = 5_000;
export const TRANSCRIPTION_CLIENT_TIMEOUT_MS =
  TRANSCRIPTION_SERVER_TIMEOUT_MS + TRANSCRIPTION_TRANSPORT_GRACE_MS;

export type TranscriptionPurpose = "admission" | "direction" | "swap-direction";

export type TranscriptionRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  interactionId: string;
  attempt: number;
  purpose: TranscriptionPurpose;
  locale: string;
  durationMs: number;
  audio: File;
};

export type TranscriptionSuccess = {
  protocolVersion: typeof PROTOCOL_VERSION;
  interactionId: string;
  attempt: number;
  transcript: string;
};

export type TranscriptionErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_AUDIO"
  | "AUDIO_EMPTY"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_TOO_LONG"
  | "NO_SPEECH"
  | "TRANSCRIPTION_TIMEOUT"
  | "TRANSCRIPTION_UNAVAILABLE"
  | "TRANSCRIPTION_FAILED"
  | "INVALID_PROVIDER_RESPONSE";

export type TranscriptionErrorEnvelope = {
  error: {
    code: TranscriptionErrorCode;
    message: string;
    retryable: boolean;
    interactionId?: string;
    attempt?: number;
  };
};

const AUDIO_EXTENSIONS = Object.freeze({
  "audio/webm": "webm",
  "audio/mp4": "mp4",
} as const);

export function baseAudioMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function audioFileExtension(mimeType: string): string | null {
  const base = baseAudioMimeType(mimeType);
  // `Object.hasOwn`, not a bare index: the table inherits from Object.prototype,
  // so "constructor", "toString" and "valueOf" would otherwise resolve to
  // inherited members and pass the accepted-type gate on the upload route.
  return Object.hasOwn(AUDIO_EXTENSIONS, base)
    ? AUDIO_EXTENSIONS[base as keyof typeof AUDIO_EXTENSIONS]
    : null;
}

export function isAcceptedAudioType(mimeType: string): boolean {
  return audioFileExtension(mimeType) !== null;
}

export function audioUploadName(mimeType: string): string {
  const extension = audioFileExtension(mimeType);
  if (extension === null) throw new Error("Unsupported recording MIME type.");
  return `matter-voice.${extension}`;
}
