import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny";

type WorkerRequest = Readonly<{
  id: string;
  audio: Float32Array;
  language: string;
}>;

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

scope.addEventListener("message", (event) => {
  queue = queue.then(() => transcribe(event.data), () => transcribe(event.data));
});

async function transcribe(request: WorkerRequest): Promise<void> {
  try {
    transcriber ??= createTranscriber();
    const recognize = await transcriber;
    const result = await recognize(request.audio, {
      language: request.language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
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
