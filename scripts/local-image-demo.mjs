import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertLocalDemoPortAvailable,
  createLocalAiDemoEnvironment,
  localAiDemoExitCode,
} from "./local-ai-demo.mjs";

// `npm run dev:image`: the localhost picture demo. It sets environment and
// starts processes; it never reads, prints, or copies a value from .env.local
// beyond handing the loaded environment to Next, and it changes no production
// path. The relays are REAL by default (the developer's own .env.local pools).
// `--fake-image` replaces ONLY the image pool with a loopback relay.
// The PNG is generated from FIXTURE_IMAGE_DATA_URL in
// features/matter/server/image-fixtures.ts by writing its base64 payload to
// scripts/fixtures/local-image-demo.png (scripts/local-image-demo.contract.test.ts
// fails if the file drifts from that builder).

const DEFAULT_PORT = 3000;
const DEFAULT_BASE_PATH = "/matter";
const NEXT_BIN = resolve("node_modules/next/dist/bin/next");
const FIXTURE_PNG_URL = new URL("./fixtures/local-image-demo.png", import.meta.url);

export const DEFAULT_IMAGE_DELAY_MS = 4_000;
export const MAX_IMAGE_DELAY_MS = 30_000;
export const MAX_IMAGE_FAIL_EVERY = 1_000;
export const SLOW_IMAGE_DELAY_MS = 45_000;
export const RELAY_BODY_CAP_BYTES = 64 * 1_024;
// After an oversize 413 the socket is dropped once this many further bytes arrive.
const OVERFLOW_DRAIN_CAP_BYTES = 1_024 * 1_024;

const FAKE_STATION = "LOCAL_FAKE";
const FAKE_MODEL = "local-fake-image";
const IMAGE_STATION_NAME = /^[A-Za-z0-9_-]{1,32}$/u;

const IMAGE_ENV_HINT =
  "Add an image relay to .env.local (see the MATTER_IMAGE_* block in .env.example): " +
  "MATTER_IMAGE_POOL=<station>, then MATTER_IMAGE_<STATION>_BASE_URL, " +
  "MATTER_IMAGE_<STATION>_API_KEY, MATTER_IMAGE_<STATION>_MODELS and " +
  "MATTER_IMAGE_<STATION>_SHAPE (chat or images). " +
  "To try the picture flow with no image relay at all, run: npm run dev:image -- --fake-image";

export function parseLocalImageDemoArguments(args) {
  let port = DEFAULT_PORT;
  let fakeImage = false;
  let imageShape = "images";
  let imageDelayMs = DEFAULT_IMAGE_DELAY_MS;
  let imageFailEvery = 0;
  let imageSlow = false;
  const relayFlags = [];
  for (const value of args) {
    if (value === "--fake-image") {
      fakeImage = true;
      continue;
    }
    if (value === "--image-slow") {
      imageSlow = true;
      relayFlags.push("--image-slow");
      continue;
    }
    if (value.startsWith("--port=")) {
      port = wholeNumber(value.slice("--port=".length), 1_024, 65_535, "--port must be a whole number from 1024 to 65535.");
      continue;
    }
    if (value.startsWith("--image-delay=")) {
      imageDelayMs = wholeNumber(
        value.slice("--image-delay=".length),
        0,
        MAX_IMAGE_DELAY_MS,
        `--image-delay must be a whole number of milliseconds from 0 to ${MAX_IMAGE_DELAY_MS}.`,
      );
      relayFlags.push("--image-delay");
      continue;
    }
    if (value.startsWith("--image-fail=")) {
      imageFailEvery = wholeNumber(
        value.slice("--image-fail=".length),
        1,
        MAX_IMAGE_FAIL_EVERY,
        `--image-fail must be a whole number from 1 to ${MAX_IMAGE_FAIL_EVERY}.`,
      );
      relayFlags.push("--image-fail");
      continue;
    }
    if (value.startsWith("--image-shape=")) {
      const shape = value.slice("--image-shape=".length);
      if (shape !== "images" && shape !== "chat") throw new Error("--image-shape must be images or chat.");
      imageShape = shape;
      relayFlags.push("--image-shape");
      continue;
    }
    throw new Error(`Unknown local image demo option: ${value}`);
  }
  if (!fakeImage && relayFlags.length > 0) {
    throw new Error(`${relayFlags[0]} configures the fake image relay and needs --fake-image.`);
  }
  return Object.freeze({ fakeImage, imageDelayMs, imageFailEvery, imageShape, imageSlow, port });
}

function wholeNumber(text, minimum, maximum, message) {
  const parsed = /^[0-9]{1,9}$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(message);
  return parsed;
}

/**
 * Validates the developer's image stations with the runtime parser's grammar.
 * Messages name variables, never values.
 */
export function assertConfiguredImagePool(environment) {
  const stations = (environment.MATTER_IMAGE_POOL ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (stations.length === 0) {
    throw new Error(`No image station is configured (MATTER_IMAGE_POOL is empty). ${IMAGE_ENV_HINT}`);
  }
  for (const station of stations) {
    if (!IMAGE_STATION_NAME.test(station)) {
      throw new Error("MATTER_IMAGE_POOL contains an invalid station name (letters, digits, - and _, up to 32).");
    }
    const prefix = `MATTER_IMAGE_${station.toUpperCase().replaceAll("-", "_")}`;
    const baseUrl = environment[`${prefix}_BASE_URL`]?.trim() ?? "";
    const apiKey = environment[`${prefix}_API_KEY`]?.trim() ?? "";
    const models = (environment[`${prefix}_MODELS`] ?? "")
      .split(",")
      .map((model) => model.trim())
      .filter((model) => model !== "");
    const shape = environment[`${prefix}_SHAPE`]?.trim() ?? "";
    for (const [name, present] of [
      [`${prefix}_BASE_URL`, baseUrl !== ""],
      [`${prefix}_API_KEY`, apiKey !== ""],
      [`${prefix}_MODELS`, models.length > 0],
    ]) {
      if (!present) throw new Error(`Image station "${station}" is incomplete: ${name} is missing or empty. ${IMAGE_ENV_HINT}`);
    }
    if (shape !== "chat" && shape !== "images") {
      throw new Error(`Image station "${station}": ${prefix}_SHAPE must be exactly chat or images.`);
    }
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error(`Image station "${station}": ${prefix}_BASE_URL must be an absolute URL.`);
    }
    // Match the runtime pool parser exactly; a broader check would claim
    // readiness for a station the provider boundary silently discards.
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      throw new Error(`Image station "${station}": ${prefix}_BASE_URL must use HTTPS, except for a loopback relay.`);
    }
  }
}

/**
 * The child environment. The chat pool and every non-image flag come from
 * `createLocalAiDemoEnvironment` untouched (the developer's own pool). The image
 * gate is always live; the image pool is the developer's own unless the fake
 * relay was asked for, in which case every inherited MATTER_IMAGE_* variable is
 * dropped and only the loopback station is set. Next's own .env.local load
 * never overrides a variable already present in this environment.
 */
export function createLocalImageDemoEnvironment(environment, options, fakeRelay = null) {
  if (options.fakeImage && fakeRelay === null) {
    throw new Error("The fake image relay must be listening before the environment is built.");
  }
  if (!options.fakeImage) assertConfiguredImagePool(environment);
  const inherited = options.fakeImage
    ? Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("MATTER_IMAGE_")))
    : environment;
  const base = createLocalAiDemoEnvironment(inherited, {
    liveLabel: false,
    liveTransform: false,
    port: options.port,
  });
  return Object.freeze({
    ...base,
    MATTER_IMAGE_ADAPTER: "live",
    ...(options.fakeImage
      ? {
          MATTER_IMAGE_POOL: "local-fake",
          [`MATTER_IMAGE_${FAKE_STATION}_BASE_URL`]: fakeRelay.baseUrl,
          [`MATTER_IMAGE_${FAKE_STATION}_API_KEY`]: fakeRelay.apiKey,
          [`MATTER_IMAGE_${FAKE_STATION}_MODELS`]: FAKE_MODEL,
          [`MATTER_IMAGE_${FAKE_STATION}_SHAPE`]: options.imageShape,
        }
      : {}),
  });
}

/** Plain-text banner. Never contains a key, endpoint, or model name. */
export function localImageDemoSummary(environment, options, fakeRelay = null) {
  const basePath = environment.MATTER_BASE_PATH ?? DEFAULT_BASE_PATH;
  const url = `http://localhost:${options.port}${basePath}`;
  const lines = [
    `Matter local picture demo: ${url}`,
    "",
  ];
  if (options.fakeImage) {
    lines.push(
      "RELAYS: chat = REAL (your .env.local model pool), image = FAKE (loopback relay on this machine).",
      "The real chat relay spends your model credits for the brief, Ask, Repair and Point Talk. The picture itself costs nothing.",
      `fake image relay: 127.0.0.1:${fakeRelay?.port ?? "?"}, shape=${options.imageShape}, ` +
        `delay=${options.imageSlow ? `${SLOW_IMAGE_DELAY_MS}ms (--image-slow)` : `${options.imageDelayMs}ms`}, ` +
        `failure=${options.imageFailEvery > 0 ? `every ${options.imageFailEvery}th request` : "never"}.`,
    );
  } else {
    lines.push(
      "RELAYS: chat = REAL (your .env.local model pool), image = REAL (your .env.local MATTER_IMAGE_* station).",
      "REAL RELAYS SPEND YOUR CREDITS: every Draw is one text call plus one paid image generation.",
    );
  }
  lines.push(
    "Nothing is read from or written to production. Next binds to 127.0.0.1 only. authority: local-demo; productionGo=false",
    "Rate limit: the live image gate allows 3 drawings per minute per origin; a fourth waits for the window.",
    "",
    "Try it:",
    `  1. Open ${url} (the first compile takes a few seconds) and click a passage.`,
    "  2. Click the AI mark on the passage to open Point and Talk.",
    "  3. Between Voice and the black button find the picture control: \"绘图\" (zh-CN, the default language) or \"Draw\" (en-US).",
    "     Click it to arm (it states the cost), then press \"开始绘图\" / \"Draw\". It shows \"正在绘图…\" / \"Drawing…\" while it waits.",
    "     Labels are provisional in every locale except en-US.",
    "  4. When the preview appears press \"保留\" / \"Keep\". The picture is now in the passage. Use Undo and Redo in the tool rail.",
    "  5. Reload the page; the picture stays.",
    "  6. Open Archive, Export ZIP, then import that ZIP back (Replace); the picture comes back.",
    "",
    options.fakeImage
      ? "Simulate trouble by restarting with: --image-delay=<ms> (0-30000), --image-fail=<N> (every Nth request returns HTTP 500), --image-slow (answers after 45 s: exercise \"不再等待\" / \"Stop waiting\" and the 53 s client deadline), --image-shape=images|chat."
      : "To simulate delay or failure without spending credits, restart with --fake-image plus --image-delay=<ms>, --image-fail=<N>, --image-slow or --image-shape=images|chat.",
    "Stop with Ctrl-C.",
  );
  return Object.freeze(lines);
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function keyMatches(header, expectedDigest) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice("Bearer ".length)), expectedDigest);
}

function sendJson(response, status, body, extra = {}) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  response.end(text);
}

/** Resolves a Buffer, or null once more than `cap` bytes were declared or seen. */
function readCapped(request, cap) {
  return new Promise((resolveBody) => {
    const chunks = [];
    let seen = 0;
    let over = false;
    const declared = request.headers["content-length"];
    if (declared !== undefined && Number(declared) > cap) {
      overflow();
      return;
    }
    request.on("data", (chunk) => {
      seen += chunk.length;
      if (over) {
        if (seen > cap + OVERFLOW_DRAIN_CAP_BYTES) request.socket.destroy();
        return;
      }
      if (seen > cap) {
        overflow();
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => {
      if (!over) resolveBody(Buffer.concat(chunks));
    });
    request.once("error", () => {
      if (!over) resolveBody(null);
    });
    function overflow() {
      over = true;
      resolveBody(null);
      request.resume();
    }
  });
}

/**
 * A loopback-only, key-gated, POST-only JSON relay. Auth comes first, so an
 * unkeyed caller learns nothing about methods or paths.
 */
function createRelayServer({ apiKey, path, handle }) {
  const expected = digest(apiKey);
  const server = createServer(async (request, response) => {
    try {
      if (!keyMatches(request.headers.authorization, expected)) {
        sendJson(response, 401, { error: "unauthorized" });
        request.resume();
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "method not allowed" }, { allow: "POST" });
        request.resume();
        return;
      }
      if (new URL(request.url ?? "/", "http://127.0.0.1").pathname !== path) {
        sendJson(response, 404, { error: "not found" });
        request.resume();
        return;
      }
      const body = await readCapped(request, RELAY_BODY_CAP_BYTES);
      if (body === null) {
        sendJson(response, 413, { error: "body too large" }, { connection: "close" });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        sendJson(response, 400, { error: "invalid json" });
        return;
      }
      await handle(payload, request, response);
    } catch {
      if (!response.headersSent) sendJson(response, 500, { error: "relay error" });
      else response.destroy();
    }
  });
  return server;
}

/**
 * The fake image relay. It speaks one of the two reviewed shapes, answers
 * with the checked-in PNG after an artificial delay, and exists only on
 * 127.0.0.1 behind a random per-run bearer key.
 */
export function createFakeImageRelay(options = {}) {
  const shape = options.shape ?? "images";
  const delayMs = options.delayMs ?? DEFAULT_IMAGE_DELAY_MS;
  const failEvery = options.failEvery ?? 0;
  const slowMs = options.slow === true ? (options.slowMs ?? SLOW_IMAGE_DELAY_MS) : null;
  const apiKey = options.apiKey ?? randomBytes(24).toString("hex");
  const png = options.png ?? readFileSync(FIXTURE_PNG_URL);
  const encoded = png.toString("base64");
  const sha256 = createHash("sha256").update(png).digest("hex");
  let requests = 0;

  const server = createRelayServer({
    apiKey,
    path: shape === "images" ? "/v1/images/generations" : "/v1/chat/completions",
    handle: async (_payload, request, response) => {
      requests += 1;
      const failing = failEvery > 0 && requests % failEvery === 0;
      const wait = slowMs ?? delayMs;
      const arrived = await new Promise((resolveWait) => {
        const timer = setTimeout(() => resolveWait(true), wait);
        response.once("close", () => {
          clearTimeout(timer);
          resolveWait(false);
        });
      });
      // The caller gave up (Stop waiting, deadline); nothing is left to answer.
      if (!arrived || response.destroyed) return;
      if (failing) {
        sendJson(response, 500, { error: { message: "simulated relay failure" } });
        return;
      }
      if (shape === "images") {
        sendJson(response, 200, { created: Math.floor(Date.now() / 1_000), data: [{ b64_json: encoded }] });
        return;
      }
      sendJson(response, 200, {
        id: "chatcmpl-local-fake",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1_000),
        model: FAKE_MODEL,
        choices: [{
          index: 0,
          message: { role: "assistant", content: `![image](data:image/png;base64,${encoded})` },
          finish_reason: "stop",
        }],
      });
    },
  });

  return {
    apiKey,
    shape,
    sha256,
    get requests() {
      return requests;
    },
    server,
    async listen() {
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
      });
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("The fake image relay has no address.");
      return Object.freeze({
        apiKey,
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        host: address.address,
        port: address.port,
      });
    },
    close() {
      return new Promise((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
}

async function main() {
  const options = parseLocalImageDemoArguments(process.argv.slice(2));
  // The developer's own pools live here; the values stay in memory and are
  // only handed to Next. Nothing below prints any of them.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  // Fail on configuration before opening a relay or a port.
  const probeRelay = options.fakeImage ? { apiKey: "probe", baseUrl: "http://127.0.0.1:1/v1", port: 1 } : null;
  createLocalImageDemoEnvironment(process.env, options, probeRelay);
  await assertLocalDemoPortAvailable(options.port);

  const relay = options.fakeImage
    ? createFakeImageRelay({
        shape: options.imageShape,
        delayMs: options.imageDelayMs,
        failEvery: options.imageFailEvery,
        slow: options.imageSlow,
      })
    : null;
  try {
    const listening = relay === null ? null : await relay.listen();
    const environment = createLocalImageDemoEnvironment(process.env, options, listening);
    for (const line of localImageDemoSummary(environment, options, listening)) console.log(line);

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
      process.exitCode = await new Promise((resolveExit, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          resolveExit(localAiDemoExitCode(code, signal, forwardedSignal));
        });
      });
    } finally {
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTerminate);
    }
  } finally {
    await relay?.close();
  }
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`local-image: ${error instanceof Error ? error.message : "could not start"}`);
    process.exitCode = 1;
  });
}
