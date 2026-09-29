import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHUNK_RECOVERY } from "../interaction/chunk-recovery";
import { createTestRecoveryHost } from "../interaction/chunk-recovery-test-host";
import { createComponentCell, preloadableComponent } from "./preloadable-component";

function Loaded(props: Readonly<{ label: string }>) {
  return createElement("span", null, props.label);
}

describe("preloadable component", () => {
  it("fetches once however many preloads and mounts ask for it", async () => {
    const load = vi.fn(() => Promise.resolve(Loaded));
    const cell = createComponentCell(load);
    const listener = vi.fn();
    cell.subscribe(listener);

    expect(cell.read()).toBeNull();
    await Promise.all([cell.preload(), cell.preload()]);
    await cell.preload();

    expect(load).toHaveBeenCalledOnce();
    expect(cell.read()).toBe(Loaded);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("lets a later preload retry a failed fetch", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Loaded);
    const cell = createComponentCell(load);

    await expect(cell.preload()).rejects.toThrow("offline");
    expect(cell.read()).toBeNull();
    await expect(cell.preload()).resolves.toBe(Loaded);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying a failed chunk while a mounted instance waits for it", async () => {
    const clock = createTestRecoveryHost();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValueOnce(Loaded);
    const cell = createComponentCell(load, clock.host);
    const listener = vi.fn();
    const unsubscribe = cell.subscribe(listener);

    await expect(cell.preload()).rejects.toThrow("offline");
    // No remount, preload, or gesture: the backoff brings the next attempt.
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    // The network returning tries again at once rather than after 2 s.
    clock.signal();
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(cell.read()).toBe(Loaded);
    expect(listener).toHaveBeenCalledOnce();
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
    unsubscribe();
  });

  it("stops retrying once nothing mounted waits for the chunk", async () => {
    const clock = createTestRecoveryHost();
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    const cell = createComponentCell(load, clock.host);

    // A failed preload with nothing mounted leaves retry to the next mount.
    await expect(cell.preload()).rejects.toThrow("offline");
    expect(clock.timers).toBe(0);

    const unsubscribe = cell.subscribe(() => undefined);
    await expect(cell.preload()).rejects.toThrow("offline");
    expect(clock.timers).toBe(1);
    unsubscribe();
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
    clock.advance(CHUNK_RECOVERY.maxDelayMs);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("renders nothing on the server, even once loaded, so hydration cannot mismatch", async () => {
    const Preloadable = preloadableComponent(() => Promise.resolve(Loaded));
    expect(renderToStaticMarkup(createElement(Preloadable, { label: "ready" }))).toBe("");

    await Preloadable.preload();
    expect(renderToStaticMarkup(createElement(Preloadable, { label: "ready" }))).toBe("");
  });
});

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}
