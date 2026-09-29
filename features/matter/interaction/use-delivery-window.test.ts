import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeDeliveryWindow } from "./use-delivery-window";

type PageDocument = EventTarget & { visibilityState: DocumentVisibilityState };

let pageWindow: EventTarget;
let pageDocument: PageDocument;

beforeEach(() => {
  pageWindow = new EventTarget();
  pageDocument = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  vi.stubGlobal("window", pageWindow);
  vi.stubGlobal("document", pageDocument);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function pointer(type: string, pointerId: number, buttons = 0): Event {
  return Object.assign(new Event(type), { pointerId, buttons });
}

function subscribe(available = { current: true }) {
  const onChange = vi.fn<(open: boolean) => void>();
  const onSuspend = vi.fn();
  const onExit = vi.fn();
  const subscription = subscribeDeliveryWindow({
    isAvailable: () => available.current,
    onChange,
    onSuspend,
    onExit,
  });
  return { available, onChange, onExit, onSuspend, subscription };
}

describe("subscribeDeliveryWindow", () => {
  it("opens only while visible, available, and pointer-idle", () => {
    const h = subscribe();
    expect(h.onChange).toHaveBeenLastCalledWith(true);

    pageWindow.dispatchEvent(pointer("pointerdown", 3, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    pageWindow.dispatchEvent(pointer("pointerdown", 4, 1));
    pageWindow.dispatchEvent(pointer("pointerup", 3));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    pageWindow.dispatchEvent(pointer("pointercancel", 4));
    expect(h.onChange).toHaveBeenLastCalledWith(true);

    h.available.current = false;
    h.subscription.refresh();
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    h.subscription.unsubscribe();
  });

  it("re-evaluates on every release so a caller may retry delivery", () => {
    const h = subscribe();
    h.onChange.mockClear();
    pageWindow.dispatchEvent(pointer("pointerup", 9));
    pageWindow.dispatchEvent(pointer("pointerup", 9));
    expect(h.onChange.mock.calls).toEqual([[true], [true]]);
    h.subscription.unsubscribe();
  });

  it("recovers a pointer released outside the window on its next buttonless move", () => {
    const h = subscribe();
    pageWindow.dispatchEvent(pointer("pointerdown", 1, 1));
    pageWindow.dispatchEvent(pointer("pointermove", 1, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    // A different pointer hovering does not speak for the pressed one.
    pageWindow.dispatchEvent(pointer("pointermove", 2, 0));
    expect(h.onChange).toHaveBeenLastCalledWith(false);

    pageWindow.dispatchEvent(pointer("pointermove", 1, 0));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    h.subscription.unsubscribe();
  });

  it("recovers pointers whose release went to a permission sheet or another window", () => {
    const h = subscribe();
    pageWindow.dispatchEvent(pointer("pointerdown", 1, 1));
    pageWindow.dispatchEvent(pointer("pointerdown", 2, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);

    pageWindow.dispatchEvent(new Event("blur"));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    h.subscription.unsubscribe();
  });

  it("releases a pointer whose capture was lost with no button held", () => {
    const h = subscribe();
    pageWindow.dispatchEvent(pointer("pointerdown", 5, 1));
    pageWindow.dispatchEvent(pointer("lostpointercapture", 5));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    h.subscription.unsubscribe();
  });

  it("keeps the window closed when canvas code releases capture mid-press", () => {
    const h = subscribe();
    pageWindow.dispatchEvent(pointer("pointerdown", 1, 1));
    // e.g. a drag owner cancelling itself while the person still presses.
    pageWindow.dispatchEvent(pointer("lostpointercapture", 1, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    pageWindow.dispatchEvent(pointer("pointermove", 1, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    pageWindow.dispatchEvent(pointer("pointerup", 1));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    h.subscription.unsubscribe();
  });

  it("closes again for a pointer seen pressed only by its move", () => {
    const h = subscribe();
    // Released on blur while the person kept pressing, or pressed before
    // this owner subscribed: its next pressed move is the only evidence.
    pageWindow.dispatchEvent(pointer("pointerdown", 2, 1));
    pageWindow.dispatchEvent(new Event("blur"));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    pageWindow.dispatchEvent(pointer("pointermove", 2, 1));
    expect(h.onChange).toHaveBeenLastCalledWith(false);
    h.onChange.mockClear();
    pageWindow.dispatchEvent(pointer("pointermove", 2, 1));
    expect(h.onChange).not.toHaveBeenCalled();
    pageWindow.dispatchEvent(pointer("pointerup", 2));
    expect(h.onChange).toHaveBeenLastCalledWith(true);
    h.subscription.unsubscribe();
  });

  it("closes and releases pointers while hidden, reopens on return, and forwards page exit", () => {
    const h = subscribe();
    pageWindow.dispatchEvent(pointer("pointerdown", 1, 1));
    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(h.onSuspend).toHaveBeenCalledTimes(1);
    expect(h.onChange).toHaveBeenLastCalledWith(false);

    pageDocument.visibilityState = "visible";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    // The pointer pressed before suspension cannot hold the window closed.
    expect(h.onChange).toHaveBeenLastCalledWith(true);

    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(h.onExit).toHaveBeenCalledTimes(1);
    h.subscription.unsubscribe();
  });

  it("removes every listener on unsubscribe", () => {
    const h = subscribe();
    h.subscription.unsubscribe();
    h.onChange.mockClear();
    pageWindow.dispatchEvent(pointer("pointerdown", 1, 1));
    pageWindow.dispatchEvent(pointer("pointerup", 1));
    pageWindow.dispatchEvent(new Event("blur"));
    pageWindow.dispatchEvent(new Event("pagehide"));
    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    h.subscription.refresh();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.onSuspend).not.toHaveBeenCalled();
    expect(h.onExit).not.toHaveBeenCalled();
  });
});
