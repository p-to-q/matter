import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewBranchEnabled } from "./preview-branch";

const FLAG = "NEXT_PUBLIC_MATTER_PREVIEW_BRANCH";

describe("Preview Branch flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is closed by default", () => {
    vi.stubEnv(FLAG, undefined as unknown as string);
    expect(previewBranchEnabled()).toBe(false);
  });

  it.each(["", "false", "1", "TRUE", "yes", " true"])("stays closed for %j", (value) => {
    vi.stubEnv(FLAG, value);
    expect(previewBranchEnabled()).toBe(false);
  });

  it("opens only for the exact word true", () => {
    vi.stubEnv(FLAG, "true");
    expect(previewBranchEnabled()).toBe(true);
  });

  it("is read in exactly one source file", () => {
    const root = join(import.meta.dirname, "..");
    const readers: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) &&
          readFileSync(path, "utf8").includes(FLAG)) readers.push(path.slice(root.length + 1));
      }
    };
    walk(root);
    expect(readers).toEqual(["config/preview-branch.ts"]);
  });

  it("is never set by the deployed configuration", () => {
    const vercel = readFileSync(join(import.meta.dirname, "..", "..", "..", "vercel.json"), "utf8");
    expect(vercel).not.toContain("PREVIEW_BRANCH");
  });
});
