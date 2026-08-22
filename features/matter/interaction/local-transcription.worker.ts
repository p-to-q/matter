import { pipeline } from "@huggingface/transformers";
import {
  LOCAL_TRANSCRIPTION_MODEL,
  LOCAL_TRANSCRIPTION_TIMESTAMP_MODE,
} from "./local-transcription-model";
import {
  normalizeSpokenTranscript,
} from "../runtime/spoken-transcript";
import { deriveAcousticPauseEvidence } from "./speech-pause-evidence";
import {
  maxTranscriptionOutputCodePoints,
  type TranscriptionPurpose,
} from "../protocol/transcription-contract";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

type TranscriptionRequest = Readonly<{
  type: "transcribe";
  id: string;
  audio: Float32Array;
  language: string;
  locale: string;
  purpose: TranscriptionPurpose;
}>;

type CancelRequest = Readonly<{ type: "cancel"; id: string }>;
type WorkerRequest = TranscriptionRequest | CancelRequest;

type WorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ) => void;
  postMessage: (message: unknown) => void;
}>;

const scope = globalThis as unknown as WorkerScope;
let transcriber: ReturnType<typeof createTranscriber> | null = null;
let queue = Promise.resolve();
const cancelled = new Set<string>();

// Reaching this line proves the worker module graph is evaluated. The model is
// still untouched: `createTranscriber()` remains behind an actual utterance.
scope.postMessage({ status: "ready" });

scope.addEventListener("message", (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.id);
    scope.postMessage({ id: request.id, status: "cancelled" });
    return;
  }
  queue = queue.then(() => transcribe(request), () => transcribe(request));
});

async function transcribe(request: TranscriptionRequest): Promise<void> {
  if (cancelled.delete(request.id)) {
    scope.postMessage({ id: request.id, status: "cancelled" });
    return;
  }
  let failureStage: "model-load" | "inference" | "punctuation" = "model-load";
  try {
    scope.postMessage({ id: request.id, status: "started" });
    transcriber ??= createTranscriber();
    const recognize = await transcriber;
    failureStage = "inference";
    const result = await recognize(request.audio, {
      language: request.language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: LOCAL_TRANSCRIPTION_TIMESTAMP_MODE,
    });
    if (cancelled.delete(request.id)) {
      scope.postMessage({ id: request.id, status: "cancelled" });
      return;
    }
    failureStage = "punctuation";
    const text = normalizeSpokenTranscript({
      text: result.text,
      locale: request.locale,
      pauses: deriveAcousticPauseEvidence({
        transcript: result.text,
        chunks: result.chunks,
        audio: request.audio,
        sampleRate: 16_000,
      }),
      maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
      maxOutputCodePoints: maxTranscriptionOutputCodePoints(request.purpose),
    });
    scope.postMessage({ id: request.id, status: "complete", text });
  } catch {
    // Model, network, and runtime details stay inside the worker boundary.
    // The stage is safe operational evidence: it contains no audio, text,
    // provider message, URL, or model output and remains inside the worker port.
    scope.postMessage({ id: request.id, status: "failed", stage: failureStage });
  }
}

function createTranscriber() {
  return pipeline(
    "automatic-speech-recognition",
    LOCAL_TRANSCRIPTION_MODEL.id,
    {
      device: LOCAL_TRANSCRIPTION_MODEL.device,
      dtype: LOCAL_TRANSCRIPTION_MODEL.dtype,
      revision: LOCAL_TRANSCRIPTION_MODEL.revision,
    },
  );
}
