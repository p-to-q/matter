import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("Matter Next response headers", () => {
  it("removes the framework disclosure header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the baseline headers within the configured base path", async () => {
    expect(nextConfig.basePath).toBe(
      process.env.MATTER_BASE_PATH ?? "/matter",
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
});
