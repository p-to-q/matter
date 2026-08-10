import { describe, expect, it } from "vitest";
import { createStretchPreviewFrame } from "./stretch-preview-frame";
import type { StretchPreviewSignal } from "./use-stretch";

describe("stretch preview frame", () => {
  it("keeps only the newest hot pointer signal for one animation frame", () => {
    const callbacks: FrameRequestCallback[] = [];
    const published: number[] = [];
    const frame = createStretchPreviewFrame<StretchPreviewSignal>({
      request: (next) => {
        callbacks.push(next);
        return 3;
      },
      cancel: () => undefined,
    }, (signal) => published.push(signal.amount));

    frame.schedule({ amount: 0.1, handle: "bottom", dragging: true });
    frame.schedule({ amount: 0.6, handle: "bottom", dragging: true });
    frame.schedule({ amount: 0.8, handle: "bottom", dragging: true });

    expect(published).toEqual([]);
    const callback = callbacks.at(0);
    if (callback === undefined) throw new Error("animation frame was not requested");
    callback(0);
    expect(published).toEqual([0.8]);
  });

  it("flushes settled values immediately and cancels a queued hot redraw", () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    const published: number[] = [];
    const frame = createStretchPreviewFrame<StretchPreviewSignal>({
      request: (next) => {
        callbacks.push(next);
        return 8;
      },
      cancel: (handle) => cancelled.push(handle),
    }, (signal) => published.push(signal.amount));

    frame.schedule({ amount: 0.4, handle: "top", dragging: true });
    frame.flush({ amount: 0.5, handle: "top", dragging: false });

    expect(cancelled).toEqual([8]);
    expect(published).toEqual([0.5]);
    const callback = callbacks.at(0);
    if (callback === undefined) throw new Error("animation frame was not requested");
    callback(0);
    expect(published).toEqual([0.5]);
  });
});
