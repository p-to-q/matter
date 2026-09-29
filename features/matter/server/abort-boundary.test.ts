import { describe, expect, it, vi } from "vitest";
import { rejectOnAbort } from "./abort-boundary";

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
