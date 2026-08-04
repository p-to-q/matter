import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import type {
  TranscriptionRequest,
  TranscriptionSuccess,
} from "./transcription-contract";
import { TRANSCRIPTION_SERVER_TIMEOUT_MS } from "./transcription-contract";
import { TranscriptionServerError } from "./transcription-errors";

export type TranscriptionAdapter = (
  request: TranscriptionRequest,
  signal: AbortSignal,
) => Promise<{ transcript: string }>;

const FIXTURE_ADMISSION_TRANSCRIPT =
  "也许我还没有想清楚，但这句话可以先留在这里，等它继续长出自己的方向。";

export async function transcribeRecording(
  request: TranscriptionRequest,
  requestSignal: AbortSignal,
  adapter = resolveTranscriptionAdapter(),
): Promise<TranscriptionSuccess> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), TRANSCRIPTION_SERVER_TIMEOUT_MS);
  const combined = combineSignals(requestSignal, timeoutController.signal);
  const abortBoundary = rejectOnAbort(combined.signal);
  try {
    // Aborting a signal is advisory. The boundary must still settle when an SDK
    // or provider adapter ignores it, otherwise one request can hang forever.
    const result = await Promise.race([
      adapter(request, combined.signal),
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
    if (timeoutController.signal.aborted) {
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
  transcript:
    request.purpose === "admission"
      ? process.env.MATTER_FIXTURE_ADMISSION_TRANSCRIPT ?? FIXTURE_ADMISSION_TRANSCRIPT
      : process.env.MATTER_FIXTURE_DIRECTION_TRANSCRIPT ??
        "把这里说得更具体一些，但保留一点不确定。",
});

function resolveTranscriptionAdapter(): TranscriptionAdapter {
  const configured = process.env.MATTER_TRANSCRIPTION_ADAPTER;
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
  if (value.length > MAX_NODE_TEXT_CODE_UNITS) {
    throw providerResponseError(request);
  }
  return value;
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
