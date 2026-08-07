import { describe, expect, it } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { resolveMatterNextDistDir } from "./next.config";

describe("Matter Next development output", () => {
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
