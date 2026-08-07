import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectDeploymentHeaders,
  inspectDeploymentHealth,
  normalizeDeploymentOrigin,
} from "./check-deployment.mjs";

const HEALTH = {
  protocolVersion: "0.2",
  appVersion: "0.2.0-preview.9",
  basePath: "",
  status: "ok",
  surfaces: {
    material: "available",
    localPersistence: "available",
    voiceAdmission: "available",
    thoughtLabel: "unavailable",
    transcriptRepair: "available",
    inquiry: "available",
    transformTurn: "not-implemented",
    archiveExportImport: "available",
  },
};

test("accepts one dedicated HTTPS deployment origin", () => {
  assert.equal(normalizeDeploymentOrigin("https://matter.ptoq.io/"), "https://matter.ptoq.io");
  assert.throws(() => normalizeDeploymentOrigin("http://matter.ptoq.io"), /HTTPS origin/);
  assert.throws(() => normalizeDeploymentOrigin("https://matter.ptoq.io/matter"), /must not include/);
});

test("accepts the complete current deployment capability shape", () => {
  assert.deepEqual(inspectDeploymentHealth(HEALTH, HEALTH.appVersion), []);
});

test("reports version drift and an older health schema", () => {
  const old = structuredClone(HEALTH);
  old.appVersion = "0.2.0-preview.7";
  delete old.surfaces.inquiry;
  delete old.surfaces.transcriptRepair;
  assert.deepEqual(inspectDeploymentHealth(old, HEALTH.appVersion), [
    "Deployed appVersion 0.2.0-preview.7 does not match 0.2.0-preview.9.",
    "Health surface transcriptRepair is missing or invalid.",
    "Health surface inquiry is missing or invalid.",
  ]);
});

test("requires truthful release surfaces", () => {
  const overstated = structuredClone(HEALTH);
  overstated.surfaces.voiceAdmission = "unavailable";
  overstated.surfaces.transformTurn = "available";
  assert.deepEqual(inspectDeploymentHealth(overstated, HEALTH.appVersion), [
    "Public voice admission is not available.",
    "Transform health claim changed; update the release boundary before deploying.",
  ]);
});

test("requires the security headers owned by the public edge", () => {
  const complete = new Headers({
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "microphone=(self)",
    "strict-transport-security": "max-age=63072000",
  });
  assert.deepEqual(inspectDeploymentHeaders(complete), []);
  complete.delete("strict-transport-security");
  assert.deepEqual(inspectDeploymentHeaders(complete), ["Missing HSTS header."]);
});
