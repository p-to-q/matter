import packageMetadata from "../../../package.json";
import { PROTOCOL_VERSION } from "../tree/model";
import { readLabelPool } from "./label-provider";

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
    transformTurn: "not-implemented";
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
      transformTurn: "not-implemented",
      archiveExportImport: "available",
    }),
  });
}

function configuredBasePath(): string {
  const value =
    process.env.MATTER_BASE_PATH ??
    process.env.NEXT_PUBLIC_MATTER_BASE_PATH ??
    "/matter";
  return value.startsWith("/") && !value.endsWith("/") ? value : "/matter";
}

function thoughtLabelSurface(): MatterHealthSurface {
  const configured = process.env.MATTER_LABEL_ADAPTER;
  // `available` reports only that a pool is configured. It is never a claim
  // about a relay being reachable, and a label exists either way.
  if (configured === "live") {
    return readLabelPool().length > 0 ? "available" : "unavailable";
  }
  if (configured === "fixture" || (configured === undefined && process.env.NODE_ENV !== "production")) {
    return "fixture";
  }
  return "unavailable";
}

function voiceAdmissionSurface(): MatterHealthSurface {
  const configured = process.env.MATTER_TRANSCRIPTION_ADAPTER;
  const usesDefaultFixture =
    configured === undefined && process.env.NODE_ENV !== "production";
  if (configured === "fixture" || usesDefaultFixture) {
    return "fixture";
  }
  return "unavailable";
}
