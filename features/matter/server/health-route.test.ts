import { afterEach, describe, expect, it } from "vitest";
import packageMetadata from "../../../package.json";
import { GET } from "../../../app/api/health/route";
import { healthSnapshot } from "./health-route";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Matter health route", () => {
  it("reports the deployed protocol without exposing provider configuration", async () => {
    // Every gate is pinned: this asserts the whole envelope, so a developer's
    // own `.env.local` must not be able to change what the probe reports.
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "fixture";
    process.env.MATTER_LABEL_ADAPTER = "fixture";
    process.env.MATTER_REPAIR_ADAPTER = "fixture";
    process.env.MATTER_INQUIRY_ADAPTER = "off";
    process.env.MATTER_TRANSFORM_ADAPTER = "fixture";
    delete process.env.NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED;
    process.env.MATTER_BASE_PATH = "/matter";
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      protocolVersion: "0.2",
      appVersion: packageMetadata.version,
      basePath: "/matter",
      status: "ok",
      surfaces: {
        material: "available",
        localPersistence: "available",
        voiceAdmission: "fixture",
        thoughtLabel: "fixture",
        transcriptRepair: "fixture",
        inquiry: "unavailable",
        transformTurn: "fixture",
        archiveExportImport: "available",
      },
    });
  });

  it("marks live admission unavailable until a supported adapter is configured", () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "unsupported";

    expect(healthSnapshot().surfaces.voiceAdmission).toBe("unavailable");
  });

  it("does not advertise a fixture adapter when the public build disables voice", () => {
    process.env.MATTER_TRANSCRIPTION_ADAPTER = "fixture";
    process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED = "false";

    expect(healthSnapshot().surfaces.voiceAdmission).toBe("unavailable");
  });

  it("marks the label model unavailable until a supported adapter is configured", () => {
    process.env.MATTER_LABEL_ADAPTER = "off";

    expect(healthSnapshot().surfaces.thoughtLabel).toBe("unavailable");
  });

  it("marks repair unavailable when the build never asks for it", () => {
    process.env.NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED = "false";

    expect(healthSnapshot().surfaces.transcriptRepair).toBe("unavailable");
  });

  it("never reports inquiry as a fixture, because it has none", () => {
    process.env.MATTER_INQUIRY_ADAPTER = "fixture";

    expect(healthSnapshot().surfaces.inquiry).toBe("unavailable");
  });

  it("reports transform unavailable when its provider and fixture gates are off", () => {
    process.env.MATTER_TRANSFORM_ADAPTER = "off";

    expect(healthSnapshot().surfaces.transformTurn).toBe("unavailable");
  });

  it("falls back to the canonical Matter base path for unsafe deployment values", () => {
    process.env.MATTER_BASE_PATH = "matter/";

    expect(healthSnapshot().basePath).toBe("/matter");
  });

  it("reports an empty prefix for a dedicated root deployment", () => {
    process.env.MATTER_BASE_PATH = "";

    expect(healthSnapshot().basePath).toBe("");
  });
});
