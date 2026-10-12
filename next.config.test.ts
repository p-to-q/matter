import { describe, expect, it } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import matterNextConfig, {
  MATTER_OUTPUT_FILE_TRACING_EXCLUDES,
  resolveMatterNextDistDir,
  resolveMatterPreviewBranch,
} from "./next.config";

describe("Matter Preview Branch build flag", () => {
  it("is closed unless a build names it true", () => {
    expect(resolveMatterPreviewBranch(undefined)).toBe(false);
    expect(resolveMatterPreviewBranch("")).toBe(false);
    expect(resolveMatterPreviewBranch("false")).toBe(false);
    expect(resolveMatterPreviewBranch("1")).toBe(false);
    expect(resolveMatterPreviewBranch("true")).toBe(true);
  });

  it("is on the public environment allow-list, closed by default", () => {
    const config = matterNextConfig(PHASE_PRODUCTION_BUILD);
    expect(config.env).toHaveProperty("NEXT_PUBLIC_MATTER_PREVIEW_BRANCH", "false");
  });
});

describe("Matter Next development output", () => {
  it("excludes repository-only studio tooling from every server trace", () => {
    expect(MATTER_OUTPUT_FILE_TRACING_EXCLUDES).toEqual({
      "/*": ["./studio/**/*"],
    });
  });

  it("keeps the normal Next output directory by default", () => {
    expect(resolveMatterNextDistDir(PHASE_DEVELOPMENT_SERVER, undefined)).toBe(".next");
  });

  it("allows the one isolated directory for the development runner", () => {
    expect(resolveMatterNextDistDir(
      PHASE_DEVELOPMENT_SERVER,
      ".next-e2e",
      "playwright",
    )).toBe(
      ".next-e2e",
    );
  });

  it("ignores a leaked isolated directory without runner ownership", () => {
    expect(resolveMatterNextDistDir(PHASE_DEVELOPMENT_SERVER, ".next-e2e")).toBe(
      ".next",
    );
  });

  it.each(["", ".next", ".next-local", "../outside", "/tmp/outside", ".next/e2e"]) (
    "rejects non-reserved output directory %j",
    (value) => {
      expect(resolveMatterNextDistDir(
        PHASE_DEVELOPMENT_SERVER,
        value,
        "playwright",
      )).toBe(".next");
    },
  );

  it("never changes the production build output from an inherited test value", () => {
    expect(resolveMatterNextDistDir(PHASE_PRODUCTION_BUILD, ".next-e2e")).toBe(".next");
  });
});
