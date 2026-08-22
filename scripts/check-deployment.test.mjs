import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectDeploymentHeaders,
  inspectDeploymentHealthHeaders,
  inspectDeploymentHealth,
  normalizeDeploymentOrigin,
  waitForDeployment,
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
    thoughtLabel: "available",
    transcriptRepair: "available",
    inquiry: "available",
    transformTurn: "unavailable",
    textSwap: "unavailable",
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
    "Live model surface transcriptRepair is not available.",
    "Live model surface inquiry is not available.",
  ]);
});

test("requires truthful release surfaces", () => {
  const overstated = structuredClone(HEALTH);
  overstated.surfaces.voiceAdmission = "unavailable";
  overstated.surfaces.transformTurn = "available";
  assert.deepEqual(inspectDeploymentHealth(overstated, HEALTH.appVersion), [
    "Public voice admission is not available.",
    "Material model surface transformTurn must be unavailable for browser-preview.",
  ]);
});

test("promotes Elastic alone while the dormant Text Swap gate stays closed", () => {
  const live = structuredClone(HEALTH);
  live.surfaces.transformTurn = "available";
  assert.deepEqual(inspectDeploymentHealth(live, HEALTH.appVersion, "elastic-live"), []);
  live.surfaces.textSwap = "available";
  assert.deepEqual(inspectDeploymentHealth(live, HEALTH.appVersion, "elastic-live"), [
    "Dormant material surface textSwap must be unavailable for elastic-live.",
  ]);
});

test("rejects the superseded paired material-live profile", () => {
  assert.deepEqual(inspectDeploymentHealth(HEALTH, HEALTH.appVersion, "material-live"), [
    "Unknown deployment profile material-live.",
  ]);
});

test("rejects an unknown deployment profile before trusting health", () => {
  assert.deepEqual(inspectDeploymentHealth(HEALTH, HEALTH.appVersion, "fixture"), [
    "Unknown deployment profile fixture.",
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

test("requires a JSON no-store health receipt", () => {
  const complete = new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
  });
  assert.deepEqual(inspectDeploymentHealthHeaders(complete), []);
  complete.set("content-type", "application/jsonp");
  assert.deepEqual(inspectDeploymentHealthHeaders(complete), [
    "Health probe did not declare JSON.",
  ]);
  complete.set("cache-control", "public, max-age=60");
  complete.set("content-type", "text/html");
  assert.deepEqual(inspectDeploymentHealthHeaders(complete), [
    "Health probe did not declare JSON.",
    "Health probe is not marked no-store.",
  ]);
});

test("waits through one stale edge receipt without widening the probe", async () => {
  let elapsed = 0;
  let calls = 0;
  const result = await waitForDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    waitMs: 10_000,
    intervalMs: 5_000,
    now: () => elapsed,
    sleep: async (milliseconds) => { elapsed += milliseconds; },
    check: async () => {
      calls += 1;
      return calls === 1
        ? { origin: "https://matter.ptoq.io", failures: ["Deployed appVersion 0.2.0-preview.7 does not match 0.2.0-preview.9."] }
        : { origin: "https://matter.ptoq.io", failures: [] };
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(elapsed, 5_000);
  assert.deepEqual(result.failures, []);
});

test("stops at the bounded wait deadline when the receipt never becomes current", async () => {
  let elapsed = 0;
  const result = await waitForDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    waitMs: 10_000,
    intervalMs: 5_000,
    now: () => elapsed,
    sleep: async (milliseconds) => { elapsed += milliseconds; },
    check: async () => ({ origin: "https://matter.ptoq.io", failures: ["Deployment has not propagated."] }),
  });
  assert.equal(result.attempts, 3);
  assert.equal(elapsed, 10_000);
  assert.deepEqual(result.failures, ["Deployment has not propagated."]);
});

test("retries one transient probe failure without exposing its transport detail", async () => {
  let elapsed = 0;
  let calls = 0;
  const result = await waitForDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    waitMs: 5_000,
    intervalMs: 5_000,
    now: () => elapsed,
    sleep: async (milliseconds) => { elapsed += milliseconds; },
    check: async () => {
      calls += 1;
      if (calls === 1) throw new Error("network path should not become release output");
      return { origin: "https://matter.ptoq.io", failures: [] };
    },
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.failures, []);
});

test("runs on its own clock, the way the release gate invokes it", async () => {
  // Regression: the default clock was `performance.now` detached from
  // `performance`, so every real invocation threw before probing anything.
  const result = await waitForDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    check: async () => ({ origin: "https://matter.ptoq.io", failures: [] }),
  });
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.failures, []);
});

test("reports a failing origin on its own clock instead of throwing", async () => {
  const result = await waitForDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    waitMs: 1,
    intervalMs: 1,
    check: async () => ({ origin: "https://matter.ptoq.io", failures: ["forced"] }),
  });
  assert.deepEqual(result.failures, ["forced"]);
});
