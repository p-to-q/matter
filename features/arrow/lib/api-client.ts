import type {
  ActionPlan,
  ArrowApiError,
  InteractionEnvelope,
} from "../engine/protocol";
import { actionPlanSchema } from "../engine/schemas";
import {
  audioUploadName,
  isSupportedAudioType,
  MAX_ACCEPTED_RECORDING_MS,
  MAX_AUDIO_BYTES,
} from "../voice/audio-policy";

const basePath = process.env.NEXT_PUBLIC_ARROW_BASE_PATH ?? "/matter";

async function parseFailure(response: Response) {
  const body = (await response.json().catch(() => null)) as ArrowApiError | null;
  return new Error(body?.error.message ?? "The request could not be completed.");
}

export async function transcribe(
  audio: Blob,
  locale: string,
  durationMs: number,
  fixtureMode: boolean,
  purpose: "create" | "transform",
) {
  if (!fixtureMode) {
    if (audio.size === 0) throw new Error("No speech was recorded. Try again.");
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new Error(
        "The recording is too large. Keep one thought under a minute.",
      );
    }
    if (!isSupportedAudioType(audio.type)) {
      throw new Error("The browser produced an unsupported recording format.");
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error("The recording duration was invalid. Try again.");
    }
    if (durationMs > MAX_ACCEPTED_RECORDING_MS) {
      throw new Error(
        "The recording is too long. Keep one thought under a minute.",
      );
    }
  }

  const form = new FormData();
  const filename = fixtureMode
    ? "matter-voice.webm"
    : audioUploadName(audio.type);
  form.append("audio", audio, filename);
  form.append("locale", locale);
  form.append("durationMs", String(durationMs));
  form.append("fixtureMode", String(fixtureMode));
  form.append("purpose", purpose);

  const response = await fetch(`${basePath}/api/arrow/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw await parseFailure(response);
  return (await response.json()) as {
    transcript: string;
    language?: string;
    durationMs?: number;
  };
}

export async function requestPlan(
  interaction: InteractionEnvelope,
): Promise<ActionPlan> {
  const response = await fetch(`${basePath}/api/arrow/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(interaction),
  });
  if (!response.ok) throw await parseFailure(response);
  return actionPlanSchema.parse(await response.json());
}
