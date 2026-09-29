import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sameInquiryContextOwner,
  subscribeInquiryUnload,
  type InquiryContextOwner,
} from "./inquiry-context-lifecycle";

function owner(overrides: Partial<InquiryContextOwner> = {}): InquiryContextOwner {
  return {
    treeId: "tree-1",
    documentEpoch: 7,
    ...overrides,
  };
}

function pageTransition(type: "pagehide" | "pageshow", persisted: boolean): Event {
  return Object.assign(new Event(type), { persisted });
}

describe("sameInquiryContextOwner", () => {
  it("keeps one document instance stable across material and selection changes", () => {
    expect(sameInquiryContextOwner(owner(), owner())).toBe(true);
  });

  it("rejects a different tree or a replacement instance with identical serialized material", () => {
    expect(sameInquiryContextOwner(owner(), owner({ treeId: "tree-2" }))).toBe(false);
    expect(sameInquiryContextOwner(owner(), owner({ documentEpoch: 8 }))).toBe(false);
  });
});

describe("subscribeInquiryUnload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a submitted question across a back-forward-cache hide and its return", () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const onUnload = vi.fn();
    const unsubscribe = subscribeInquiryUnload(onUnload);

    page.dispatchEvent(pageTransition("pagehide", true));
    page.dispatchEvent(pageTransition("pageshow", true));
    expect(onUnload).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("retires the owner on a real unload, once per unload", () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const onUnload = vi.fn();
    const unsubscribe = subscribeInquiryUnload(onUnload);

    page.dispatchEvent(pageTransition("pagehide", true));
    page.dispatchEvent(pageTransition("pagehide", false));
    expect(onUnload).toHaveBeenCalledTimes(1);
    // A pagehide without the flag is a real unload.
    page.dispatchEvent(new Event("pagehide"));
    expect(onUnload).toHaveBeenCalledTimes(2);

    unsubscribe();
    page.dispatchEvent(pageTransition("pagehide", false));
    expect(onUnload).toHaveBeenCalledTimes(2);
  });
});
