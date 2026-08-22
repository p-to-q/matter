/**
 * The browser cache key includes the model revision. Pinning the immutable Hub
 * commit keeps a previously cached fallback valid across deploys and makes a
 * rollback load the exact same weights instead of whatever `main` means then.
 */
export const LOCAL_TRANSCRIPTION_MODEL = Object.freeze({
  id: "onnx-community/whisper-tiny",
  revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
  device: "wasm" as const,
  // Transformers.js 4.2.0 cannot construct this pinned export's q8, uint8, or
  // fp16 WASM graphs. fp32 is the only profile with a timely Chromium receipt;
  // keep the fallback gated until a compatible quantized export is proven.
  dtype: "fp32" as const,
});

/** This pinned export supports Whisper segment tokens, but it was not exported
 * with the cross-attention tensors required for word-level timestamps. */
export const LOCAL_TRANSCRIPTION_TIMESTAMP_MODE = true as const;
