import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PEN_TAKEOVER_WINDOW_MS } from "../runtime/canvas-pointer-arbitration";
import { deferUntilTouchCommits } from "./touch-commitment";

const PALM = 7;
const ORIGIN = { pointerId: PALM, clientX: 100, clientY: 100 };

let target: EventTarget;

function dispatch(type: string, init: Record<string, unknown>) {
  target.dispatchEvent(Object.assign(new Event(type), init));
}

describe("deferUntilTouchCommits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
    vi.stubGlobal("window", Object.assign(target, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps a palm's effects when a pen lands inside the takeover window", () => {
    const commit = vi.fn();
    deferUntilTouchCommits(ORIGIN, commit);
    dispatch("pointermove", { pointerId: PALM, clientX: 103, clientY: 102 });
    dispatch("pointerdown", { pointerId: 1, pointerType: "pen" });
    vi.advanceTimersByTime(PEN_TAKEOVER_WINDOW_MS * 2);
    dispatch("pointerup", { pointerId: PALM });
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits once when the touch travels beyond the slop", () => {
    const commit = vi.fn();
    deferUntilTouchCommits(ORIGIN, commit);
    dispatch("pointermove", { pointerId: PALM, clientX: 120, clientY: 100 });
    dispatch("pointerup", { pointerId: PALM });
    vi.advanceTimersByTime(PEN_TAKEOVER_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits a tap, and a touch that outlives the window", () => {
    const tap = vi.fn();
    deferUntilTouchCommits(ORIGIN, tap);
    dispatch("pointerup", { pointerId: PALM });
    expect(tap).toHaveBeenCalledTimes(1);

    const hold = vi.fn();
    deferUntilTouchCommits(ORIGIN, hold);
    vi.advanceTimersByTime(PEN_TAKEOVER_WINDOW_MS - 1);
    expect(hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hold).toHaveBeenCalledTimes(1);
  });

  it("discards on a browser cancel or an explicit discard, and ignores other pointers", () => {
    const cancelled = vi.fn();
    deferUntilTouchCommits(ORIGIN, cancelled);
    dispatch("pointerup", { pointerId: 99 });
    dispatch("pointercancel", { pointerId: PALM });
    vi.advanceTimersByTime(PEN_TAKEOVER_WINDOW_MS);
    expect(cancelled).not.toHaveBeenCalled();

    const discarded = vi.fn();
    const discard = deferUntilTouchCommits(ORIGIN, discarded);
    discard();
    discard();
    dispatch("pointerup", { pointerId: PALM });
    vi.advanceTimersByTime(PEN_TAKEOVER_WINDOW_MS);
    expect(discarded).not.toHaveBeenCalled();
  });
});
