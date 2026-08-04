export const RECORDING_LIMIT_MS = 60_000;
export const MAX_ACCEPTED_RECORDING_MS = 65_000;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_REQUEST_BYTES = MAX_AUDIO_BYTES + 128 * 1024;

export const RECORDING_MIME_CANDIDATES = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm",
  "audio/mp4",
] as const);

const AUDIO_EXTENSIONS = Object.freeze({
  "audio/webm": "webm",
  "audio/mp4": "mp4",
} as const);

export type RecordingMimeType = (typeof RECORDING_MIME_CANDIDATES)[number];
export type AcceptedAudioMimeType = keyof typeof AUDIO_EXTENSIONS;

export function baseAudioMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isAcceptedAudioMimeType(
  mimeType: string,
): mimeType is AcceptedAudioMimeType {
  return Object.hasOwn(AUDIO_EXTENSIONS, baseAudioMimeType(mimeType));
}

export function audioUploadName(mimeType: string): string | null {
  const baseType = baseAudioMimeType(mimeType) as AcceptedAudioMimeType;
  const extension = AUDIO_EXTENSIONS[baseType];
  return extension === undefined ? null : `matter-voice.${extension}`;
}

export function chooseRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): RecordingMimeType | null {
  for (const mimeType of RECORDING_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mimeType)) return mimeType;
    } catch {
      // Capability probing is advisory; a broken candidate must not hide later fallbacks.
    }
  }
  return null;
}
