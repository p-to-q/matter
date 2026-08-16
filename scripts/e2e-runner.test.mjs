import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acquireE2eRunLock,
  CANONICAL_NEXT_ROUTE_REFERENCE,
  CANONICAL_NEXT_ROOT_PARAMS_REFERENCE,
  createProcessSignalTarget,
  createSignalTerminator,
  normalizeNextEnvironment,
} from "./e2e-runner.mjs";

describe("e2e runner cleanup", () => {
  it("serializes generated output ownership and only recovers a proven stale owner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matter-e2e-lock-"));
    const lockPath = join(directory, ".next-e2e.lock");
    try {
      const release = await acquireE2eRunLock(lockPath);
      await expect(acquireE2eRunLock(lockPath)).rejects.toThrow(
        `Matter E2E is already running under process ${process.pid}.`,
      );
      await release();
      await release();

      await writeFile(lockPath, "not-a-process\n");
      await expect(acquireE2eRunLock(lockPath)).rejects.toThrow(
        "Matter E2E lock exists without valid owner metadata.",
      );
      await rm(lockPath, { force: true });

      await writeFile(lockPath, "424242\n");
      const missingOwner = () => {
        const error = new Error("missing process");
        error.code = "ESRCH";
        throw error;
      };
      const releaseRecovered = await acquireE2eRunLock(lockPath, process.pid, missingOwner);
      await releaseRecovered();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

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

  it("signals the complete detached process group on POSIX", () => {
    const signalProcess = vi.fn(() => true);
    const target = createProcessSignalTarget(
      { pid: 4321, kill: vi.fn() },
      "darwin",
      signalProcess,
    );

    expect(target.kill("SIGTERM")).toBe(true);
    expect(signalProcess).toHaveBeenCalledWith(-4321, "SIGTERM");
  });

  it("uses the direct child handle on Windows", () => {
    const child = { pid: 4321, kill: vi.fn(() => true) };
    const signalProcess = vi.fn();
    const target = createProcessSignalTarget(child, "win32", signalProcess);

    expect(target.kill("SIGINT")).toBe(true);
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(signalProcess).not.toHaveBeenCalled();
  });
});
