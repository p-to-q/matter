import { describe, expect, it, vi } from "vitest";
import { IDLE_PRELOAD_TIMEOUT_MS, preloadNow, preloadWhenIdle } from "./idle-preload";

function idleHost() {
  const idle: Array<() => void> = [];
  return {
    idle,
    host: {
      requestIdleCallback: vi.fn((callback: () => void, options?: Readonly<{ timeout: number }>) => {
        expect(options?.timeout).toBe(IDLE_PRELOAD_TIMEOUT_MS);
        idle.push(callback);
        return idle.length;
      }),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(() => 0),
      clearTimeout: vi.fn(),
    },
  };
}

describe("idle preload", () => {
  it("starts every load once, in the idle period rather than at scheduling", () => {
    const { host, idle } = idleHost();
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    preloadWhenIdle([first, second], host);
    expect(first).not.toHaveBeenCalled();

    idle[0]();
    idle[0]();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("cancels loads that have not started", () => {
    const { host, idle } = idleHost();
    const load = vi.fn(() => Promise.resolve());

    const cancel = preloadWhenIdle([load], host);
    cancel();
    idle[0]();

    expect(host.cancelIdleCallback).toHaveBeenCalledWith(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to a short timer without an idle callback", () => {
    let timer: (() => void) | null = null;
    const load = vi.fn(() => Promise.resolve());
    preloadWhenIdle([load], {
      setTimeout: (callback) => {
        timer = callback;
        return 7;
      },
      clearTimeout: vi.fn(),
    });

    expect(load).not.toHaveBeenCalled();
    timer!();
    expect(load).toHaveBeenCalledOnce();
  });

  it("treats a failed or throwing loader as optional", async () => {
    const rejected = vi.fn(() => Promise.reject(new Error("offline")));
    const thrown = vi.fn((): Promise<unknown> => {
      throw new Error("offline");
    });

    expect(() => preloadNow(rejected)).not.toThrow();
    expect(() => preloadNow(thrown)).not.toThrow();
    await Promise.resolve();
    expect(rejected).toHaveBeenCalledOnce();
  });

  it("does nothing outside a browser", () => {
    const load = vi.fn(() => Promise.resolve());
    preloadWhenIdle([load], null)();
    expect(load).not.toHaveBeenCalled();
  });
});
