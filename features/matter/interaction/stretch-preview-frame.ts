export type AnimationFramePort = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

export type StretchPreviewFrame<Signal> = Readonly<{
  schedule: (signal: Signal) => void;
  flush: (signal: Signal) => void;
  cancel: () => void;
}>;

/**
 * Owns only the frame boundary between pointer samples and visual preview.
 * Semantic stretch state still settles synchronously in the interaction
 * reducer; this queue may coalesce redraws but never drops a settled value.
 */
export function createStretchPreviewFrame<Signal>(
  port: AnimationFramePort,
  publish: (signal: Signal) => void,
): StretchPreviewFrame<Signal> {
  let frame: number | null = null;
  let pending: Signal | null = null;

  const cancel = () => {
    if (frame !== null) port.cancel(frame);
    frame = null;
    pending = null;
  };

  const flush = (signal: Signal) => {
    cancel();
    publish(signal);
  };

  const schedule = (signal: Signal) => {
    pending = signal;
    if (frame !== null) return;
    frame = port.request(() => {
      frame = null;
      const next = pending;
      pending = null;
      if (next !== null) publish(next);
    });
  };

  return Object.freeze({ schedule, flush, cancel });
}
