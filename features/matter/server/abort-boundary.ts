/**
 * Cancellation is advisory. A provider transport, a DNS lookup, a request
 * stream, or an injected adapter may ignore an AbortSignal and never settle,
 * so every server boundary that must answer on a deadline races its work
 * against this promise instead of trusting the work to observe the signal.
 *
 * This owns only that race operand and its listener lifecycle. The caller
 * still owns the work, its cleanup, and how an interruption is reported.
 */
export type AbortBoundary = Readonly<{
  /** Rejects once the signal aborts, immediately if it already has; never resolves. */
  promise: Promise<never>;
  /** Removes the abort listener. Idempotent; call it on every exit path. */
  dispose: () => void;
}>;

export function rejectOnAbort(
  signal: AbortSignal,
  interruption: () => unknown = abortError,
): AbortBoundary {
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  // The work can win the race, or a caller can give up before racing at all.
  // Observe the rejection here so a later or unraced abort is never reported
  // as an unhandled rejection; `Promise.race` still receives it.
  promise.catch(() => undefined);
  const reject = () => rejectPromise(interruption());
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return Object.freeze({
    promise,
    dispose: () => signal.removeEventListener("abort", reject),
  });
}

/** The interruption every boundary uses unless it owns a stabler error. */
export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}
