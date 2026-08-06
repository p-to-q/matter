import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_NEXT_ROUTE_REFERENCE,
  CANONICAL_NEXT_ROOT_PARAMS_REFERENCE,
  createSignalTerminator,
  normalizeNextEnvironment,
} from "./e2e-runner.mjs";

describe("e2e runner cleanup", () => {
  it.each([
    'import "./.next-e2e/dev/types/routes.d.ts";',
    'import "./.next-e2e/types/routes.d.ts";',
    'import "./.next/dev/types/routes.d.ts";',
  ])("restores the canonical Next route type reference from %s", (reference) => {
    expect(normalizeNextEnvironment(`${reference}\n`)).toBe(
      `${CANONICAL_NEXT_ROUTE_REFERENCE}\n`,
    );
  });

  it("leaves the canonical reference unchanged", () => {
    expect(normalizeNextEnvironment(CANONICAL_NEXT_ROUTE_REFERENCE)).toBe(
      CANONICAL_NEXT_ROUTE_REFERENCE,
    );
  });

  it.each([
    'import "./.next-e2e/dev/types/root-params.d.ts";',
    'import "./.next/dev/types/root-params.d.ts";',
  ])("restores the canonical Next root params reference from %s", (reference) => {
    expect(normalizeNextEnvironment(`${reference}\n`)).toBe(
      `${CANONICAL_NEXT_ROOT_PARAMS_REFERENCE}\n`,
    );
  });

  it("forwards one termination signal and schedules a bounded fallback", () => {
    const child = { kill: vi.fn() };
    const timer = { unref: vi.fn() };
    const schedule = vi.fn(() => timer);
    const cancel = vi.fn();
    const terminator = createSignalTerminator(child, schedule, cancel);

    expect(terminator.request("SIGTERM")).toBe(true);
    expect(terminator.request("SIGINT")).toBe(false);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(timer.unref).toHaveBeenCalledOnce();
    expect(terminator.signal()).toBe("SIGTERM");

    const fallback = schedule.mock.calls[0][0];
    fallback();
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");

    terminator.clear();
    expect(cancel).toHaveBeenCalledWith(timer);
  });
});
