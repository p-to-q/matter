import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HEALTH_SURFACES = [
  "material",
  "localPersistence",
  "voiceAdmission",
  "thoughtLabel",
  "transcriptRepair",
  "inquiry",
  "transformTurn",
  "textSwap",
  "archiveExportImport",
];
const SURFACE_STATES = new Set(["available", "fixture", "unavailable"]);
const DEPLOYMENT_PROFILES = new Set(["browser-preview", "elastic-live"]);
const BRAND_MANIFEST_URL = new URL(
  "../features/matter/brand/assets/brand-assets.json",
  import.meta.url,
);
const DEPLOYMENT_BRAND_ICONS = Object.freeze([
  Object.freeze({ file: "app/icon1.png", path: "/icon1.png", rel: "icon", sizes: "16x16" }),
  Object.freeze({ file: "app/icon2.png", path: "/icon2.png", rel: "icon", sizes: "32x32" }),
  Object.freeze({ file: "app/icon3.png", path: "/icon3.png", rel: "icon", sizes: "192x192" }),
  Object.freeze({ file: "app/icon4.png", path: "/icon4.png", rel: "icon", sizes: "512x512" }),
  Object.freeze({ file: "app/apple-icon.png", path: "/apple-icon.png", rel: "apple-touch-icon", sizes: "180x180" }),
]);

export function normalizeDeploymentOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("Deployment origin must be an HTTPS origin without credentials.");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("Deployment origin must not include a path, query, or fragment.");
  }
  return url.origin;
}

export function inspectDeploymentHealth(value, expectedVersion, profile = "browser-preview") {
  const failures = [];
  if (!DEPLOYMENT_PROFILES.has(profile)) return [`Unknown deployment profile ${String(profile)}.`];
  if (!isRecord(value)) return ["Health response is not an object."];
  if (value.status !== "ok") failures.push("Health status is not ok.");
  if (value.protocolVersion !== "0.2") failures.push("Health protocolVersion is not 0.2.");
  if (value.appVersion !== expectedVersion) {
    failures.push(`Deployed appVersion ${String(value.appVersion)} does not match ${expectedVersion}.`);
  }
  if (value.basePath !== "") failures.push("Dedicated-domain basePath must be empty.");
  if (!isRecord(value.surfaces)) return [...failures, "Health surfaces are missing."];

  for (const name of HEALTH_SURFACES) {
    if (!SURFACE_STATES.has(value.surfaces[name])) failures.push(`Health surface ${name} is missing or invalid.`);
  }
  for (const name of ["material", "localPersistence", "archiveExportImport"]) {
    if (value.surfaces[name] !== "available") failures.push(`Required surface ${name} is not available.`);
  }
  for (const name of ["thoughtLabel", "transcriptRepair", "inquiry"]) {
    if (value.surfaces[name] !== "available") {
      failures.push(`Live model surface ${name} is not available.`);
    }
  }
  if (value.surfaces.voiceAdmission !== "available") {
    failures.push("Public voice admission is not available.");
  }
  const expectedTransformState = profile === "elastic-live" ? "available" : "unavailable";
  if (value.surfaces.transformTurn !== expectedTransformState) {
    failures.push(
      `Material model surface transformTurn must be ${expectedTransformState} for ${profile}.`,
    );
  }
  // Text Swap is a dormant regression grammar, not a current release surface.
  // Keeping its health lane unavailable prevents an old paired-promotion
  // command from silently publishing UI authority that no longer exists.
  if (value.surfaces.textSwap !== "unavailable") {
    failures.push(`Dormant material surface textSwap must be unavailable for ${profile}.`);
  }
  return failures;
}

export function inspectDeploymentHeaders(headers) {
  const failures = [];
  if (headers.get("x-content-type-options") !== "nosniff") failures.push("Missing nosniff header.");
  if (headers.get("x-frame-options") !== "DENY") failures.push("Missing frame denial header.");
  if (headers.get("referrer-policy") !== "no-referrer") failures.push("Unexpected referrer policy.");
  if (!headers.get("permissions-policy")?.includes("microphone=(self)")) {
    failures.push("Microphone permission is not restricted to this origin.");
  }
  if (!headers.has("strict-transport-security")) failures.push("Missing HSTS header.");
  return failures;
}

export function inspectDeploymentHealthHeaders(headers) {
  const failures = [];
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    failures.push("Health probe did not declare JSON.");
  }
  const cacheControl = headers.get("cache-control")?.toLowerCase() ?? "";
  if (!cacheControl.split(",").some((directive) => directive.trim() === "no-store")) {
    failures.push("Health probe is not marked no-store.");
  }
  return failures;
}

export function inspectDeploymentMediaHeaders(headers) {
  const failures = [];
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/jpeg")) {
    failures.push("Visual-media probe did not declare JPEG.");
  }
  const cacheControl = headers.get("cache-control")?.toLowerCase() ?? "";
  if (!cacheControl.split(",").some((directive) => directive.trim() === "public")) {
    failures.push("Visual media is missing its public browser-cache scope.");
  }
  if (!cacheControl.split(",").some((directive) => directive.trim() === "max-age=14400")) {
    failures.push("Visual media is missing its bounded four-hour browser cache.");
  }
  if (!cacheControl.split(",").some((directive) => directive.trim() === "must-revalidate")) {
    failures.push("Stable-name visual media must revalidate after its browser TTL.");
  }
  if (cacheControl.includes("immutable")) {
    failures.push("Stable-name visual media must not be cached as immutable.");
  }
  if (cacheControl.includes("s-maxage")) {
    failures.push("Stable-name visual media must leave Vercel edge lifetime to the deployment cache.");
  }
  return failures;
}

export function inspectDeploymentMetadataHeaders(
  headers,
  expectedContentType,
  label,
  expectedMaxAgeSeconds = 0,
) {
  const failures = [];
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith(expectedContentType)) {
    failures.push(`${label} did not declare ${expectedContentType}.`);
  }
  const directives = (headers.get("cache-control")?.toLowerCase() ?? "")
    .split(",")
    .map((directive) => directive.trim());
  if (!directives.includes("public")) failures.push(`${label} is missing its public cache scope.`);
  const maxAgeDirectives = directives.filter((directive) => directive.startsWith("max-age="));
  if (
    maxAgeDirectives.length !== 1
    || maxAgeDirectives[0] !== `max-age=${expectedMaxAgeSeconds}`
  ) {
    failures.push(`${label} must use max-age=${expectedMaxAgeSeconds}.`);
  }
  if (!directives.includes("must-revalidate")) failures.push(`${label} is missing must-revalidate.`);
  if (directives.includes("immutable")) failures.push(`${label} must not be immutable.`);
  if (directives.includes("private") || directives.includes("no-store")) {
    failures.push(`${label} has a conflicting non-public cache directive.`);
  }
  if (directives.some((directive) => directive.startsWith("s-maxage="))) {
    failures.push(`${label} must leave shared-cache lifetime to the deployment edge.`);
  }
  return failures;
}

export function inspectDeploymentMetadataHtml(html, origin = "https://matter.ptoq.io") {
  if (typeof html !== "string") return ["Root metadata response is not text."];
  const failures = [];
  const deployedOrigin = new URL(origin).origin;
  if (/\/(?:icon\.svg|icon-192\.png|icon-512\.png)(?:[?"#]|$)/u.test(html)) {
    failures.push("Root metadata still references a provisional Matter icon.");
  }
  const manifests = [...html.matchAll(/<link\b[^>]*\brel="manifest"[^>]*>/gu)]
    .map((match) => readHtmlAttributes(match[0]));
  if (manifests.length !== 1) {
    failures.push(`Root metadata exposes ${manifests.length} web manifests; expected 1.`);
  } else {
    let manifestPath = "";
    try {
      const manifestUrl = new URL(manifests[0]?.href ?? "", deployedOrigin);
      if (manifestUrl.origin !== deployedOrigin) {
        failures.push("Root metadata web manifest leaves the deployed origin.");
      }
      manifestPath = manifestUrl.pathname;
    } catch {
      // The comparison below reports the malformed href once.
    }
    if (manifestPath !== "/manifest.webmanifest") {
      failures.push("Root metadata does not discover /manifest.webmanifest.");
    }
  }
  const links = [...html.matchAll(/<link\b[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>/gu)]
    .map((match) => readHtmlAttributes(match[0]));
  if (links.length !== DEPLOYMENT_BRAND_ICONS.length) {
    failures.push(`Root metadata exposes ${links.length} icon links; expected ${DEPLOYMENT_BRAND_ICONS.length}.`);
    return failures;
  }
  DEPLOYMENT_BRAND_ICONS.forEach((expected, index) => {
    const actual = links[index];
    let href;
    try {
      href = new URL(actual?.href ?? "", deployedOrigin);
    } catch {
      failures.push(`Root metadata icon ${index + 1} has an invalid href.`);
      return;
    }
    if (
      href.origin !== deployedOrigin
      || actual?.rel !== expected.rel
      || href.pathname !== expected.path
      || href.search.length <= 1
      || actual?.sizes !== expected.sizes
      || actual?.type !== "image/png"
    ) {
      failures.push(`Root metadata icon ${index + 1} does not match ${expected.rel} ${expected.path} ${expected.sizes}.`);
    }
  });
  return failures;
}

export function inspectDeploymentManifest(value, origin = "https://matter.ptoq.io") {
  if (!isRecord(value) || !Array.isArray(value.icons)) {
    return ["Web manifest icons are missing."];
  }
  const expected = [
    ["/icon3.png", "192x192", "any"],
    ["/icon4.png", "512x512", "any"],
    ["/icon4.png", "512x512", "maskable"],
  ];
  if (value.icons.length !== expected.length) {
    return [`Web manifest exposes ${value.icons.length} icons; expected ${expected.length}.`];
  }
  const failures = [];
  const deployedOrigin = new URL(origin).origin;
  expected.forEach(([path, sizes, purpose], index) => {
    const icon = value.icons[index];
    let pathname = "";
    let iconOrigin = "";
    try {
      const iconUrl = new URL(icon?.src ?? "", deployedOrigin);
      pathname = iconUrl.pathname;
      iconOrigin = iconUrl.origin;
    } catch {
      // The comparison below reports the malformed source once.
    }
    if (
      iconOrigin !== deployedOrigin
      || pathname !== path
      || icon?.sizes !== sizes
      || icon?.purpose !== purpose
      || icon?.type !== "image/png"
    ) {
      failures.push(`Web manifest icon ${index + 1} does not match ${path} ${sizes} ${purpose}.`);
    }
  });
  return failures;
}

export function inspectDeploymentIcon(bytes, expectedSha256, path) {
  const buffer = Buffer.from(bytes);
  const failures = [];
  if (
    buffer.length < 24
    || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    failures.push(`${path} is not a PNG.`);
    return failures;
  }
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== expectedSha256) failures.push(`${path} differs from the approved brand asset.`);
  return failures;
}

export async function checkDeployment({
  origin,
  expectedVersion,
  profile = "browser-preview",
  fetchImpl = fetch,
  expectedBrandAssets,
}) {
  const normalized = normalizeDeploymentOrigin(origin);
  const brandAssets = expectedBrandAssets ?? await readExpectedBrandAssets();
  const request = (path, init = {}) => fetchImpl(`${normalized}${path}`, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  const [root, legacy, health, media, manifest, ...icons] = await Promise.all([
    request("/", { method: "GET" }),
    request("/matter", { method: "HEAD" }),
    request("/api/health", { method: "GET" }),
    request("/matter-ui/shadows-poster.jpg", { method: "HEAD" }),
    request("/manifest.webmanifest", { method: "GET" }),
    ...DEPLOYMENT_BRAND_ICONS.map((icon) => request(icon.path, { method: "GET" })),
  ]);
  const failures = [];
  if (root.status !== 200) {
    failures.push(`Root returned HTTP ${root.status}.`);
  } else {
    failures.push(...inspectDeploymentMetadataHtml(await root.text(), normalized));
  }
  if (legacy.status !== 404) failures.push(`Legacy /matter returned HTTP ${legacy.status}, expected 404.`);
  if (health.status !== 200) {
    failures.push(`Health probe returned HTTP ${health.status}.`);
  } else {
    failures.push(...inspectDeploymentHealthHeaders(health.headers));
    let payload;
    try {
      payload = await health.json();
    } catch {
      failures.push("Health probe did not return JSON.");
    }
    if (payload !== undefined) {
      failures.push(...inspectDeploymentHealth(payload, expectedVersion, profile));
    }
  }
  if (media.status !== 200) {
    failures.push(`Visual-media probe returned HTTP ${media.status}.`);
  } else {
    failures.push(...inspectDeploymentMediaHeaders(media.headers));
  }
  if (manifest.status !== 200) {
    failures.push(`Web manifest returned HTTP ${manifest.status}.`);
  } else {
    failures.push(...inspectDeploymentMetadataHeaders(
      manifest.headers,
      "application/manifest+json",
      "Web manifest",
    ));
    try {
      failures.push(...inspectDeploymentManifest(await manifest.json(), normalized));
    } catch {
      failures.push("Web manifest did not return JSON.");
    }
  }
  for (const [index, response] of icons.entries()) {
    const expected = brandAssets[index];
    const contract = DEPLOYMENT_BRAND_ICONS[index];
    if (expected === undefined || contract === undefined) {
      failures.push("Deployment brand asset contract is incomplete.");
      break;
    }
    if (response.status !== 200) {
      failures.push(`${contract.path} returned HTTP ${response.status}.`);
      continue;
    }
    failures.push(...inspectDeploymentMetadataHeaders(
      response.headers,
      "image/png",
      contract.path,
      14_400,
    ));
    failures.push(...inspectDeploymentIcon(
      await response.arrayBuffer(),
      expected.sha256,
      contract.path,
    ));
  }
  failures.push(...inspectDeploymentHeaders(root.headers));
  return Object.freeze({ origin: normalized, failures: Object.freeze(failures) });
}

async function readExpectedBrandAssets() {
  const manifest = JSON.parse(await readFile(BRAND_MANIFEST_URL, "utf8"));
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const byFile = new Map(assets.map((asset) => [asset?.file, asset]));
  return DEPLOYMENT_BRAND_ICONS.map(({ file }) => {
    const asset = byFile.get(file);
    if (!/^[a-f0-9]{64}$/u.test(asset?.sha256 ?? "")) {
      throw new Error(`Brand asset manifest is missing ${file}.`);
    }
    return Object.freeze({ file, sha256: asset.sha256 });
  });
}

function readHtmlAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/\b([a-z-]+)="([^"]*)"/gu)]
      .map((match) => [match[1], match[2]]),
  );
}

/**
 * Edge routing can briefly serve the previous deployment after Vercel marks a
 * build ready. Retry the same bounded, content-free receipt instead of making
 * a release script infer readiness from a deployment dashboard.
 */
export async function waitForDeployment({
  origin,
  expectedVersion,
  profile = "browser-preview",
  waitMs = 0,
  intervalMs = 5_000,
  check = checkDeployment,
  sleep = delay,
  // Bound, because `performance.now` detached from `performance` throws when
  // called. Every test injects a clock, so only the real release gate ran the
  // default — and it failed the same way for a healthy origin and a broken one.
  now = () => performance.now(),
}) {
  if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
    throw new Error("Deployment wait must be a non-negative integer number of milliseconds.");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("Deployment retry interval must be a positive integer number of milliseconds.");
  }

  const normalizedOrigin = normalizeDeploymentOrigin(origin);
  const deadline = now() + waitMs;
  let attempts = 0;
  let result;
  do {
    attempts += 1;
    try {
      result = await check({ origin: normalizedOrigin, expectedVersion, profile });
    } catch {
      result = Object.freeze({
        origin: normalizedOrigin,
        failures: Object.freeze(["Deployment probe request failed."]),
      });
    }
    if (result.failures.length === 0 || now() >= deadline) break;
    await sleep(Math.min(intervalMs, deadline - now()));
  } while (true);

  return Object.freeze({ ...result, attempts });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
  const { origin, profile, waitMs } = parseArguments(process.argv.slice(2));
  const result = await waitForDeployment({
    origin: origin ?? process.env.MATTER_DEPLOYMENT_ORIGIN ?? "https://matter.ptoq.io",
    expectedVersion: packageMetadata.version,
    profile,
    waitMs,
  });
  if (result.failures.length > 0) {
    console.error(result.failures.map((failure) => `deployment: ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`deployment: ${result.origin} matches Matter ${packageMetadata.version} after ${result.attempts} probe(s)`);
}

function parseArguments(args) {
  let origin;
  let profile = "browser-preview";
  let waitMs = 0;
  for (const value of args) {
    if (value.startsWith("--wait=")) {
      const seconds = Number(value.slice("--wait=".length));
      if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 300) {
        throw new Error("--wait must be a whole number of seconds from 0 to 300.");
      }
      waitMs = seconds * 1_000;
      continue;
    }
    if (value.startsWith("--profile=")) {
      profile = value.slice("--profile=".length);
      if (!DEPLOYMENT_PROFILES.has(profile)) {
        throw new Error("--profile must be browser-preview or elastic-live.");
      }
      continue;
    }
    if (origin !== undefined) {
      throw new Error(
        "Deployment check accepts one origin, --profile=<name>, and --wait=<seconds>.",
      );
    }
    origin = value;
  }
  return Object.freeze({ origin, profile, waitMs });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`deployment: ${error instanceof Error ? error.message : "check failed"}`);
    process.exitCode = 1;
  });
}
