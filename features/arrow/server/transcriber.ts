import { ArrowServerError } from "./errors";
import {
  audioUploadName,
  isSupportedAudioType,
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
} from "../voice/audio-policy";

export type TranscriptionResult = {
  transcript: string;
  language?: string;
  durationMs?: number;
};

export async function transcribeAudio(
  audio: File | null,
  locale: string,
  durationMs?: number,
  fixtureMode = false,
  purpose: "create" | "transform" = "create",
): Promise<TranscriptionResult> {
  const adapter = process.env.ARROW_TRANSCRIPTION_ADAPTER ?? "mock";

  // Demo capture is intentionally audio-free, so fixture authorization must be
  // resolved before validating the live recording boundary.
  if (fixtureMode) {
    if (process.env.ARROW_DEMO_FIXTURES === "false") {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "Fixture mode is not available on this deployment.",
        false,
        403,
      );
    }
    return {
      transcript:
        purpose === "transform"
          ? process.env.ARROW_FIXTURE_TRANSFORM_TRANSCRIPT ??
            "把这种可能性说得更具体一些，但保留一点不确定。"
          : process.env.ARROW_FIXTURE_TRANSCRIPT ??
            "人为什么会对从未经历过的时代产生怀旧？",
      language: locale,
      durationMs,
    };
  }

  if (
    durationMs === undefined ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > MAX_ACCEPTED_RECORDING_MS
  ) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      durationMs !== undefined && durationMs > MAX_ACCEPTED_RECORDING_MS
        ? "The recording is too long. Keep one thought under a minute."
        : "The recording duration was invalid.",
      true,
      durationMs !== undefined && durationMs > MAX_ACCEPTED_RECORDING_MS
        ? 413
        : 400,
    );
  }

  if (!audio || audio.size === 0) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "No speech was recorded.",
      true,
      400,
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "The recording is too large. Keep one thought under a minute.",
      true,
      413,
    );
  }
  if (!isSupportedAudioType(audio.type)) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "The browser produced an unsupported recording format.",
      false,
      415,
    );
  }

  if (adapter === "mock") {
    return {
      transcript:
        purpose === "transform"
          ? process.env.ARROW_FIXTURE_TRANSFORM_TRANSCRIPT ??
            "把这种可能性说得更具体一些，但保留一点不确定。"
          : process.env.ARROW_FIXTURE_TRANSCRIPT ??
            "人为什么会对从未经历过的时代产生怀旧？",
      language: locale,
      durationMs,
    };
  }

  if (adapter !== "openai") {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "The configured transcription adapter is not supported.",
      false,
      500,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "Speech transcription is not configured.",
      false,
      503,
    );
  }

  const formData = new FormData();
  formData.append(
    "file",
    audio,
    isSupportedAudioFilename(audio.name)
      ? audio.name
      : audioUploadName(audio.type),
  );
  formData.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
  );
  const language = locale.split("-", 1)[0]?.toLowerCase();
  if (language && /^[a-z]{2,3}$/.test(language)) {
    formData.append("language", language);
  }
  formData.append(
    "prompt",
    "Matter canvas. Preserve the original language and punctuation. Product terms may include ptoq and Matter.",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      error instanceof Error && error.name === "AbortError"
        ? "Speech transcription timed out. The recording is ready to retry."
        : "Speech transcription could not be reached.",
      true,
      504,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "Speech could not be transcribed. The recording is ready to retry.",
      response.status >= 500 || response.status === 429,
      502,
    );
  }

  let payload: { text?: string; language?: string };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "Speech transcription returned an invalid response.",
      true,
      502,
    );
  }
  const transcript = payload.text?.trim();
  if (!transcript) {
    throw new ArrowServerError(
      "TRANSCRIPTION_FAILED",
      "No speech was detected.",
      true,
      422,
    );
  }

  return {
    transcript,
    language: payload.language ?? locale,
    durationMs,
  };
}

function isSupportedAudioFilename(filename: string) {
  return /\.(?:flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i.test(filename);
}
