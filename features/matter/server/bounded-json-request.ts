import { BoundedByteAccumulator } from "../runtime/bounded-byte-accumulator";
import { createRequestDeadline, endedOnDeadline, rejectOnAbort } from "./abort-boundary";
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

  const boundary = createRequestDeadline(request.signal, policy.timeoutMs);
  try {
    const body = await readBoundedText(request, policy, boundary.signal);
    let payload: unknown;
    try {
      payload = JSON.parse(body.text) as unknown;
    } catch {
      throw policy.fail("not-json");
    }
    try {
      return await handle(payload, boundary.signal, Object.freeze({
        requestBytes: body.byteLength,
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
  return endedOnDeadline(signal) ? "timed-out" : "cancelled";
}

async function readBoundedText(
  request: Request,
  policy: BoundedRequestPolicy,
  signal: AbortSignal,
): Promise<Readonly<{ text: string; byteLength: number }>> {
  const body = request.body;
  if (body === null) throw policy.fail("missing-body");
  const reader = body.getReader();
  const bytes = new BoundedByteAccumulator(policy.maxBytes);
  const interruption = rejectOnAbort(
    signal,
    () => policy.fail(boundedRequestInterruption(signal)),
  );
  try {
    for (;;) {
      // The interruption is raced first: once the boundary has ended, it wins
      // over a chunk the stream already had buffered.
      const { done, value } = await Promise.race([interruption.promise, reader.read()]);
      if (done) break;
      if (value === undefined) continue;
      // A declared length may be absent or untrue, so the real bound is here.
      if (!bytes.append(value)) throw policy.fail("too-large");
    }
  } catch (error) {
    // The boundary settles without waiting for the stream to accept this.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    interruption.dispose();
    try {
      reader.releaseLock();
    } catch {
      // Releasing is best effort after a broken stream source.
    }
  }

  try {
    const snapshot = bytes.snapshot();
    return Object.freeze({
      text: new TextDecoder("utf-8", { fatal: true }).decode(snapshot),
      byteLength: snapshot.byteLength,
    });
  } catch {
    throw policy.fail("not-utf8");
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
