import { isJsonContentType } from "./content-type";

/**
 * The one place a JSON request boundary is enforced. Every route that accepts a
 * body needs the same four guarantees — a declared size is not trusted, the
 * stream is bounded while it is read rather than after it is buffered, malformed
 * UTF-8 is refused rather than replaced, and the work is abandoned on a deadline
 * or a disconnect — and they are easy to get subtly wrong once per route.
 *
 * The policy supplies the numbers and the error type; nothing here knows what
 * any particular surface means.
 */

export type BoundedRequestFailure =
  /** The body exceeded `maxBytes`, whether or not it said so. */
  | "too-large"
  | "unsupported-media-type"
  | "invalid-content-length"
  | "missing-body"
  | "not-json"
  | "not-utf8"
  | "timed-out"
  | "cancelled";

export type BoundedRequestPolicy = Readonly<{
  maxBytes: number;
  timeoutMs: number;
  /** Returns the error to throw. It must throw for every failure. */
  fail: (reason: BoundedRequestFailure) => Error;
}>;

export type BoundedJsonRequestMetadata = Readonly<{
  /** Actual UTF-8 bytes read from the request stream, never a declared length. */
  requestBytes: number;
}>;

/**
 * Reads and parses one bounded JSON body, then runs `handle` inside the same
 * deadline. The boundary is disposed however `handle` settles, so a route
 * cannot leak a timer by returning early.
 */
export async function withBoundedJsonRequest<T>(
  request: Request,
  policy: BoundedRequestPolicy,
  handle: (
    payload: unknown,
    signal: AbortSignal,
    metadata: BoundedJsonRequestMetadata,
  ) => Promise<T>,
): Promise<T> {
  let declaredLength: number | null;
  try {
    declaredLength = parseOptionalContentLength(request.headers.get("content-length"), policy);
  } catch (error) {
    cancelBody(request.body);
    throw error;
  }
  if (declaredLength !== null && declaredLength > policy.maxBytes) {
    cancelBody(request.body);
    throw policy.fail("too-large");
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    cancelBody(request.body);
    throw policy.fail("unsupported-media-type");
  }

  const boundary = createRequestBoundary(request.signal, policy.timeoutMs);
  try {
    const body = await readBoundedText(request, policy, boundary.signal);
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw policy.fail("not-json");
    }
    try {
      return await handle(payload, boundary.signal, Object.freeze({
        requestBytes: new TextEncoder().encode(body).byteLength,
      }));
    } catch (error) {
      // The boundary covers `handle` too, but only the body read raises the
      // policy's own error. Work that observes the signal rejects with a bare
      // AbortError, which no route recognises, so a deadline reached while the
      // model was answering was reported as an opaque 500 and the `timed-out`
      // branch was unreachable in practice. Attribute it here, once, rather
      // than in every route.
      //
      // A caller that disconnected is deliberately left to propagate: nobody is
      // waiting for the response, and the route contract is that this is the
      // one case that throws rather than answering.
      if (
        boundary.signal.aborted &&
        isAbortError(error) &&
        boundedRequestInterruption(boundary.signal) === "timed-out"
      ) {
        throw policy.fail("timed-out");
      }
      throw error;
    }
  } finally {
    boundary.dispose();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Distinguishes a deadline from a disconnect so a route can attribute it. */
export function boundedRequestInterruption(signal: AbortSignal): BoundedRequestFailure {
  return signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
    ? "timed-out"
    : "cancelled";
}

async function readBoundedText(
  request: Request,
  policy: BoundedRequestPolicy,
  signal: AbortSignal,
): Promise<string> {
  const body = request.body;
  if (body === null) throw policy.fail("missing-body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await readWithSignal(reader, policy, signal);
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      // A declared length may be absent or untrue, so the real bound is here.
      if (total > policy.maxBytes) {
        cancelReader(reader);
        throw policy.fail("too-large");
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
    throw policy.fail("not-utf8");
  }
}

async function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  policy: BoundedRequestPolicy,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw policy.fail(boundedRequestInterruption(signal));
  let rejectInterruption!: (error: Error) => void;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
    rejectInterruption(policy.fail(boundedRequestInterruption(signal)));
  };
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await Promise.race([reader.read(), interrupted]);
    if (signal.aborted) throw policy.fail(boundedRequestInterruption(signal));
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function createRequestBoundary(
  requestSignal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException("Cancelled", "AbortError"));
  if (requestSignal.aborted) cancel();
  else requestSignal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", cancel);
    },
  };
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  void reader.cancel().catch(() => undefined);
  try {
    reader.releaseLock();
  } catch {
    // Releasing is best effort after a broken stream source.
  }
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // A pre-locked invalid body is still refused before parsing or delegation.
  }
}

function parseOptionalContentLength(value: string | null, policy: BoundedRequestPolicy): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw policy.fail("invalid-content-length");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw policy.fail("invalid-content-length");
  return parsed;
}
