import { describe, expect, it, vi } from "vitest";

import {
  PRODUCTION_ORIGIN,
  authorizeExecution,
  parseArguments,
  runCli,
} from "./probe-material-origin.mjs";

const ORIGIN = "https://preview.example.test";
const VERSION_FLAG = "--expected-version=0.2.0-preview.36";

describe("material origin probe launcher", () => {
  it("defaults to a one-plus-one dry-run and a 50-plus-50 promotion plan", () => {
    expect(parseArguments([ORIGIN, VERSION_FLAG])).toMatchObject({
      profile: "smoke",
      callsPerSurface: 1,
      execute: false,
    });
    expect(parseArguments([ORIGIN, VERSION_FLAG, "--profile=promotion"])).toMatchObject({
      profile: "promotion",
      callsPerSurface: 50,
      execute: false,
    });
  });

  it("does not invoke the receipt runner in the default dry-run", async () => {
    const executeReceipt = vi.fn();
    const lines = [];
    const exitCode = await runCli({
      args: [ORIGIN, VERSION_FLAG],
      environment: {},
      executeReceipt,
      write: (line) => lines.push(line),
    });
    expect(exitCode).toBe(0);
    expect(executeReceipt).not.toHaveBeenCalled();
    expect(lines).toEqual([expect.stringContaining("dry-run only")]);
    expect(lines[0]).toContain("no network was used");
  });

  it("requires an exact remote-origin confirmation before invoking Playwright", async () => {
    const executeReceipt = vi.fn(async () => 0);
    await expect(runCli({
      args: [ORIGIN, VERSION_FLAG, "--execute", "--allow-remote"],
      environment: { MATTER_SYNTHETIC_PROBE_ORIGIN: "https://other.example.test" },
      executeReceipt,
    })).rejects.toThrow(/matching the exact origin/);
    expect(executeReceipt).not.toHaveBeenCalled();

    await expect(runCli({
      args: [ORIGIN, VERSION_FLAG, "--execute", "--allow-remote"],
      environment: { MATTER_SYNTHETIC_PROBE_ORIGIN: ORIGIN },
      executeReceipt,
    })).resolves.toBe(0);
    expect(executeReceipt).toHaveBeenCalledTimes(1);
  });

  it("requires the canonical production origin as an additional literal", () => {
    const parsed = parseArguments([
      PRODUCTION_ORIGIN,
      VERSION_FLAG,
      "--execute",
      "--allow-remote",
    ]);
    expect(() => authorizeExecution(parsed, { MATTER_SYNTHETIC_PROBE_ORIGIN: PRODUCTION_ORIGIN }))
      .toThrow(/--allow-production/);
    const allowed = parseArguments([
      PRODUCTION_ORIGIN,
      VERSION_FLAG,
      "--execute",
      "--allow-remote",
      `--allow-production=${PRODUCTION_ORIGIN}`,
    ]);
    expect(authorizeExecution(allowed, { MATTER_SYNTHETIC_PROBE_ORIGIN: PRODUCTION_ORIGIN }).mode)
      .toBe("execute");
  });

  it("rejects unsafe origins, unknown flags, and widened smoke runs", () => {
    expect(() => parseArguments(["http://preview.example.test", VERSION_FLAG])).toThrow(/HTTPS/);
    expect(() => parseArguments([`${ORIGIN}/matter`, VERSION_FLAG])).toThrow(/path, query, or fragment/);
    expect(() => parseArguments([ORIGIN, VERSION_FLAG, "--unknown"])).toThrow(/Unknown/);
    expect(() => parseArguments([ORIGIN, VERSION_FLAG, "--calls-per-surface=2"])).toThrow(/exactly one/);
    expect(() => parseArguments([
      ORIGIN,
      VERSION_FLAG,
      "--profile=promotion",
      "--calls-per-surface=49",
    ])).toThrow(/exactly fifty/);
    expect(() => parseArguments([ORIGIN, VERSION_FLAG, "--pace-seconds=7"])).toThrow(/whole number/);
  });
});
