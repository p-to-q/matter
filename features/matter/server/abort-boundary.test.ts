import { describe, expect, it, vi } from "vitest";
import { createRequestDeadline, endedOnDeadline, rejectOnAbort } from "./abort-boundary";

describe("rejectOnAbort", () => {
  it("settles a race whose work ignores the signal", async () => {
    const controller = new AbortController();
    const boundary = rejectOnAbort(controller.signal);
    const ignored = new Promise<string>(() => undefined);
    const raced = Promise.race([ignored, boundary.promise]);

    controller.abort(new Error("private caller reason"));

    await expect(raced).rejects.toMatchObject({ name: "AbortError", message: "Aborted" });
    boundary.dispose();
  });

  it("rejects at once for a signal that has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const boundary = rejectOnAbort(controller.signal);
    await expect(boundary.promise).rejects.toMatchObject({ name: "AbortError" });
    boundary.dispose();
  });

  it("lets the owner supply its own stable interruption", async () => {
    const controller = new AbortController();
    const stable = new Error("stable interruption");
    const boundary = rejectOnAbort(controller.signal, () => stable);
    controller.abort();
    await expect(boundary.promise).rejects.toBe(stable);
    boundary.dispose();
  });

  it("stops listening once disposed and never reports an unraced rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const controller = new AbortController();
      const interruption = vi.fn(() => new Error("late"));
      const disposed = rejectOnAbort(controller.signal, interruption);
      disposed.dispose();
      disposed.dispose();
      controller.abort();
      expect(interruption).not.toHaveBeenCalled();

      // A caller that gives up before racing must not leak a rejection.
      const abandoned = new AbortController();
      abandoned.abort();
      rejectOnAbort(abandoned.signal).dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("createRequestDeadline", () => {
  it("ends on its deadline with a timeout the owner can recognise", () => {
    vi.useFakeTimers();
    try {
      const parent = new AbortController();
      const deadline = createRequestDeadline(parent.signal, 100);

      vi.advanceTimersByTime(99);
      expect(deadline.signal.aborted).toBe(false);
      vi.advanceTimersByTime(1);

      expect(endedOnDeadline(deadline.signal)).toBe(true);
      deadline.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns a caller's private abort into one stable cancellation", () => {
    const parent = new AbortController();
    const deadline = createRequestDeadline(parent.signal, 60_000);

    parent.abort(new Error("private caller reason"));

    expect(deadline.signal.aborted).toBe(true);
    expect(endedOnDeadline(deadline.signal)).toBe(false);
    expect(deadline.signal.reason).toMatchObject({ name: "AbortError", message: "Cancelled" });
    deadline.dispose();
  });

  it("keeps a parent deadline's identity through a nested deadline", () => {
    const parent = new AbortController();
    const nested = createRequestDeadline(parent.signal, 60_000);

    parent.abort(new DOMException("Timed out", "TimeoutError"));

    expect(endedOnDeadline(nested.signal)).toBe(true);
    nested.dispose();
  });

  it("starts ended for a parent that has already aborted", () => {
    const parent = new AbortController();
    parent.abort();
    const deadline = createRequestDeadline(parent.signal, 60_000);

    expect(deadline.signal.aborted).toBe(true);
    expect(endedOnDeadline(deadline.signal)).toBe(false);
    deadline.dispose();
  });

  it("neither times out nor follows the parent once disposed", () => {
    vi.useFakeTimers();
    try {
      const parent = new AbortController();
      const deadline = createRequestDeadline(parent.signal, 100);
      deadline.dispose();
      deadline.dispose();

      vi.advanceTimersByTime(1_000);
      parent.abort();

      expect(deadline.signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
