import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  checkDeployment,
  inspectDeploymentHeaders,
  inspectDeploymentHealthHeaders,
  inspectDeploymentIcon,
  inspectDeploymentManifest,
  inspectDeploymentMediaHeaders,
  inspectDeploymentMetadataHeaders,
  inspectDeploymentMetadataHtml,
  inspectDeploymentHealth,
  normalizeDeploymentOrigin,
  waitForDeployment,
} from "./check-deployment.mjs";

const ICON_PATHS = ["/icon1.png", "/icon2.png", "/icon3.png", "/icon4.png", "/apple-icon.png"];
const ICON_BYTES = ICON_PATHS.map((path) => Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from(`fixture-${path}`.padEnd(24, "x")),
]));
const EXPECTED_BRAND_ASSETS = ICON_BYTES.map((bytes, index) => ({
  file: `fixture-${index}`,
  sha256: createHash("sha256").update(bytes).digest("hex"),
}));
const BRAND_ROOT_HTML = [
  '<link rel="manifest" href="/manifest.webmanifest"/>',
  '<link rel="icon" href="/icon1.png?one" type="image/png" sizes="16x16"/>',
  '<link rel="icon" href="/icon2.png?two" type="image/png" sizes="32x32"/>',
  '<link rel="icon" href="/icon3.png?three" type="image/png" sizes="192x192"/>',
  '<link rel="icon" href="/icon4.png?four" type="image/png" sizes="512x512"/>',
  '<link rel="apple-touch-icon" href="/apple-icon.png?apple" type="image/png" sizes="180x180"/>',
].join("");
const BRAND_MANIFEST = {
  icons: [
    { src: "https://matter.ptoq.io/icon3.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "https://matter.ptoq.io/icon4.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "https://matter.ptoq.io/icon4.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

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

test("requires the observed bounded browser cache for stable-name visual media", () => {
  const complete = new Headers({
    "cache-control": "public, max-age=14400, must-revalidate",
    "content-type": "image/jpeg",
  });
  assert.deepEqual(inspectDeploymentMediaHeaders(complete), []);
  complete.set("cache-control", "private, max-age=14400, must-revalidate");
  assert.deepEqual(inspectDeploymentMediaHeaders(complete), [
    "Visual media is missing its public browser-cache scope.",
  ]);
  complete.set("cache-control", "public, max-age=31536000, immutable");
  assert.deepEqual(inspectDeploymentMediaHeaders(complete), [
    "Visual media is missing its bounded four-hour browser cache.",
    "Stable-name visual media must revalidate after its browser TTL.",
    "Stable-name visual media must not be cached as immutable.",
  ]);
  complete.set("cache-control", "public, max-age=14400, s-maxage=31536000");
  assert.deepEqual(inspectDeploymentMediaHeaders(complete), [
    "Stable-name visual media must revalidate after its browser TTL.",
    "Stable-name visual media must leave Vercel edge lifetime to the deployment cache.",
  ]);
});

test("requires revalidated PNG metadata assets and the approved bytes", () => {
  const complete = new Headers({
    "cache-control": "public, max-age=0, must-revalidate",
    "content-type": "image/png",
  });
  assert.deepEqual(inspectDeploymentMetadataHeaders(complete, "image/png", "/icon1.png"), []);
  assert.deepEqual(inspectDeploymentIcon(
    ICON_BYTES[0],
    EXPECTED_BRAND_ASSETS[0].sha256,
    "/icon1.png",
  ), []);
  complete.set("cache-control", "public, max-age=31536000, immutable");
  assert.deepEqual(inspectDeploymentMetadataHeaders(complete, "image/png", "/icon1.png"), [
    "/icon1.png must revalidate immediately.",
    "/icon1.png is missing must-revalidate.",
    "/icon1.png must not be immutable.",
  ]);
  assert.deepEqual(inspectDeploymentIcon(
    ICON_BYTES[0],
    "0".repeat(64),
    "/icon1.png",
  ), ["/icon1.png differs from the approved brand asset."]);
});

test("requires the exact fingerprinted browser links and installable icons", () => {
  assert.deepEqual(inspectDeploymentMetadataHtml(BRAND_ROOT_HTML), []);
  assert.deepEqual(inspectDeploymentManifest(BRAND_MANIFEST), []);
  assert.deepEqual(inspectDeploymentMetadataHtml(
    BRAND_ROOT_HTML.replace("/icon1.png?one", "/icon.svg?old"),
  ), [
    "Root metadata still references a provisional Matter icon.",
    "Root metadata icon 1 does not match icon /icon1.png 16x16.",
  ]);
  assert.deepEqual(inspectDeploymentMetadataHtml(
    BRAND_ROOT_HTML.replace('<link rel="manifest" href="/manifest.webmanifest"/>', ""),
  ), ["Root metadata exposes 0 web manifests; expected 1."]);
  assert.deepEqual(inspectDeploymentMetadataHtml(
    BRAND_ROOT_HTML.replace("/icon1.png?one", "https://outside.example/icon1.png?one"),
  ), ["Root metadata icon 1 does not match icon /icon1.png 16x16."]);
  assert.deepEqual(inspectDeploymentMetadataHtml(
    BRAND_ROOT_HTML.replace("/manifest.webmanifest", "https://outside.example/manifest.webmanifest"),
  ), ["Root metadata web manifest leaves the deployed origin."]);
  const staleManifest = structuredClone(BRAND_MANIFEST);
  staleManifest.icons[0].src = "/icon-192.png";
  assert.deepEqual(inspectDeploymentManifest(staleManifest), [
    "Web manifest icon 1 does not match /icon3.png 192x192 any.",
  ]);
  const externalManifest = structuredClone(BRAND_MANIFEST);
  externalManifest.icons[0].src = "https://outside.example/icon3.png";
  assert.deepEqual(inspectDeploymentManifest(externalManifest), [
    "Web manifest icon 1 does not match /icon3.png 192x192 any.",
  ]);
});

test("uses bounded discovery bodies and keeps unrelated probes header-only", async () => {
  const calls = [];
  let healthReads = 0;
  const headerOnly = (status, headers) => ({
    status,
    headers: new Headers(headers),
    get body() { throw new Error("header probe touched the response body"); },
    get bodyUsed() { throw new Error("header probe inspected response body state"); },
    async arrayBuffer() { throw new Error("header probe downloaded bytes"); },
    async json() { throw new Error("header probe parsed a body"); },
    async text() { throw new Error("header probe downloaded text"); },
  });
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({
      path,
      method: init.method,
      cache: init.cache,
      redirect: init.redirect,
      hasAbortSignal: init.signal instanceof AbortSignal,
    });
    if (path === "/") {
      return {
        status: 200,
        headers: new Headers({
          "permissions-policy": "microphone=(self)",
          "referrer-policy": "no-referrer",
          "strict-transport-security": "max-age=63072000",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
        }),
        async text() { return BRAND_ROOT_HTML; },
      };
    }
    if (path === "/matter") return headerOnly(404, {});
    if (path === "/matter-ui/shadows-poster.jpg") {
      return headerOnly(200, {
        "cache-control": "public, max-age=14400, must-revalidate",
        "content-type": "image/jpeg",
      });
    }
    if (path === "/api/health") {
      return {
        status: 200,
        headers: new Headers({
          "cache-control": "no-store",
          "content-type": "application/json",
        }),
        async json() {
          healthReads += 1;
          return HEALTH;
        },
      };
    }
    if (path === "/manifest.webmanifest") {
      return {
        status: 200,
        headers: new Headers({
          "cache-control": "public, max-age=0, must-revalidate",
          "content-type": "application/manifest+json",
        }),
        async json() { return BRAND_MANIFEST; },
      };
    }
    const iconIndex = ICON_PATHS.indexOf(path);
    assert.notEqual(iconIndex, -1);
    return {
      status: 200,
      headers: new Headers({
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "image/png",
      }),
      async arrayBuffer() { return ICON_BYTES[iconIndex]; },
    };
  };

  const result = await checkDeployment({
    origin: "https://matter.ptoq.io",
    expectedVersion: HEALTH.appVersion,
    fetchImpl,
    expectedBrandAssets: EXPECTED_BRAND_ASSETS,
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(calls, [
    { path: "/", method: "GET", cache: "no-store", redirect: "manual", hasAbortSignal: true },
    { path: "/matter", method: "HEAD", cache: "no-store", redirect: "manual", hasAbortSignal: true },
    { path: "/api/health", method: "GET", cache: "no-store", redirect: "manual", hasAbortSignal: true },
    { path: "/matter-ui/shadows-poster.jpg", method: "HEAD", cache: "no-store", redirect: "manual", hasAbortSignal: true },
    { path: "/manifest.webmanifest", method: "GET", cache: "no-store", redirect: "manual", hasAbortSignal: true },
    ...ICON_PATHS.map((path) => ({
      path,
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      hasAbortSignal: true,
    })),
  ]);
  assert.equal(healthReads, 1);
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
