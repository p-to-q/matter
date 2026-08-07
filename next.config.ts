import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  normalizeMatterBasePath,
} from "./features/matter/config/base-path";
import { normalizeMatterInitialDocument } from "./features/matter/config/initial-document";

const basePath = normalizeMatterBasePath(process.env.MATTER_BASE_PATH ?? "/matter");
const initialDocument = normalizeMatterInitialDocument(process.env.MATTER_INITIAL_DOCUMENT);
const voiceBuild = resolveMatterVoiceBuildConfig(
  process.env.MATTER_TRANSCRIPTION_ADAPTER,
  process.env.NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED,
  process.env.NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED,
  process.env.NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED,
);
const repairEnabled = resolveMatterRepairEnabled(
  process.env.MATTER_REPAIR_ADAPTER,
  process.env.NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED,
);
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
      NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED: voiceBuild.admissionEnabled ? "true" : "false",
      NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: voiceBuild.browserSpeechEnabled ? "true" : "false",
      NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: voiceBuild.audioUploadEnabled ? "true" : "false",
      NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: voiceBuild.localTranscriptionEnabled ? "true" : "false",
      NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: repairEnabled ? "true" : "false",
    },
    outputFileTracingRoot: process.cwd(),
  };
}

export function resolveMatterVoiceBuildConfig(
  adapter: string | undefined,
  browserSpeechOverride?: string,
  audioUploadOverride?: string,
  localTranscriptionOverride?: string,
): Readonly<{
  admissionEnabled: boolean;
  browserSpeechEnabled: boolean;
  audioUploadEnabled: boolean;
  localTranscriptionEnabled: boolean;
}> {
  const browserSpeechEnabled = resolvePublicBoolean(
    browserSpeechOverride,
    adapter === "browser",
  );
  const audioUploadEnabled = resolvePublicBoolean(
    audioUploadOverride,
    adapter === "fixture",
  );
  const localTranscriptionEnabled = resolvePublicBoolean(
    localTranscriptionOverride,
    false,
  );
  return Object.freeze({
    admissionEnabled: adapter !== "off" && (
      browserSpeechEnabled || audioUploadEnabled || localTranscriptionEnabled
    ),
    browserSpeechEnabled,
    audioUploadEnabled,
    localTranscriptionEnabled,
  });
}

/**
 * Whether the browser may ask for a transcript repair at all. The server switch
 * is the default so one deployment cannot ship a control that always fails, and
 * the public override exists so a deterministic run can turn the round trip off
 * without changing the server's own adapter.
 */
export function resolveMatterRepairEnabled(
  adapter: string | undefined,
  override?: string,
): boolean {
  return resolvePublicBoolean(override, adapter !== "off");
}

function resolvePublicBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
