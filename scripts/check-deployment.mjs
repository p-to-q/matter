import { readFile } from "node:fs/promises";
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
  "archiveExportImport",
];
const SURFACE_STATES = new Set(["available", "fixture", "unavailable", "not-implemented"]);

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

export function inspectDeploymentHealth(value, expectedVersion) {
  const failures = [];
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
  if (value.surfaces.voiceAdmission !== "available") {
    failures.push("Public voice admission is not available.");
  }
  if (value.surfaces.transformTurn !== "not-implemented") {
    failures.push("Transform health claim changed; update the release boundary before deploying.");
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

export async function checkDeployment({ origin, expectedVersion, fetchImpl = fetch }) {
  const normalized = normalizeDeploymentOrigin(origin);
  const request = (path, init = {}) => fetchImpl(`${normalized}${path}`, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  const [root, legacy, health] = await Promise.all([
    request("/"),
    request("/matter"),
    request("/api/health"),
  ]);
  const failures = [];
  if (root.status !== 200) failures.push(`Root returned HTTP ${root.status}.`);
  if (legacy.status !== 404) failures.push(`Legacy /matter returned HTTP ${legacy.status}, expected 404.`);
  if (health.status !== 200) {
    failures.push(`Health probe returned HTTP ${health.status}.`);
  } else {
    let payload;
    try {
      payload = await health.json();
    } catch {
      failures.push("Health probe did not return JSON.");
    }
    if (payload !== undefined) failures.push(...inspectDeploymentHealth(payload, expectedVersion));
  }
  failures.push(...inspectDeploymentHeaders(root.headers));
  return Object.freeze({ origin: normalized, failures: Object.freeze(failures) });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
  const origin = process.argv[2] ?? process.env.MATTER_DEPLOYMENT_ORIGIN ?? "https://matter.ptoq.io";
  const result = await checkDeployment({ origin, expectedVersion: packageMetadata.version });
  if (result.failures.length > 0) {
    console.error(result.failures.map((failure) => `deployment: ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`deployment: ${result.origin} matches Matter ${packageMetadata.version}`);
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`deployment: ${error instanceof Error ? error.message : "check failed"}`);
    process.exitCode = 1;
  });
}
