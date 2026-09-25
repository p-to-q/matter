import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 3000;
const DEFAULT_BASE_PATH = "/matter";
const NEXT_BIN = resolve("node_modules/next/dist/bin/next");

export function parseLocalAiDemoArguments(args) {
  let port = DEFAULT_PORT;
  let liveLabel = false;
  let liveTransform = false;
  for (const value of args) {
    if (value === "--live-transform") {
      liveTransform = true;
      continue;
    }
    if (value === "--live-label") {
      liveLabel = true;
      continue;
    }
    if (value.startsWith("--port=")) {
      const parsed = Number(value.slice("--port=".length));
      if (!Number.isSafeInteger(parsed) || parsed < 1_024 || parsed > 65_535) {
        throw new Error("--port must be a whole number from 1024 to 65535.");
      }
      port = parsed;
      continue;
    }
    throw new Error(`Unknown local AI demo option: ${value}`);
  }
  return Object.freeze({ liveLabel, liveTransform, port });
}

export function createLocalAiDemoEnvironment(environment, options) {
  assertConfiguredPool(environment);
  return Object.freeze({
    ...environment,
    MATTER_BASE_PATH: environment.MATTER_BASE_PATH ?? DEFAULT_BASE_PATH,
    MATTER_TRANSCRIPTION_ADAPTER: "browser",
    NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "true",
    NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
    NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: "true",
    NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: "true",
    MATTER_LABEL_ADAPTER: options.liveLabel ? "live" : "fixture",
    MATTER_REPAIR_ADAPTER: "live",
    MATTER_INQUIRY_ADAPTER: "live",
    MATTER_TRANSFORM_ADAPTER: options.liveTransform ? "live" : "fixture",
    MATTER_TEXT_SWAP_ADAPTER: "live",
  });
}

export function assertConfiguredPool(environment) {
  const canonical = environment.MATTER_MODEL_POOL?.trim() ?? "";
  const legacy = environment.MATTER_LABEL_POOL?.trim() ?? "";
  if (canonical !== "" && legacy !== "") {
    throw new Error("Use exactly one model-pool namespace; both MODEL and legacy LABEL pools are set.");
  }
  const namespace = canonical !== "" ? "MODEL" : legacy !== "" ? "LABEL" : null;
  const stations = (canonical || legacy)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (namespace === null || stations.length === 0) {
    throw new Error("A model pool must be configured in .env.local before starting the AI demo.");
  }
  for (const station of stations) {
    if (!/^[A-Za-z0-9_-]{1,32}$/u.test(station)) {
      throw new Error("The configured model pool contains an invalid station name.");
    }
    const prefix = `MATTER_${namespace}_${station.toUpperCase().replaceAll("-", "_")}`;
    const baseUrl = environment[`${prefix}_BASE_URL`]?.trim() ?? "";
    const apiKey = environment[`${prefix}_API_KEY`]?.trim() ?? "";
    const models = (environment[`${prefix}_MODELS`] ?? "")
      .split(",")
      .map((model) => model.trim())
      .filter((model) => model !== "");
    const thinking = environment[`${prefix}_ENABLE_THINKING`];
    if (baseUrl === "" || apiKey === "" || models.length === 0) {
      throw new Error("Every configured model-pool station needs a base URL, key, and model list.");
    }
    if (thinking !== undefined && thinking !== "true" && thinking !== "false") {
      throw new Error("A model-pool thinking declaration must be exactly true or false.");
    }
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error("Every model-pool base URL must be an absolute URL.");
    }
    // Match the runtime pool parser exactly. A broader launcher check would
    // claim readiness for a station the actual provider boundary discards.
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      throw new Error("Model-pool base URLs must use HTTPS, except for a loopback provider.");
    }
  }
}

export function localAiDemoSummary(environment, options) {
  const basePath = environment.MATTER_BASE_PATH ?? DEFAULT_BASE_PATH;
  const transform = options.liveTransform ? "live (experimental)" : "fixture (stable plan/commit/Undo path)";
  const label = options.liveLabel ? "live (opening material may call the provider)" : "fixture (no provider call on page open)";
  const privacy = options.liveLabel
    ? "privacy: opening or using the page may send visible material, questions, and directions to the configured provider pool."
    : `privacy: opening the page sends no provider request; using Repair, Inquiry, Point Talk${options.liveTransform ? ", or live Elastic" : ""} may send the material needed for that action.`;
  return Object.freeze([
    `Matter local AI demo: http://127.0.0.1:${options.port}${basePath}`,
    "provider-backed when invoked: transcript repair, Inquiry",
    `Thought labels: ${label}`,
    "Point Talk: live (localhost evaluation; not production-promoted)",
    `Elastic Language: ${transform}`,
    "Voice: browser speech when supported; otherwise local Whisper. Matter's server never receives raw audio",
    "privacy: browser speech may use the browser or operating system's own speech service.",
    "authority: local-demo; productionGo=false",
    privacy,
  ]);
}

export function localAiDemoExitCode(code, signal, forwardedSignal) {
  if (code !== null) return code;
  if (signal !== null && signal === forwardedSignal) return 0;
  return 1;
}

/** Refuses a split localhost where IPv4 and IPv6 serve different builds. */
export async function assertLocalDemoPortAvailable(
  port,
  probe = probeLoopbackHost,
) {
  for (const host of ["127.0.0.1", "::1"]) {
    try {
      await probe(host, port);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? error.code
        : null;
      if (code === "EAFNOSUPPORT" || code === "EADDRNOTAVAIL") continue;
      throw new Error(`Port ${port} is already in use on localhost (${host}).`, {
        cause: error,
      });
    }
  }
}

function probeLoopbackHost(host, port) {
  return new Promise((resolveProbe, rejectProbe) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectProbe);
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => error === undefined ? resolveProbe() : rejectProbe(error));
    });
  });
}

async function main() {
  const options = parseLocalAiDemoArguments(process.argv.slice(2));
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const environment = createLocalAiDemoEnvironment(process.env, options);
  await assertLocalDemoPortAvailable(options.port);
  for (const line of localAiDemoSummary(environment, options)) console.log(line);

  const child = spawn(process.execPath, [
    NEXT_BIN,
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(options.port),
  ], {
    env: environment,
    stdio: "inherit",
  });
  let forwardedSignal = null;
  const forwardInterrupt = () => {
    forwardedSignal = "SIGINT";
    child.kill(forwardedSignal);
  };
  const forwardTerminate = () => {
    forwardedSignal = "SIGTERM";
    child.kill(forwardedSignal);
  };
  process.once("SIGINT", forwardInterrupt);
  process.once("SIGTERM", forwardTerminate);
  try {
    const exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolveExit(localAiDemoExitCode(code, signal, forwardedSignal));
      });
    });
    process.exitCode = exitCode;
  } finally {
    process.off("SIGINT", forwardInterrupt);
    process.off("SIGTERM", forwardTerminate);
  }
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`local-ai: ${error instanceof Error ? error.message : "could not start"}`);
    process.exitCode = 1;
  });
}
