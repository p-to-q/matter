export type RequestDeadline = Readonly<{
  signal: AbortSignal;
  settlement: Promise<never>;
  didTimeout: () => boolean;
  dispose: () => void;
}>;

/**
 * One hard browser request boundary.
 *
 * AbortSignal still performs best-effort transport and body cleanup, while the
 * rejected settlement guarantees that an injected or broken transport cannot
 * outlive the interaction merely because it ignores that signal.
 */
export function createRequestDeadline(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
): RequestDeadline {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("The request deadline must be positive and finite.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let rejectSettlement!: (reason: unknown) => void;
  const settlement = new Promise<never>((_resolve, reject) => {
    rejectSettlement = reject;
  });
  settlement.catch(() => undefined);

  const abortFromParent = () => {
    const reason = parent?.reason ?? new DOMException("Aborted", "AbortError");
    controller.abort(reason);
    rejectSettlement(reason);
  };
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException(timeoutMessage, "TimeoutError");
    controller.abort(reason);
    rejectSettlement(reason);
  }, timeoutMs);

  return Object.freeze({
    signal: controller.signal,
    settlement,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortFromParent);
    },
  });
}
