import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribePageExit, subscribePageSuspension } from "./page-suspension";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribePageSuspension", () => {
  it("coalesces visibility and pagehide, rearms on pageshow, and removes listeners", () => {
    const pageWindow = new EventTarget();
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "visible";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    const suspend = vi.fn();
    const resume = vi.fn();

    const unsubscribe = subscribePageSuspension(suspend, resume);
    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(suspend).toHaveBeenCalledTimes(1);

    pageWindow.dispatchEvent(new Event("pageshow"));
    expect(resume).not.toHaveBeenCalled();
    pageDocument.visibilityState = "visible";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(resume).toHaveBeenCalledTimes(1);
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(suspend).toHaveBeenCalledTimes(2);

    unsubscribe();
    pageWindow.dispatchEvent(new Event("pagehide"));
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(suspend).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("ignores visible transitions and releases work when visibility becomes hidden", () => {
    const pageWindow = new EventTarget();
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "visible";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    const suspend = vi.fn();

    const unsubscribe = subscribePageSuspension(suspend);
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(suspend).not.toHaveBeenCalled();

    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(suspend).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("suspends an initially hidden subscription once and allows a later subscription to rearm", () => {
    const pageWindow = new EventTarget();
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "hidden";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    const firstSuspend = vi.fn();
    const firstResume = vi.fn();

    const unsubscribeFirst = subscribePageSuspension(
      firstSuspend,
      firstResume,
    );
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(firstSuspend).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    pageDocument.visibilityState = "visible";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    pageWindow.dispatchEvent(new Event("pageshow"));
    expect(firstResume).not.toHaveBeenCalled();

    const secondSuspend = vi.fn();
    const secondResume = vi.fn();
    const unsubscribeSecond = subscribePageSuspension(
      secondSuspend,
      secondResume,
    );
    expect(secondResume).not.toHaveBeenCalled();
    pageDocument.visibilityState = "hidden";
    pageWindow.dispatchEvent(new Event("pagehide"));
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(secondSuspend).toHaveBeenCalledTimes(1);

    pageDocument.visibilityState = "visible";
    pageWindow.dispatchEvent(new Event("pageshow"));
    expect(secondResume).toHaveBeenCalledTimes(1);
    unsubscribeSecond();
  });
});

describe("subscribePageExit", () => {
  it("ignores ordinary tab visibility but releases on pagehide", () => {
    const pageWindow = new EventTarget();
    const pageDocument = new EventTarget();
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    const exit = vi.fn();
    const unsubscribe = subscribePageExit(exit);

    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(exit).not.toHaveBeenCalled();
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(exit).toHaveBeenCalledTimes(1);

    unsubscribe();
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
