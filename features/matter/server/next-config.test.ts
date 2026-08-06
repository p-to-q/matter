import { describe, expect, it } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import matterNextConfig from "../../../next.config";
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
});
