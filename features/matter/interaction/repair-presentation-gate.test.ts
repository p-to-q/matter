import { describe, expect, it, vi } from "vitest";
import {
  MIN_BASELINE_VISIBLE_MS,
  afterBaselineVisible,
} from "./repair-presentation-gate";

function harness() {
  const frames: Array<() => void> = [];
  const timers: Array<{ callback: () => void; milliseconds: number }> = [];
  const cancelledFrames = new Set<unknown>();
  const cancelledTimers = new Set<unknown>();
  const scheduler = {
    requestFrame: (callback: () => void) => {
      frames.push(callback);
      return frames.length - 1;
    },
    cancelFrame: (handle: unknown) => { cancelledFrames.add(handle); },
    setTimer: (callback: () => void, milliseconds: number) => {
      timers.push({ callback, milliseconds });
      return timers.length - 1;
    },
    clearTimer: (handle: unknown) => { cancelledTimers.add(handle); },
  };
  return { cancelledFrames, cancelledTimers, frames, scheduler, timers };
}

describe("afterBaselineVisible", () => {
  it("waits for both two paint opportunities and the perceptual floor", () => {
    const h = harness();
    const settled = vi.fn();
    afterBaselineVisible(settled, h.scheduler);

    expect(h.timers[0]?.milliseconds).toBe(MIN_BASELINE_VISIBLE_MS);
    h.frames[0]?.();
    h.frames[1]?.();
    expect(settled).not.toHaveBeenCalled();
    h.timers[0]?.callback();
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("still waits for paint when time becomes ready first, and cancels idempotently", () => {
    const h = harness();
    const settled = vi.fn();
    const cancel = afterBaselineVisible(settled, h.scheduler);

    h.timers[0]?.callback();
    h.frames[0]?.();
    expect(settled).not.toHaveBeenCalled();
    h.frames[1]?.();
    expect(settled).toHaveBeenCalledTimes(1);
    cancel();
    cancel();
    expect(h.cancelledTimers.size).toBe(1);
  });

  it("makes already-queued paint and timer callbacks inert after cancellation", () => {
    const h = harness();
    const settled = vi.fn();
    const cancel = afterBaselineVisible(settled, h.scheduler);

    h.frames[0]?.();
    cancel();
    h.frames[1]?.();
    h.timers[0]?.callback();

    expect(settled).not.toHaveBeenCalled();
    expect(h.cancelledFrames).toEqual(new Set([0, 1]));
    expect(h.cancelledTimers).toEqual(new Set([0]));
  });
});
