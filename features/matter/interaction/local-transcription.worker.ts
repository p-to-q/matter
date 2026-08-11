import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny";

type TranscriptionRequest = Readonly<{
  type: "transcribe";
  id: string;
  audio: Float32Array;
  language: string;
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
  try {
    scope.postMessage({ id: request.id, status: "started" });
    transcriber ??= createTranscriber();
    const recognize = await transcriber;
    const result = await recognize(request.audio, {
      language: request.language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    if (cancelled.delete(request.id)) {
      scope.postMessage({ id: request.id, status: "cancelled" });
      return;
    }
    scope.postMessage({ id: request.id, status: "complete", text: result.text });
  } catch {
    // Model, network, and runtime details stay inside the worker boundary.
    scope.postMessage({ id: request.id, status: "failed" });
  }
}

function createTranscriber() {
  return pipeline(
    "automatic-speech-recognition",
    MODEL_ID,
    { device: "wasm", dtype: "q8" },
  );
}
