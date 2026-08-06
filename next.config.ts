import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const basePath = process.env.MATTER_BASE_PATH ?? "/matter";
const DEFAULT_DIST_DIR = ".next";
const E2E_DIST_DIR = ".next-e2e";

export function resolveMatterNextDistDir(
  phase: string,
  value = process.env.MATTER_NEXT_DIST_DIR,
): string {
  // Only the Playwright dev server may use a separate build lock and type output.
  return phase === PHASE_DEVELOPMENT_SERVER && value === E2E_DIST_DIR
    ? E2E_DIST_DIR
    : DEFAULT_DIST_DIR;
}

export default function matterNextConfig(phase: string): NextConfig {
  return {
    basePath,
    distDir: resolveMatterNextDistDir(phase),
    poweredByHeader: false,
    async headers() {
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "microphone=(self)" },
        ],
      }];
    },
    env: {
      NEXT_PUBLIC_MATTER_BASE_PATH: basePath,
    },
    outputFileTracingRoot: process.cwd(),
  };
}
