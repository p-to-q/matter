import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_ORIGIN = "https://matter.ptoq.io";
export const DEFAULT_PACE_SECONDS = 8;
export const MAX_CALLS_PER_SURFACE = 50;

export function parseArguments(args) {
  let origin;
  let expectedVersion;
  let profile = "smoke";
  let callsPerSurface;
  let paceSeconds = DEFAULT_PACE_SECONDS;
  let execute = false;
  let allowRemote = false;
  let productionLiteral;

  for (const value of args) {
    if (value === "--execute") {
      execute = true;
      continue;
    }
    if (value === "--allow-remote") {
      allowRemote = true;
      continue;
    }
    if (value.startsWith("--expected-version=")) {
      expectedVersion = value.slice("--expected-version=".length);
      continue;
    }
    if (value.startsWith("--profile=")) {
      profile = value.slice("--profile=".length);
      continue;
    }
    if (value.startsWith("--calls-per-surface=")) {
      callsPerSurface = wholeNumber(
        value.slice("--calls-per-surface=".length),
        1,
        MAX_CALLS_PER_SURFACE,
        "--calls-per-surface",
      );
      continue;
    }
    if (value.startsWith("--pace-seconds=")) {
      paceSeconds = wholeNumber(value.slice("--pace-seconds=".length), 8, 300, "--pace-seconds");
      continue;
    }
    if (value.startsWith("--allow-production=")) {
      productionLiteral = value.slice("--allow-production=".length);
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown material probe option ${value}.`);
    if (origin !== undefined) throw new Error("The material probe accepts exactly one origin.");
    origin = value;
  }

  if (origin === undefined || expectedVersion === undefined) {
    throw new Error("The material probe requires an explicit HTTPS origin and --expected-version=<version>.");
  }
  if (profile !== "smoke" && profile !== "promotion") {
    throw new Error("--profile must be smoke or promotion.");
  }
  const normalizedOrigin = normalizeOrigin(origin);
  const resolvedCalls = callsPerSurface ?? (profile === "promotion" ? MAX_CALLS_PER_SURFACE : 1);
  if (profile === "smoke" && resolvedCalls !== 1) {
    throw new Error("The smoke profile makes exactly one call per surface.");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/u.test(expectedVersion)) {
    throw new Error("--expected-version must be one bounded version identifier.");
  }
  return Object.freeze({
    origin: normalizedOrigin,
    expectedVersion,
    profile,
    callsPerSurface: resolvedCalls,
    paceMs: paceSeconds * 1_000,
    execute,
    allowRemote,
    productionLiteral,
  });
}

export function authorizeExecution(parsed, environment) {
  if (!parsed.execute) return Object.freeze({ mode: "dry-run", config: parsed });
  const hostname = new URL(parsed.origin).hostname;
  if (!isLoopbackHostname(hostname)) {
    if (!parsed.allowRemote || environment.MATTER_SYNTHETIC_PROBE_ORIGIN !== parsed.origin) {
      throw new Error(
        "Remote execution requires --allow-remote and MATTER_SYNTHETIC_PROBE_ORIGIN matching the exact origin.",
      );
    }
  }
  if (parsed.origin === PRODUCTION_ORIGIN && parsed.productionLiteral !== PRODUCTION_ORIGIN) {
    throw new Error(`Production execution requires --allow-production=${PRODUCTION_ORIGIN}.`);
  }
  return Object.freeze({
    mode: "execute",
    config: Object.freeze({
      ...parsed,
      confirmationOrigin: environment.MATTER_SYNTHETIC_PROBE_ORIGIN,
    }),
  });
}

export async function runCli({
  args = process.argv.slice(2),
  environment = process.env,
  executeReceipt = spawnReceipt,
  write = (line) => console.log(line),
} = {}) {
  const parsed = parseArguments(args);
  const authorized = authorizeExecution(parsed, environment);
  if (authorized.mode === "dry-run") {
    write(
      `material-origin: dry-run only; ${parsed.profile} plans ${parsed.callsPerSurface}+${parsed.callsPerSurface}` +
        ` calls at ${parsed.paceMs / 1_000}s spacing for ${parsed.origin}; no network was used`,
    );
    return 0;
  }
  return executeReceipt(authorized.config, environment);
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("The material probe requires an HTTPS origin without credentials.");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("The material probe origin must not include a path, query, or fragment.");
  }
  return url.origin;
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function wholeNumber(raw, minimum, maximum, flag) {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

async function spawnReceipt(config, environment) {
  const executable = resolve("node_modules/@playwright/test/cli.js");
  const child = spawn(process.execPath, [
    executable,
    "test",
    "material-origin-api.spec.ts",
    "--config=playwright.material-origin-api.config.ts",
  ], {
    env: {
      ...environment,
      MATTER_MATERIAL_ORIGIN_PROBE_CONFIG: JSON.stringify(config),
    },
    stdio: "inherit",
  });
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`material-origin: ${error instanceof Error ? error.message : "probe failed"}`);
    process.exitCode = 1;
  });
}
