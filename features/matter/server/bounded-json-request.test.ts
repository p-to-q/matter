import { describe, expect, it } from "vitest";
import {
  withBoundedJsonRequest,
  type BoundedRequestFailure,
  type BoundedRequestPolicy,
} from "./bounded-json-request";

class TestBoundaryError extends Error {
  constructor(readonly reason: BoundedRequestFailure) {
    super(reason);
  }
}

function policy(timeoutMs: number): BoundedRequestPolicy {
  return Object.freeze({
    maxBytes: 1_024,
    timeoutMs,
    fail: (reason: BoundedRequestFailure) => new TestBoundaryError(reason),
  });
}

function post(signal?: AbortSignal): Request {
  return new Request("https://example.test/matter/api/probe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
    signal,
  });
}

/** Rejects the way work that observes the boundary actually rejects. */
function stallUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
      once: true,
    });
  });
}

describe("withBoundedJsonRequest", () => {
  it("reports actual request bytes only after a bounded UTF-8 body is read", async () => {
    let requestBytes = -1;
    await withBoundedJsonRequest(post(), policy(10_000), async (_payload, _signal, metadata) => {
      requestBytes = metadata.requestBytes;
    });
    expect(requestBytes).toBe(new TextEncoder().encode(JSON.stringify({ ok: true })).byteLength);
  });

  it("attributes a deadline reached while the handler is running", async () => {
    const failure = await withBoundedJsonRequest(post(), policy(10), (_payload, signal) =>
      stallUntilAborted(signal),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TestBoundaryError);
    expect((failure as TestBoundaryError).reason).toBe("timed-out");
  });

  it("lets a caller disconnect propagate rather than answering it", async () => {
    // Nobody is waiting for this response. The route contract is that a
    // disconnect is the one case that throws instead of producing an envelope,
    // so translating it here would only manufacture a reply for a closed socket.
    const caller = new AbortController();
    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      handlerStarted = resolve;
    });
    const failure = withBoundedJsonRequest(post(caller.signal), policy(10_000), (_payload, signal) => {
      handlerStarted();
      return stallUntilAborted(signal);
    }).catch((error: unknown) => error);

    // Abort only once the body is read and the handler owns the boundary;
    // aborting earlier exercises the body-read path, which already attributes
    // itself.
    await started;
    caller.abort();

    expect(await failure).toBeInstanceOf(DOMException);
    expect((await failure) as DOMException).toMatchObject({ name: "AbortError" });
  });

  it("leaves a handler's own failure untranslated", async () => {
    const own = new Error("adjudicator defect");
    const failure = await withBoundedJsonRequest(post(), policy(10_000), () =>
      Promise.reject(own),
    ).catch((error: unknown) => error);

    expect(failure).toBe(own);
  });

  it("leaves an abort the boundary did not raise untranslated", async () => {
    const own = new DOMException("Aborted", "AbortError");
    const failure = await withBoundedJsonRequest(post(), policy(10_000), () =>
      Promise.reject(own),
    ).catch((error: unknown) => error);

    expect(failure).toBe(own);
  });
});
