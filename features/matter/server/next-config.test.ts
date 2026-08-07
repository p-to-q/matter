import { describe, expect, it } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import matterNextConfig, {
  resolveMatterRepairEnabled,
  resolveMatterVoiceBuildConfig,
} from "../../../next.config";
import { normalizeMatterBasePath } from "../config/base-path";

const nextConfig = matterNextConfig(PHASE_PRODUCTION_BUILD);

describe("Matter Next response headers", () => {
  it("normalizes the two supported deployment shapes", () => {
    expect(normalizeMatterBasePath(undefined)).toBe("/matter");
    expect(normalizeMatterBasePath("/matter")).toBe("/matter");
    expect(normalizeMatterBasePath("")).toBe("");
    expect(normalizeMatterBasePath("/")).toBe("");
    expect(normalizeMatterBasePath("matter/")).toBe("/matter");
  });

  it("removes the framework disclosure header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the baseline headers within the configured base path", async () => {
    expect(nextConfig.basePath).toBe(
      normalizeMatterBasePath(process.env.MATTER_BASE_PATH),
    );
    expect(nextConfig.headers).toBeTypeOf("function");

    if (!nextConfig.headers) {
      throw new Error("Expected Matter response headers to be configured.");
    }

    await expect(nextConfig.headers()).resolves.toEqual([
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "microphone=(self)" },
        ],
      },
    ]);
  });

  it("redirects a domain root to the default mounted application", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    if (!nextConfig.redirects) throw new Error("Expected Matter redirects to be configured.");

    await expect(nextConfig.redirects()).resolves.toEqual([{
      source: "/",
      destination: "/matter",
      basePath: false,
      permanent: false,
    }]);
  });

  it("fails closed for browser audio upload unless the fixture explicitly enables it", () => {
    expect(resolveMatterVoiceBuildConfig(undefined)).toEqual({
      admissionEnabled: false,
      browserSpeechEnabled: false,
      audioUploadEnabled: false,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig("browser")).toEqual({
      admissionEnabled: true,
      browserSpeechEnabled: true,
      audioUploadEnabled: false,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig("fixture")).toEqual({
      admissionEnabled: true,
      browserSpeechEnabled: false,
      audioUploadEnabled: true,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig("off")).toEqual({
      admissionEnabled: false,
      browserSpeechEnabled: false,
      audioUploadEnabled: false,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig(undefined, "true", "false")).toEqual({
      admissionEnabled: true,
      browserSpeechEnabled: true,
      audioUploadEnabled: false,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig("browser", "false", "false")).toEqual({
      admissionEnabled: false,
      browserSpeechEnabled: false,
      audioUploadEnabled: false,
      localTranscriptionEnabled: false,
    });
    expect(resolveMatterVoiceBuildConfig("browser", "true", "true", "true")).toEqual({
      admissionEnabled: true,
      browserSpeechEnabled: true,
      audioUploadEnabled: true,
      localTranscriptionEnabled: true,
    });
  });

  it("follows the server's repair adapter unless a build overrides it", () => {
    expect(resolveMatterRepairEnabled(undefined)).toBe(true);
    expect(resolveMatterRepairEnabled("fixture")).toBe(true);
    expect(resolveMatterRepairEnabled("live")).toBe(true);
    expect(resolveMatterRepairEnabled("off")).toBe(false);
    expect(resolveMatterRepairEnabled("live", "false")).toBe(false);
    expect(resolveMatterRepairEnabled("off", "true")).toBe(true);
  });
});
