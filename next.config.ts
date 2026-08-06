import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  normalizeMatterBasePath,
} from "./features/matter/config/base-path";
import { normalizeMatterInitialDocument } from "./features/matter/config/initial-document";

const basePath = normalizeMatterBasePath(process.env.MATTER_BASE_PATH ?? "/matter");
const initialDocument = normalizeMatterInitialDocument(process.env.MATTER_INITIAL_DOCUMENT);
const voiceAdmissionEnabled = process.env.MATTER_TRANSCRIPTION_ADAPTER !== "off";
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
    async redirects() {
      if (basePath === "") return [];
      return [{
        source: "/",
        destination: basePath,
        basePath: false,
        permanent: false,
      }];
    },
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
      NEXT_PUBLIC_MATTER_INITIAL_DOCUMENT: initialDocument,
      NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED: voiceAdmissionEnabled ? "true" : "false",
    },
    outputFileTracingRoot: process.cwd(),
  };
}
