import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookSpies = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useLayoutEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") hookSpies.cleanups.push(cleanup);
    },
    useRef: <Value,>(value: Value) => ({ current: value }),
  };
});

import type { OutcomeEntry } from "./outcome-line";
import { useOutcomeAcknowledgement } from "./use-outcome-line";

const SHOWN: OutcomeEntry = Object.freeze({ owner: "rewrite", reason: "unavailable", id: 7 });

function pointerDown(timeStamp: number): Event {
  const event = new Event("pointerdown");
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function keyDown(key: string, timeStamp: number, repeat = false): Event {
  const event = new Event("keydown");
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return Object.assign(event, { key, repeat });
}

beforeEach(() => {
  hookSpies.cleanups.length = 0;
  vi.stubGlobal("window", new EventTarget());
  vi.spyOn(performance, "now").mockReturnValue(1_000);
});

afterEach(() => {
  for (const cleanup of hookSpies.cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("outcome acknowledgement", () => {
  it("retires the shown outcome at the person's next press", () => {
    const acknowledge = vi.fn();
    useOutcomeAcknowledgement(SHOWN, acknowledge);
    window.dispatchEvent(pointerDown(1_200));
    expect(acknowledge).toHaveBeenCalledWith(7);
  });

  it("never lets the action that produced the outcome acknowledge it", () => {
    const acknowledge = vi.fn();
    useOutcomeAcknowledgement(SHOWN, acknowledge);
    // The same press or key that reported the outcome began before it showed.
    window.dispatchEvent(pointerDown(900));
    window.dispatchEvent(keyDown("Enter", 1_000));
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat and a lone modifier, but not a real key", () => {
    const acknowledge = vi.fn();
    useOutcomeAcknowledgement(SHOWN, acknowledge);
    window.dispatchEvent(keyDown("Shift", 1_100));
    window.dispatchEvent(keyDown("a", 1_100, true));
    expect(acknowledge).not.toHaveBeenCalled();
    window.dispatchEvent(keyDown("Tab", 1_200));
    expect(acknowledge).toHaveBeenCalledWith(7);
  });

  it("listens only while an outcome is shown", () => {
    const acknowledge = vi.fn();
    useOutcomeAcknowledgement(null, acknowledge);
    window.dispatchEvent(pointerDown(1_200));
    expect(acknowledge).not.toHaveBeenCalled();

    useOutcomeAcknowledgement(SHOWN, acknowledge);
    for (const cleanup of hookSpies.cleanups.splice(0)) cleanup();
    window.dispatchEvent(pointerDown(1_300));
    expect(acknowledge).not.toHaveBeenCalled();
  });
});
