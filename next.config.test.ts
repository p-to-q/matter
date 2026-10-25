import { describe, expect, it, vi } from "vitest";
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

describe("Matter build-frozen artifact identity", () => {
  it("freezes one explicit/platform identity without enabling Next hard navigation", () => {
    try {
      vi.stubEnv("MATTER_BUILD_ID", "owner_artifact");
      vi.stubEnv("VERCEL_DEPLOYMENT_ID", "platform_artifact");
      const explicit = matterNextConfig(PHASE_PRODUCTION_BUILD);
      expect(explicit.env?.NEXT_PUBLIC_MATTER_BUILD_ID).toBe("owner_artifact");
      expect(explicit.deploymentId).toBeUndefined();
      vi.stubEnv("MATTER_BUILD_ID", undefined);
      expect(matterNextConfig(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_MATTER_BUILD_ID).toBe("platform_artifact");
      vi.stubEnv("VERCEL_DEPLOYMENT_ID", undefined);
      expect(matterNextConfig(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_MATTER_BUILD_ID).toBe("");
      vi.stubEnv("MATTER_BUILD_ID", "not a token");
      expect(() => matterNextConfig(PHASE_PRODUCTION_BUILD)).toThrow("build identity");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Matter Next development output", () => {
  it("keeps all reserved generated outputs outside lint without excluding product source", async () => {
    const { ESLint } = await import("eslint");
    const lint = new ESLint();
    for (const directory of [".next", ".next-e2e", ".next-review"]) {
      expect(await lint.isPathIgnored(`${directory}/dev/types/routes.d.ts`)).toBe(true);
    }
    expect(await lint.isPathIgnored("features/matter/components/RootedMaterial.tsx")).toBe(false);
  // This loads the real ESLint/Next configuration, not a product interaction.
  }, 15_000);

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

  it("allows the one isolated directory for the local review owner", () => {
    expect(resolveMatterNextDistDir(
      PHASE_DEVELOPMENT_SERVER,
      ".next-review",
      undefined,
      "owner-review",
    )).toBe(".next-review");
  });

  it.each([undefined, "", "playwright", "other-owner"]) (
    "rejects the review directory without its exact owner %j",
    (reviewOwner) => {
      expect(resolveMatterNextDistDir(
        PHASE_DEVELOPMENT_SERVER,
        ".next-review",
        undefined,
        reviewOwner,
      )).toBe(".next");
    },
  );

  it("rejects any other directory from the local review owner", () => {
    expect(resolveMatterNextDistDir(
      PHASE_DEVELOPMENT_SERVER,
      ".next-owner-preview",
      undefined,
      "owner-review",
    )).toBe(".next");
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

  it("never changes production output for the exact local review pair", () => {
    expect(resolveMatterNextDistDir(
      PHASE_PRODUCTION_BUILD,
      ".next-review",
      undefined,
      "owner-review",
    )).toBe(".next");
  });
});
