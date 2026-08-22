/**
 * The browser cache key includes the model revision. Pinning the immutable Hub
 * commit keeps a previously cached fallback valid across deploys and makes a
 * rollback load the exact same weights instead of whatever `main` means then.
 */
export const LOCAL_TRANSCRIPTION_MODEL = Object.freeze({
  id: "onnx-community/whisper-tiny",
  revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
  device: "wasm" as const,
  dtype: "q8" as const,
});
