import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { normalizeTextSwapDirection } from "../protocol/text-swap-policy";
import type {
  TranscriptionPurpose,
  TranscriptionRequest,
  TranscriptionSuccess,
} from "../protocol/transcription-contract";
import {
  TRANSCRIPTION_SERVER_TIMEOUT_MS,
  hasPresentedEmoji,
  maxTranscriptionOutputCodePoints,
  transcriptionTextFitsCapacity,
} from "../protocol/transcription-contract";
import { createRequestDeadline, endedOnDeadline, rejectOnAbort } from "./abort-boundary";
import { TranscriptionServerError } from "./transcription-errors";
import { materialModelSurfaceAuthorized } from "./material-model-surface";
import {
  normalizeSpokenTranscript,
  type TranscriptPauseEvidence,
} from "../runtime/spoken-transcript";

export type TranscriptionAdapter = (
  request: TranscriptionRequest,
  signal: AbortSignal,
) => Promise<{
  transcript: string;
  /** Provider-private acoustic gaps; never returned in the wire envelope. */
  pauses?: readonly TranscriptPauseEvidence[];
}>;

const FIXTURE_ADMISSION_TRANSCRIPT =
  "也许我还没有想清楚，但这句话可以先留在这里，等它继续长出自己的方向。";

export async function transcribeRecording(
  request: TranscriptionRequest,
  requestSignal: AbortSignal,
  adapter: TranscriptionAdapter,
): Promise<TranscriptionSuccess> {
  // The adapter's own deadline. A route-entry deadline that elapses first
  // keeps its timeout identity through this signal.
  const deadline = createRequestDeadline(requestSignal, TRANSCRIPTION_SERVER_TIMEOUT_MS);
  const abortBoundary = rejectOnAbort(deadline.signal);
  try {
    if (requestSignal.aborted) throw new DOMException("Aborted", "AbortError");
    // Aborting a signal is advisory. The boundary must still settle when an SDK
    // or provider adapter ignores it, otherwise one request can hang forever.
    const result = await Promise.race([
      adapter(request, deadline.signal),
      abortBoundary.promise,
    ]);
    const transcript = validateTranscript(result.transcript, request, result.pauses);
    return {
      protocolVersion: request.protocolVersion,
      interactionId: request.interactionId,
      attempt: request.attempt,
      transcript,
    };
  } catch (error) {
    if (error instanceof TranscriptionServerError) throw error;
    if (endedOnDeadline(deadline.signal)) {
      throw new TranscriptionServerError(
        "TRANSCRIPTION_TIMEOUT",
        "Speech transcription timed out.",
        true,
        504,
        request.interactionId,
        request.attempt,
      );
    }
    if (requestSignal.aborted) {
      throw new TranscriptionServerError(
        "TRANSCRIPTION_FAILED",
        "The transcription request was cancelled.",
        true,
        499,
        request.interactionId,
        request.attempt,
      );
    }
    throw new TranscriptionServerError(
      "TRANSCRIPTION_FAILED",
      "The recording could not be transcribed.",
      true,
      502,
      request.interactionId,
      request.attempt,
    );
  } finally {
    abortBoundary.dispose();
    deadline.dispose();
  }
}

export const fixtureTranscriptionAdapter: TranscriptionAdapter = async (request) => ({
  transcript: fixtureTranscript(request.purpose),
});

// Exhaustive by construction: a new purpose that is not listed here is a
// compile error, not a deployment that silently refuses it before parsing.
const TRANSCRIPTION_PURPOSES = Object.freeze(Object.keys({
  admission: true,
  direction: true,
  "swap-direction": true,
} satisfies Readonly<Record<TranscriptionPurpose, true>>) as TranscriptionPurpose[]);

/**
 * Resolves this deployment's server transcription capability from
 * configuration alone. The route calls it before it reads a recording, so a
 * deployment that cannot transcribe any purpose refuses without buffering
 * audio it would only discard. The per-purpose product gate still runs once the
 * purpose is known; see `assertTranscriptionPurposeAvailable`.
 */
export function resolveTranscriptionAdapter(): TranscriptionAdapter {
  const configured = process.env.MATTER_TRANSCRIPTION_ADAPTER;
  // Native browser recognition is a client-owned path; never silently turn a
  // server request into fixture speech when that deployment mode is selected.
  if (configured === "browser") {
    throw new TranscriptionServerError(
      "TRANSCRIPTION_UNAVAILABLE",
      "This deployment uses browser-native speech recognition.",
      true,
      503,
    );
  }
  if (!TRANSCRIPTION_PURPOSES.some(transcriptionPurposeEnabled)) throw transcriptionNotConfigured();
  if (configured === "fixture" || (configured === undefined && process.env.NODE_ENV !== "production")) {
    return fixtureTranscriptionAdapter;
  }
  throw transcriptionNotConfigured();
}

/**
 * Each voice purpose belongs to its own product surface and gate. A closed
 * purpose is deployment configuration: sending the same request again cannot
 * succeed, so the refusal is not retryable.
 */
export function assertTranscriptionPurposeAvailable(purpose: TranscriptionRequest["purpose"]): void {
  if (!transcriptionPurposeEnabled(purpose)) {
    throw new TranscriptionServerError(
      "TRANSCRIPTION_UNAVAILABLE",
      "This voice surface is not available.",
      false,
      503,
    );
  }
}

function transcriptionPurposeEnabled(purpose: TranscriptionRequest["purpose"]): boolean {
  // Preserve both existing voice paths exactly. Swap direction belongs to the
  // Text Swap product surface; provider promotion is a separate concern.
  return purpose === "swap-direction"
    ? materialModelSurfaceAuthorized("matter-text-swap")
    : process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED !== "false";
}

function transcriptionNotConfigured(): TranscriptionServerError {
  return new TranscriptionServerError(
    "TRANSCRIPTION_UNAVAILABLE",
    "Speech transcription is not configured.",
    true,
    503,
  );
}

function validateTranscript(
  value: unknown,
  request: TranscriptionRequest,
  pauses?: readonly TranscriptPauseEvidence[],
): string {
  if (typeof value !== "string") {
    throw providerResponseError(request);
  }
  if (value.trim().length === 0) {
    throw new TranscriptionServerError(
      "NO_SPEECH",
      "No words were heard.",
      true,
      422,
      request.interactionId,
      request.attempt,
    );
  }
  if (!transcriptionTextFitsCapacity(value, request.purpose)) {
    throw providerResponseError(request);
  }
  if (hasPresentedEmoji(value)) throw providerResponseError(request);
  const punctuated = normalizeSpokenTranscript({
    text: value,
    locale: request.locale,
    pauses,
    maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
    maxOutputCodePoints: maxTranscriptionOutputCodePoints(request.purpose),
  });
  if (!transcriptionTextFitsCapacity(punctuated, request.purpose)) {
    throw providerResponseError(request);
  }
  if (request.purpose === "swap-direction") {
    const direction = normalizeTextSwapDirection(punctuated);
    if (direction === null) throw providerResponseError(request);
    return direction;
  }
  return punctuated;
}

function fixtureTranscript(purpose: TranscriptionRequest["purpose"]): string {
  switch (purpose) {
    case "admission":
      return process.env.MATTER_FIXTURE_ADMISSION_TRANSCRIPT ?? FIXTURE_ADMISSION_TRANSCRIPT;
    case "direction":
      return process.env.MATTER_FIXTURE_DIRECTION_TRANSCRIPT ??
        "把这里说得更具体一些，但保留一点不确定。";
    case "swap-direction":
      return process.env.MATTER_FIXTURE_SWAP_DIRECTION_TRANSCRIPT ??
        "换一种更清楚但保留安静感的说法";
  }
}

function providerResponseError(request: TranscriptionRequest) {
  return new TranscriptionServerError(
    "INVALID_PROVIDER_RESPONSE",
    "Speech transcription returned an invalid response.",
    true,
    502,
    request.interactionId,
    request.attempt,
  );
}
