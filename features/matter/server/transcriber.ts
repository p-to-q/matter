import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import { normalizeTextSwapDirection } from "../protocol/text-swap-policy";
import type {
  TranscriptionRequest,
  TranscriptionSuccess,
} from "../protocol/transcription-contract";
import { TRANSCRIPTION_SERVER_TIMEOUT_MS } from "../protocol/transcription-contract";
import { isTimeoutSignal, TranscriptionServerError } from "./transcription-errors";

export type TranscriptionAdapter = (
  request: TranscriptionRequest,
  signal: AbortSignal,
) => Promise<{ transcript: string }>;

const FIXTURE_ADMISSION_TRANSCRIPT =
  "也许我还没有想清楚，但这句话可以先留在这里，等它继续长出自己的方向。";

export async function transcribeRecording(
  request: TranscriptionRequest,
  requestSignal: AbortSignal,
  adapter?: TranscriptionAdapter,
): Promise<TranscriptionSuccess> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), TRANSCRIPTION_SERVER_TIMEOUT_MS);
  const combined = combineSignals(requestSignal, timeoutController.signal);
  const abortBoundary = rejectOnAbort(combined.signal);
  try {
    if (requestSignal.aborted) throw new DOMException("Aborted", "AbortError");
    const selectedAdapter = adapter ?? resolveTranscriptionAdapter(request.purpose);
    // Aborting a signal is advisory. The boundary must still settle when an SDK
    // or provider adapter ignores it, otherwise one request can hang forever.
    const result = await Promise.race([
      selectedAdapter(request, combined.signal),
      abortBoundary.promise,
    ]);
    const transcript = validateTranscript(result.transcript, request);
    return {
      protocolVersion: request.protocolVersion,
      interactionId: request.interactionId,
      attempt: request.attempt,
      transcript,
    };
  } catch (error) {
    if (error instanceof TranscriptionServerError) throw error;
    if (timeoutController.signal.aborted || isTimeoutSignal(requestSignal)) {
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
    clearTimeout(timeout);
    abortBoundary.dispose();
    combined.dispose();
  }
}

export const fixtureTranscriptionAdapter: TranscriptionAdapter = async (request) => ({
  transcript: fixtureTranscript(request.purpose),
});

function resolveTranscriptionAdapter(purpose: TranscriptionRequest["purpose"]): TranscriptionAdapter {
  // Preserve both existing voice paths exactly. Swap direction is a separate
  // local tool capability and follows its own production-off adapter gate.
  const existingVoiceDisabled = purpose !== "swap-direction" &&
    process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED === "false";
  const textSwapDisabled = purpose === "swap-direction" && (
    process.env.MATTER_TEXT_SWAP_ADAPTER === "off" ||
    (process.env.MATTER_TEXT_SWAP_ADAPTER === undefined && process.env.NODE_ENV === "production")
  );
  if (existingVoiceDisabled || textSwapDisabled) {
    throw new TranscriptionServerError(
      "TRANSCRIPTION_UNAVAILABLE",
      "Speech transcription is not configured.",
      true,
      503,
    );
  }
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
  if (configured === "fixture" || (configured === undefined && process.env.NODE_ENV !== "production")) {
    return fixtureTranscriptionAdapter;
  }
  throw new TranscriptionServerError(
    "TRANSCRIPTION_UNAVAILABLE",
    "Speech transcription is not configured.",
    true,
    503,
  );
}

function validateTranscript(
  value: unknown,
  request: TranscriptionRequest,
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
  if (request.purpose === "swap-direction") {
    const direction = normalizeTextSwapDirection(value);
    if (direction === null) throw providerResponseError(request);
    return direction;
  }
  if (value.length > MAX_NODE_TEXT_CODE_UNITS) {
    throw providerResponseError(request);
  }
  return value;
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

function combineSignals(...signals: AbortSignal[]): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    },
  };
}

function rejectOnAbort(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let rejectPromise!: (error: DOMException) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  const reject = () => rejectPromise(new DOMException("Aborted", "AbortError"));
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return {
    promise,
    dispose: () => signal.removeEventListener("abort", reject),
  };
}
