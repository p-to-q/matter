import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistenceStatus } from "./persistence-controller";
import { createUnloadGuard, SLOW_SAVE_MS, type UnloadGuardEnvironment } from "./unload-guard";

const SAVED: PersistenceStatus = Object.freeze({
  phase: "saved",
  persistedRevision: 3,
  dirtyRevision: null,
  errorCode: null,
  historyNotice: null,
  unsaved: false,
  upgradeBlocked: false,
  conflictOrigin: null,
});
const SAVING: PersistenceStatus = { ...SAVED, phase: "saving", dirtyRevision: 4, unsaved: true };
const REFUSED: PersistenceStatus = {
  ...SAVED,
  phase: "error",
  dirtyRevision: 4,
  errorCode: "PERSISTENCE_STORAGE_FULL",
  unsaved: true,
};
const LOADING: PersistenceStatus = { ...SAVED, phase: "loading", persistedRevision: null, unsaved: true };

function environment() {
  const listeners = new Set<(event: BeforeUnloadEvent) => void>();
  const env: UnloadGuardEnvironment = {
    addEventListener: vi.fn((_type, listener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type, listener) => {
      listeners.delete(listener);
    }),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
  return { env, listeners };
}

describe("unload guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never prompts for an untouched seed, even where storage refuses every write", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    for (const status of [LOADING, REFUSED, SAVING, { ...LOADING, upgradeBlocked: true }]) {
      guard.update({ status, materialDiverged: false });
      vi.advanceTimersByTime(SLOW_SAVE_MS * 2);
      expect(guard.isArmed()).toBe(false);
    }
    expect(env.addEventListener).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("guards an edit made while stored material is loading or an upgrade waits", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    guard.update({ status: { ...LOADING, upgradeBlocked: true }, materialDiverged: true });
    expect(guard.isArmed()).toBe(true);
    expect(listeners.size).toBe(1);
    guard.update({ status: SAVED, materialDiverged: true });
    expect(guard.isArmed()).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it("guards material storage refused at once, and releases the page when it is saved", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    guard.update({ status: REFUSED, materialDiverged: true });
    expect(guard.isArmed()).toBe(true);
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown } as unknown as BeforeUnloadEvent;
    for (const listener of listeners) listener(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(true);

    guard.update({ status: SAVED, materialDiverged: true });
    expect(listeners.size).toBe(0);
    expect(env.removeEventListener).toHaveBeenCalledOnce();
  });

  it("guards a save only once it has been in flight longer than a moment", () => {
    const { env } = environment();
    const guard = createUnloadGuard(env);

    guard.update({ status: SAVING, materialDiverged: true });
    vi.advanceTimersByTime(SLOW_SAVE_MS - 1);
    expect(guard.isArmed()).toBe(false);
    // An ordinary quick save never touches the listener, so the page stays
    // eligible for the back-forward cache.
    guard.update({ status: SAVED, materialDiverged: true });
    vi.advanceTimersByTime(SLOW_SAVE_MS);
    expect(env.addEventListener).not.toHaveBeenCalled();

    guard.update({ status: SAVING, materialDiverged: true });
    vi.advanceTimersByTime(SLOW_SAVE_MS);
    expect(guard.isArmed()).toBe(true);
    // A later update in the same slow save keeps it armed rather than restarting.
    guard.update({ status: { ...SAVING, dirtyRevision: 5 }, materialDiverged: true });
    expect(guard.isArmed()).toBe(true);
    guard.update({ status: SAVED, materialDiverged: true });
    expect(guard.isArmed()).toBe(false);
  });

  it("removes its listener and timer when disposed", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);
    guard.update({ status: REFUSED, materialDiverged: true });
    guard.dispose();
    expect(listeners.size).toBe(0);

    guard.update({ status: SAVING, materialDiverged: true });
    guard.dispose();
    vi.advanceTimersByTime(SLOW_SAVE_MS * 2);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
