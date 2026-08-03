export const RECORDING_LIMIT_MS = 60_000;
export const MAX_ACCEPTED_RECORDING_MS = 65_000;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_REQUEST_BYTES = 26 * 1024 * 1024;

export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mpga",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
} as const;

export function baseAudioMimeType(mimeType: string) {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function audioFileExtension(mimeType: string): string | null {
  const type = baseAudioMimeType(mimeType);
  return AUDIO_EXTENSIONS[type as keyof typeof AUDIO_EXTENSIONS] ?? null;
}

export function isSupportedAudioType(mimeType: string) {
  return audioFileExtension(mimeType) !== null;
}

export function audioUploadName(mimeType: string) {
  const extension = audioFileExtension(mimeType);
  if (!extension) {
    throw new Error("The browser produced an unsupported recording format.");
  }
  return `matter-voice.${extension}`;
}

export function microphoneStartError(error: unknown) {
  const errorName =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  if (
    errorName === "NotAllowedError" ||
    errorName === "SecurityError"
  ) {
    return "Microphone access is needed. Allow it, then try again.";
  }
  if (errorName === "NotFoundError") {
    return "No microphone was found. Connect one, then try again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The microphone could not start. Try again.";
}
