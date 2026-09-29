import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import { holdsUnsavedPersonMaterial } from "./persistence-status";
import { createUnloadGuard, SLOW_SAVE_MS, type UnloadGuardEnvironment, type UnloadRisk } from "./unload-guard";
import { relocalizeSeededSession } from "../material/seeded-session-localization";
import { createMatterStore } from "../store/matter-store";
import type { TreeHistory } from "../tree/history";
import type { ThoughtTree } from "../tree/model";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const SAVED: UnloadRisk = Object.freeze({ phase: "saved", unsavedPersonMaterial: false });
const SAVING: UnloadRisk = Object.freeze({ phase: "saving", unsavedPersonMaterial: true });
const REFUSED: UnloadRisk = Object.freeze({ phase: "error", unsavedPersonMaterial: true });
const LOADING: UnloadRisk = Object.freeze({ phase: "loading", unsavedPersonMaterial: true });

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

  it("never prompts when nothing the person made is unsaved, whatever storage does", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    for (const risk of [LOADING, REFUSED, SAVING]) {
      guard.update({ ...risk, unsavedPersonMaterial: false });
      vi.advanceTimersByTime(SLOW_SAVE_MS * 2);
      expect(guard.isArmed()).toBe(false);
    }
    expect(env.addEventListener).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("guards an edit made while stored material is loading", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    guard.update(LOADING);
    expect(guard.isArmed()).toBe(true);
    expect(listeners.size).toBe(1);
    guard.update(SAVED);
    expect(guard.isArmed()).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it("guards material storage refused at once, and releases the page when it is saved", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);

    guard.update(REFUSED);
    expect(guard.isArmed()).toBe(true);
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown } as unknown as BeforeUnloadEvent;
    for (const listener of listeners) listener(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(true);

    guard.update(SAVED);
    expect(listeners.size).toBe(0);
    expect(env.removeEventListener).toHaveBeenCalledOnce();
  });

  it("guards a save only once it has been in flight longer than a moment", () => {
    const { env } = environment();
    const guard = createUnloadGuard(env);

    guard.update(SAVING);
    vi.advanceTimersByTime(SLOW_SAVE_MS - 1);
    expect(guard.isArmed()).toBe(false);
    // An ordinary quick save never touches the listener, so the page stays
    // eligible for the back-forward cache.
    guard.update(SAVED);
    vi.advanceTimersByTime(SLOW_SAVE_MS);
    expect(env.addEventListener).not.toHaveBeenCalled();

    guard.update(SAVING);
    vi.advanceTimersByTime(SLOW_SAVE_MS);
    expect(guard.isArmed()).toBe(true);
    // A later update in the same slow save keeps it armed rather than restarting.
    guard.update({ ...SAVING });
    expect(guard.isArmed()).toBe(true);
    guard.update(SAVED);
    expect(guard.isArmed()).toBe(false);
  });

  it("removes its listener and timer when disposed", () => {
    const { env, listeners } = environment();
    const guard = createUnloadGuard(env);
    guard.update(REFUSED);
    guard.dispose();
    expect(listeners.size).toBe(0);

    guard.update(SAVING);
    guard.dispose();
    vi.advanceTimersByTime(SLOW_SAVE_MS * 2);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves an untouched seed relocalized in a browser that refuses storage unguarded, and guards the person's change", async () => {
    vi.mocked(openDB).mockImplementation(async () => {
      throw new DOMException("Storage is blocked in this window", "SecurityError");
    });
    const store = createMatterStore();
    const controller = createPersistenceController(createIndexedDbDocumentRepository());
    const guard = createUnloadGuard(environment().env);
    const begun = store.getState();
    await expect(controller.start(begun.tree as ThoughtTree, begun.history as TreeHistory)).resolves.toBeNull();
    // As the persistence hook does once the first load is reconciled.
    const publish = () => {
      const state = store.getState();
      const authored = state.tree !== state.untouchedTree;
      controller.publish(state.tree as ThoughtTree, state.history as TreeHistory, authored);
      const status = controller.getStatus();
      guard.update({
        phase: status.phase,
        unsavedPersonMaterial: holdsUnsavedPersonMaterial(status, true, authored),
      });
    };

    publish();
    // The seed was built in Chinese; every other language rewrites it.
    expect(store.getState().localizeSeededMaterial("de-DE", relocalizeSeededSession))
      .toMatchObject({ status: "localized" });
    publish();
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_UNAVAILABLE", unsaved: false });
    expect(guard.isArmed()).toBe(false);

    const rootId = store.getState().tree.rootId!;
    store.getState().extendMaterial(rootId, { nodeId: "thought_mine", createdAt: "2026-09-29T00:00:00.000Z" });
    publish();
    expect(controller.getStatus()).toMatchObject({ unsaved: true });
    expect(guard.isArmed()).toBe(true);
    guard.dispose();
    controller.dispose();
  });
});
