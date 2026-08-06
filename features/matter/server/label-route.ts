import {
  LABEL_CLIENT_TIMEOUT_MS,
  MAX_LABEL_REQUEST_BYTES,
  parseLabelRequest,
} from "./label-contract";
import { LabelServerError, invalidLabelRequest } from "./label-errors";
import { generateLabel } from "./label-generator";

/**
 * Parses, delegates, and translates. No labelling policy lives here: the route
 * only refuses what it cannot understand and turns a server error into the one
 * stable envelope the browser knows how to read.
 */
export async function handleLabelRequest(request: Request): Promise<Response> {
  const declaredLength = parseOptionalContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > MAX_LABEL_REQUEST_BYTES) {
    throw new LabelServerError("INVALID_REQUEST", "The label request is too large.", false, 413);
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new LabelServerError("INVALID_REQUEST", "The label request format is invalid.", false, 415);
  }

  const boundary = createRequestBoundary(request.signal);
  try {
    const body = await readBoundedText(request, MAX_LABEL_REQUEST_BYTES, boundary.signal);
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw invalidLabelRequest("The label request could not be read.");
    }

    const parsed = parseLabelRequest(payload);
    if (!parsed.ok) throw invalidLabelRequest(parsed.message);

    return Response.json(await generateLabel(parsed.request, boundary.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } finally {
    boundary.dispose();
  }
}

export function labelErrorResponse(error: unknown): Response {
  const known = error instanceof LabelServerError
    ? error
    : new LabelServerError("LABEL_FAILED", "The label could not be derived.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Reads at most `maxBytes` and rejects malformed UTF-8 rather than replacing it.
 * A declared content length may be absent or untrue, so the bound is enforced
 * while streaming rather than after buffering.
 */
async function readBoundedText(request: Request, maxBytes: number, signal: AbortSignal): Promise<string> {
  const body = request.body;
  if (body === null) throw invalidLabelRequest("The label request has no body.");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await readWithSignal(reader, signal);
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        cancelReader(reader);
        throw new LabelServerError("INVALID_REQUEST", "The label request is too large.", false, 413);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The abort path may already have released the reader.
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    throw invalidLabelRequest("The label request is not valid UTF-8.");
  }
}

async function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw labelInterruptionError(signal);
  let rejectInterruption!: (error: LabelServerError) => void;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
    rejectInterruption(labelInterruptionError(signal));
  };
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await Promise.race([reader.read(), interrupted]);
    if (signal.aborted) throw labelInterruptionError(signal);
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function createRequestBoundary(requestSignal: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException("Cancelled", "AbortError"));
  if (requestSignal.aborted) cancel();
  else requestSignal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    LABEL_CLIENT_TIMEOUT_MS,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", cancel);
    },
  };
}

function labelInterruptionError(signal: AbortSignal): LabelServerError {
  const timedOut = signal.reason instanceof DOMException && signal.reason.name === "TimeoutError";
  return new LabelServerError(
    "LABEL_FAILED",
    timedOut ? "The label request timed out." : "The label request was cancelled.",
    true,
    timedOut ? 504 : 499,
  );
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  void reader.cancel().catch(() => undefined);
  try {
    reader.releaseLock();
  } catch {
    // Releasing is best effort after a broken stream source.
  }
}

function parseOptionalContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) {
    throw invalidLabelRequest("The content length is invalid.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidLabelRequest("The content length is invalid.");
  }
  return parsed;
}
