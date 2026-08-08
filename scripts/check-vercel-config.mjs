import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Vercel rejects a deployment whose `buildCommand` exceeds this length during
 * schema validation — before any build step runs, so no build log exists to
 * read. Carrying the product build shape as an environment prefix inside the
 * command crossed this bound and silently froze the dedicated domain on an old
 * version for eight consecutive production deployments. The build shape belongs
 * in `build.env`, and the bound belongs in a test rather than in memory.
 */
export const VERCEL_BUILD_COMMAND_MAX_LENGTH = 256;

/**
 * Values that must exist while the bundle is produced. `next.config.ts` reads
 * the base path, the seed, and the transcription adapter, and the SEO module
 * resolves the public origin at module load during prerender. A missing entry
 * does not fail the build: it ships the wrong product — a `/matter` base path
 * on the dedicated domain, a fixture seed, or a client with no voice control.
 */
export const DEDICATED_DOMAIN_BUILD_SHAPE = Object.freeze({
  MATTER_BASE_PATH: "",
  MATTER_INITIAL_DOCUMENT: "root",
  MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
  MATTER_TRANSCRIPTION_ADAPTER: "browser",
  NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "true",
  NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
  NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: "true",
});

/**
 * The subset the server re-reads per request. The health probe derives its base
 * path and voice-admission claim from these, so a build-only declaration would
 * report an untruthful capability on the deployed origin. The `NEXT_PUBLIC_*`
 * flags are absent on purpose: the build inlines them, and declaring them at
 * runtime would assert a dependency that does not exist.
 */
export const DEDICATED_DOMAIN_RUNTIME_SHAPE = Object.freeze({
  MATTER_BASE_PATH: "",
  MATTER_PUBLIC_ORIGIN: "https://matter.ptoq.io",
  MATTER_TRANSCRIPTION_ADAPTER: "browser",
});

// This file is committed to a world-readable repository. A provider credential
// placed here cannot be retracted by deleting it later.
const SECRET_KEY_PATTERN = /API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY/i;
const SECRET_VALUE_PATTERN = /^[A-Za-z]{2,4}-[A-Za-z0-9_-]{16,}$/;

export function inspectVercelConfig(config) {
  if (!isRecord(config)) return ["vercel.json is not a JSON object."];

  const failures = [];
  const buildEnv = isRecord(config.build) ? config.build.env : undefined;
  const runtimeEnv = config.env;

  if (config.framework !== "nextjs") {
    failures.push("vercel.json must declare the nextjs framework preset.");
  }

  if (typeof config.buildCommand !== "string") {
    failures.push("vercel.json must declare an explicit buildCommand.");
  } else if (config.buildCommand.length > VERCEL_BUILD_COMMAND_MAX_LENGTH) {
    failures.push(
      `buildCommand is ${config.buildCommand.length} characters; Vercel rejects more than ${VERCEL_BUILD_COMMAND_MAX_LENGTH}. Declare build values in build.env instead of prefixing the command.`,
    );
  }

  // The model pool is reached from the function, not from the visitor, so the
  // region is a latency budget: repair's deadline is ~1.5s for a short
  // utterance, and a cross-Pacific hop spent most of it before the provider
  // had answered. Losing this pins the pool-backed scenarios back to a
  // silent verbatim floor.
  if (!Array.isArray(config.regions) || config.regions.length === 0) {
    failures.push("vercel.json must pin a function region close to the model pool.");
  }

  failures.push(...inspectShape("build.env", buildEnv, DEDICATED_DOMAIN_BUILD_SHAPE));
  failures.push(...inspectShape("env", runtimeEnv, DEDICATED_DOMAIN_RUNTIME_SHAPE));
  failures.push(...inspectAgreement(buildEnv, runtimeEnv));
  failures.push(...inspectSecrets("build.env", buildEnv));
  failures.push(...inspectSecrets("env", runtimeEnv));

  return failures;
}

/**
 * A value declared on both sides describes one deployment, so the two sides
 * cannot disagree. Drift here is silent: the client would be built from one
 * answer while the health probe reported the other, and the deployed origin
 * would then advertise a capability the bundle does not have.
 */
function inspectAgreement(buildEnv, runtimeEnv) {
  if (!isRecord(buildEnv) || !isRecord(runtimeEnv)) return [];

  const failures = [];
  for (const [key, value] of Object.entries(buildEnv)) {
    if (key in runtimeEnv && runtimeEnv[key] !== value) {
      failures.push(
        `vercel.json ${key} is ${JSON.stringify(value)} at build and ${JSON.stringify(runtimeEnv[key])} at runtime.`,
      );
    }
  }
  return failures;
}

function inspectShape(label, env, shape) {
  if (!isRecord(env)) return [`vercel.json ${label} is missing.`];

  const failures = [];
  for (const [key, expected] of Object.entries(shape)) {
    if (!(key in env)) {
      failures.push(`vercel.json ${label} is missing ${key}.`);
      continue;
    }
    if (env[key] !== expected) {
      failures.push(
        `vercel.json ${label} ${key} is ${JSON.stringify(env[key])}, expected ${JSON.stringify(expected)}.`,
      );
    }
  }
  return failures;
}

function inspectSecrets(label, env) {
  if (!isRecord(env)) return [];

  const failures = [];
  for (const [key, value] of Object.entries(env)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      failures.push(`vercel.json ${label} declares ${key}; secrets belong in the encrypted Vercel store.`);
      continue;
    }
    if (typeof value === "string" && SECRET_VALUE_PATTERN.test(value)) {
      failures.push(`vercel.json ${label} ${key} holds a credential-shaped value; rotate it and move it to the encrypted Vercel store.`);
    }
  }
  return failures;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const failures = inspectVercelConfig(config);
  if (failures.length > 0) {
    console.error(failures.map((failure) => `vercel: ${failure}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("vercel: deployment configuration matches the dedicated-domain build shape");
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`vercel: ${error instanceof Error ? error.message : "check failed"}`);
    process.exitCode = 1;
  });
}
