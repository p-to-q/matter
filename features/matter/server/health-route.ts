import packageMetadata from "../../../package.json";
import { DEFAULT_MATTER_BASE_PATH, normalizeMatterBasePath } from "../config/base-path";
import { PROTOCOL_VERSION } from "../tree/model";
import { readModelPool } from "./model-pool";

export type MatterHealthSurface =
  | "available"
  | "fixture"
  | "unavailable"
  | "not-implemented";

export type MatterHealth = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  appVersion: string;
  basePath: string;
  status: "ok";
  surfaces: Readonly<{
    material: "available";
    localPersistence: "available";
    voiceAdmission: MatterHealthSurface;
    /**
     * `available` means a live provider may improve a label. Every other value
     * still labels every node, because the deterministic label needs no server.
     */
    thoughtLabel: MatterHealthSurface;
    /**
     * `available` means a live provider may repair a transcript before it is
     * admitted. Every other value still admits every utterance, because the
     * words as heard need no server.
     */
    transcriptRepair: MatterHealthSurface;
    /**
     * The one surface with no floor: `unavailable` means a question is answered
     * with a stated unavailability rather than with invented prose.
     */
    inquiry: MatterHealthSurface;
    transformTurn: MatterHealthSurface;
    archiveExportImport: "available";
  }>;
}>;

export function handleHealthRequest(): Response {
  return Response.json(healthSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function healthSnapshot(): MatterHealth {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    appVersion: packageMetadata.version,
    basePath: configuredBasePath(),
    status: "ok",
    surfaces: Object.freeze({
      material: "available",
      localPersistence: "available",
      voiceAdmission: voiceAdmissionSurface(),
      thoughtLabel: thoughtLabelSurface(),
      transcriptRepair: transcriptRepairSurface(),
      inquiry: inquirySurface(),
      transformTurn: transformTurnSurface(),
      archiveExportImport: "available",
    }),
  });
}

function configuredBasePath(): string {
  return normalizeMatterBasePath(
    process.env.MATTER_BASE_PATH ??
      process.env.NEXT_PUBLIC_MATTER_BASE_PATH ??
      DEFAULT_MATTER_BASE_PATH,
  );
}

function thoughtLabelSurface(): MatterHealthSurface {
  return adapterSurface(process.env.MATTER_LABEL_ADAPTER);
}

function transcriptRepairSurface(): MatterHealthSurface {
  if (process.env.NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED === "false") {
    // The build never asks, so no server configuration can make this available.
    return "unavailable";
  }
  return adapterSurface(process.env.MATTER_REPAIR_ADAPTER);
}

function inquirySurface(): MatterHealthSurface {
  // Inquiry has no fixture by design, so it is available or it is not.
  return process.env.MATTER_INQUIRY_ADAPTER === "live" && readModelPool().length > 0
    ? "available"
    : "unavailable";
}

function transformTurnSurface(): MatterHealthSurface {
  return adapterSurface(process.env.MATTER_TRANSFORM_ADAPTER);
}

/**
 * The shape shared by the two pool-backed scenarios that keep a deterministic
 * floor. `available` reports only that a pool is configured; it is never a
 * claim about a relay being reachable, and the surface works either way.
 */
function adapterSurface(configured: string | undefined): MatterHealthSurface {
  if (configured === "live") return readModelPool().length > 0 ? "available" : "unavailable";
  if (configured === "fixture" || (configured === undefined && process.env.NODE_ENV !== "production")) {
    return "fixture";
  }
  return "unavailable";
}

function voiceAdmissionSurface(): MatterHealthSurface {
  if (process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED === "false") {
    return "unavailable";
  }
  const configured = process.env.MATTER_TRANSCRIPTION_ADAPTER;
  const usesDefaultFixture =
    configured === undefined && process.env.NODE_ENV !== "production";
  if (configured === "fixture" || usesDefaultFixture) {
    return "fixture";
  }
  if (configured === "browser") return "available";
  return "unavailable";
}
