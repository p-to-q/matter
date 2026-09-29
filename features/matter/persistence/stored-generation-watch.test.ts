import { describe, expect, it, vi } from "vitest";
import { STORAGE_SCHEMA_VERSION } from "./document-repository";
import type { DocumentGeneration } from "./document-generation-channel";
import type { StoredGenerationDecision } from "./persistence-controller";
import {
  createStoredGenerationWatch,
  type StoredGenerationWatchPort,
  type StoredRefreshOutcome,
} from "./stored-generation-watch";

const NEWER: DocumentGeneration = Object.freeze({
  treeId: "tree",
  writeGeneration: 3,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION,
});

function fakeWindow() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    listeners,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener as EventListener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
      listeners.get(type)?.delete(listener as EventListener);
    }),
    dispatch(type: string, event: Record<string, unknown> = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event as unknown as Event);
    },
    count() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    },
  };
}

function fakeDocument(visibilityState: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  return {
    visibilityState,
    listeners,
    addEventListener: (_type: "visibilitychange", listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "visibilitychange", listener: () => void) => {
      listeners.delete(listener);
    },
    setVisibility(next: DocumentVisibilityState) {
      this.visibilityState = next;
      for (const listener of listeners) listener();
    },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function harness(options: Readonly<{
  visibility?: DocumentVisibilityState;
  ready?: () => boolean;
  observe?: (generation: DocumentGeneration) => StoredGenerationDecision;
  check?: () => Promise<StoredGenerationDecision>;
  refresh?: StoredGenerationWatchPort["refresh"];
}> = {}) {
  const view = fakeWindow();
  const page = fakeDocument(options.visibility);
  const refresh = vi.fn(options.refresh ?? (async (): Promise<StoredRefreshOutcome> => "applied"));
  const check = vi.fn(options.check ?? (async (): Promise<StoredGenerationDecision> => "refresh"));
  const observe = vi.fn(options.observe ?? ((): StoredGenerationDecision => "refresh"));
  const watch = createStoredGenerationWatch({ window: view, document: page }, {
    ready: options.ready ?? (() => true),
    observe,
    check,
    refresh,
  });
  return { view, page, refresh, check, observe, watch };
}

async function settle() {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe("stored generation watch", () => {
  it("applies a newer row at once when nothing is in progress", async () => {
    const { watch, refresh } = harness();
    watch.setMaterialIdle(true);
    watch.receive(NEWER);
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps a submitted request, draft, or open editor: a hidden tab waits for the same idleness", async () => {
    const { watch, refresh, page } = harness({ visibility: "hidden" });
    watch.setMaterialIdle(false);
    watch.receive(NEWER);
    page.setVisibility("hidden");
    await settle();
    expect(refresh).not.toHaveBeenCalled();

    watch.setMaterialIdle(true);
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("asks again before hydrating, and waits once more when work began during the read", async () => {
    let idle = true;
    const refresh = vi.fn(async (stillIdle: () => boolean): Promise<StoredRefreshOutcome> => {
      idle = false;
      watch.setMaterialIdle(idle);
      return stillIdle() ? "applied" : "deferred";
    });
    const { watch } = harness({ refresh });
    watch.setMaterialIdle(idle);
    watch.receive(NEWER);
    await settle();
    expect(refresh).toHaveBeenCalledOnce();

    idle = true;
    refresh.mockImplementation(async () => "applied");
    watch.setMaterialIdle(idle);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never drops a broadcast that arrives while a refresh is reading", async () => {
    const first = deferred<StoredRefreshOutcome>();
    const refresh = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => "applied" as const);
    const { watch } = harness({ refresh });
    watch.setMaterialIdle(true);
    watch.receive(NEWER);
    await settle();
    watch.receive({ ...NEWER, writeGeneration: 4 });
    await settle();
    expect(refresh).toHaveBeenCalledOnce();

    first.resolve("applied");
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("waits for a held pointer in a visible tab and applies on its release", async () => {
    const { watch, refresh, view } = harness();
    watch.setMaterialIdle(true);
    view.dispatch("pointerdown", { pointerId: 1, buttons: 1 });
    watch.receive(NEWER);
    await settle();
    expect(refresh).not.toHaveBeenCalled();

    view.dispatch("pointerup", { pointerId: 1, buttons: 0 });
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["window blur", "blur", {}],
    ["a lost capture with no button held", "lostpointercapture", { pointerId: 1, buttons: 0 }],
    ["a move with no button held", "pointermove", { pointerId: 1, buttons: 0 }],
  ] as const)("ends a pointer whose release never arrived on %s", async (_name, type, event) => {
    const { watch, refresh, view } = harness();
    watch.setMaterialIdle(true);
    view.dispatch("pointerdown", { pointerId: 1, buttons: 1 });
    watch.receive(NEWER);
    view.dispatch("lostpointercapture", { pointerId: 1, buttons: 1 });
    view.dispatch("pointermove", { pointerId: 1, buttons: 1 });
    await settle();
    expect(refresh).not.toHaveBeenCalled();

    view.dispatch(type, event);
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("lets a hidden tab apply regardless of a pointer it can no longer see released", async () => {
    const { watch, refresh, view, page } = harness();
    watch.setMaterialIdle(true);
    view.dispatch("pointerdown", { pointerId: 1, buttons: 1 });
    watch.receive(NEWER);
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    page.setVisibility("hidden");
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reads storage when the page becomes visible or returns from the back-forward cache", async () => {
    const { watch, check, page, view } = harness({ visibility: "hidden" });
    watch.setMaterialIdle(true);
    page.setVisibility("visible");
    view.dispatch("pageshow", { persisted: false });
    await settle();
    expect(check).toHaveBeenCalledOnce();
    view.dispatch("pageshow", { persisted: true });
    await settle();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("ignores signals until the first load has been reconciled", async () => {
    let ready = false;
    const { watch, observe, check, page, refresh } = harness({ ready: () => ready });
    watch.setMaterialIdle(true);
    watch.receive(NEWER);
    page.setVisibility("visible");
    await settle();
    expect(observe).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    ready = true;
    watch.receive(NEWER);
    await settle();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does nothing for a decision other than refresh", async () => {
    const { watch, refresh } = harness({ observe: () => "conflict" });
    watch.setMaterialIdle(true);
    watch.receive(NEWER);
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes every listener and refreshes nothing once disposed", async () => {
    const { watch, refresh, view, page } = harness();
    expect(view.count()).toBeGreaterThan(0);
    watch.dispose();
    expect(view.count()).toBe(0);
    expect(page.listeners.size).toBe(0);
    watch.setMaterialIdle(true);
    watch.receive(NEWER);
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });
});
