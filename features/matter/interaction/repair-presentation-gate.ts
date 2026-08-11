export const MIN_BASELINE_VISIBLE_MS = 650;

type Scheduler = Readonly<{
  requestFrame: (callback: () => void) => unknown;
  cancelFrame: (handle: unknown) => void;
  setTimer: (callback: () => void, milliseconds: number) => unknown;
  clearTimer: (handle: unknown) => void;
}>;

/**
 * Lets the admitted baseline cross two paint opportunities and remain visible
 * for a short perceptual floor. Model latency may exceed this floor; it never
 * extends or shortens the durable repair lease.
 */
export function afterBaselineVisible(
  callback: () => void,
  scheduler: Scheduler = BROWSER_SCHEDULER,
): () => void {
  let cancelled = false;
  let fired = false;
  let paintReady = false;
  let timeReady = false;
  let secondFrame: unknown;
  const finish = () => {
    if (cancelled || fired || !paintReady || !timeReady) return;
    fired = true;
    callback();
  };
  const firstFrame = scheduler.requestFrame(() => {
    secondFrame = scheduler.requestFrame(() => {
      paintReady = true;
      finish();
    });
  });
  const timer = scheduler.setTimer(() => {
    timeReady = true;
    finish();
  }, MIN_BASELINE_VISIBLE_MS);

  return () => {
    if (cancelled) return;
    cancelled = true;
    scheduler.cancelFrame(firstFrame);
    if (secondFrame !== undefined) scheduler.cancelFrame(secondFrame);
    scheduler.clearTimer(timer);
  };
}

const BROWSER_SCHEDULER: Scheduler = Object.freeze({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle as number),
  setTimer: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});
