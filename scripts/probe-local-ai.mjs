import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  MAX_INQUIRY_RESPONSE_BYTES,
  MAX_LABEL_RESPONSE_BYTES,
  MAX_REPAIR_RESPONSE_BYTES,
  classifyResponse,
  inquiryRequest,
  labelRequest,
  repairRequest,
} from "./probe-model-pool.mjs";

const APP_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const DEFAULT_ORIGIN = "http://127.0.0.1:3000/matter";
const RESPONSE_BYTE_LIMITS = Object.freeze({
  repair: MAX_REPAIR_RESPONSE_BYTES,
  label: MAX_LABEL_RESPONSE_BYTES,
  inquiry: MAX_INQUIRY_RESPONSE_BYTES,
  transform: 8 * 1_024,
  "text-swap": 8 * 1_024,
});
const ROUTE_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 5_000;
const SURFACES = Object.freeze(["repair", "label", "inquiry", "transform", "text-swap"]);
const HEALTH_SURFACE_KEYS = Object.freeze([
  "archiveExportImport",
  "inquiry",
  "localPersistence",
  "material",
  "textSwap",
  "thoughtLabel",
  "transcriptRepair",
  "transformTurn",
  "voiceAdmission",
]);
const HEALTH_STATES = new Set(["available", "fixture", "unavailable"]);
const CLOSED_FALLBACK_REASONS = new Set([
  "MODEL_BUSY",
  "MODEL_REJECTED",
  "MODEL_TIMEOUT",
  "MODEL_UNAVAILABLE",
]);

export function parseLocalAiProbeArguments(args) {
  let execute = false;
  let origin = DEFAULT_ORIGIN;
  for (const value of args) {
    if (value === "--execute") {
      execute = true;
      continue;
    }
    if (value.startsWith("--origin=")) {
      origin = value.slice("--origin=".length);
      continue;
    }
    throw new Error(`Unknown local AI probe option: ${value}`);
  }
  return Object.freeze({ execute, origin: normalizeLoopbackOrigin(origin) });
}

export function normalizeLoopbackOrigin(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback) {
    throw new Error("The local AI probe accepts only a plain-HTTP loopback Matter origin.");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("The local AI probe origin cannot contain credentials, a query, or a fragment.");
  }
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/u, "");
  return `${url.origin}${basePath}`;
}

export function localAiRequests(runId = "localai") {
  const transformText = "我一直觉得，这件事可能没那么重要。";
  const transformPassage = "这件事可能没那么重要";
  const transformStart = transformText.indexOf(transformPassage);
  const swapText = "房间慢慢安静下来";
  return Object.freeze({
    repair: repairRequest(1),
    label: labelRequest(1, runId),
    inquiry: inquiryRequest(1),
    transform: Object.freeze({
      protocolVersion: "0.2",
      requestVersion: "transform/2",
      id: "local-ai-transform",
      treeId: "local-ai-tree",
      mode: "transform",
      operation: "expand-in-place",
      treeRevision: 1,
      selection: Object.freeze({
        type: "segment-range",
        nodeId: "local-ai-transform-node",
        start: transformStart,
        end: transformStart + transformPassage.length,
        selectedText: transformPassage,
      }),
      gesture: Object.freeze({ type: "stretch", axis: "vertical", amount: 0.5 }),
      locale: "zh-CN",
      context: Object.freeze({ lineage: Object.freeze([Object.freeze({
        id: "local-ai-transform-node",
        text: transformText,
        parentId: null,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      })]) }),
    }),
    "text-swap": Object.freeze({
      protocolVersion: "0.2",
      requestVersion: "text-swap/2",
      id: "local-ai-text-swap",
      treeId: "local-ai-tree",
      mode: "transform",
      operation: "paraphrase-in-place",
      treeRevision: 1,
      selection: Object.freeze({
        type: "segment-range",
        nodeId: "local-ai-swap-node",
        start: 0,
        end: swapText.length,
        selectedText: swapText,
      }),
      direction: Object.freeze({ text: "换一种更清楚但保留安静感的说法" }),
      locale: "zh-CN",
      context: Object.freeze({ lineage: Object.freeze([Object.freeze({
        id: "local-ai-swap-node",
        text: swapText,
        parentId: null,
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      })]) }),
    }),
  });
}

export function classifyLocalAiResponse(surface, healthState, status, payload, request = null) {
  if (healthState === "unavailable") {
    return Object.freeze({ ok: false, outcome: "refused", reason: "CONFIGURATION_MISMATCH" });
  }
  if (status !== 200) return classifyLocalAiError(surface, status, payload, request);
  if (!isRecord(payload)) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  if (surface === "repair" || surface === "label" || surface === "inquiry") {
    const classified = classifyResponse(surface, status, payload, request);
    if (healthState === "fixture") {
      return Object.freeze({
        ok: classified.outcome === "model",
        outcome: classified.outcome === "model" ? "fixture" : classified.outcome,
        reason: classified.reason,
      });
    }
    return Object.freeze({
      ok: classified.outcome === "model",
      outcome: classified.outcome,
      reason: classified.reason,
    });
  }
  const expectedVersion = surface === "transform" ? "transform/2" : "text-swap/2";
  const expectedIntent = surface === "transform" ? "expand" : "paraphrase";
  const expectedMotion = surface === "transform" ? "grow" : "settle";
  const ok = request !== null &&
    hasExactKeys(payload, ["protocolVersion", "requestVersion", "id", "treeId", "treeRevision", "action", "presentation"]) &&
    payload.protocolVersion === "0.2" &&
    payload.requestVersion === expectedVersion &&
    payload.id === request.id &&
    payload.treeId === request.treeId &&
    payload.treeRevision === request.treeRevision &&
    isRecord(payload.action) &&
    hasExactKeys(payload.action, ["id", "type", "nodeId", "start", "end", "text", "intent"]) &&
    payload.action.id === request.id &&
    payload.action.type === "replace-text-range" &&
    payload.action.nodeId === request.selection.nodeId &&
    payload.action.start === request.selection.start &&
    payload.action.end === request.selection.end &&
    payload.action.intent === expectedIntent &&
    typeof payload.action.text === "string" &&
    payload.action.text.trim() !== "" &&
    isRecord(payload.presentation) &&
    hasExactKeys(payload.presentation, ["motionHint"]) &&
    payload.presentation.motionHint === expectedMotion;
  const outcome = healthState === "fixture" ? "fixture" : "model";
  return Object.freeze({ ok, outcome: ok ? outcome : "refused", reason: ok ? null : "INVALID_PLAN" });
}

function classifyLocalAiError(surface, status, payload, request) {
  if (!hasExactKeys(payload, ["error"]) || !isRecord(payload.error)) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  const error = payload.error;
  const hasFallback = Object.hasOwn(error, "fallbackReason");
  const hasOperation = Object.hasOwn(error, "operationId");
  const keys = ["code", "message", "retryable"];
  if (hasFallback) keys.push("fallbackReason");
  if (hasOperation) keys.push("operationId");
  if (
    !hasExactKeys(error, keys) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    error.message.length === 0 ||
    Array.from(error.message).length > 500 ||
    typeof error.retryable !== "boolean" ||
    (hasOperation && (
      typeof error.operationId !== "string" ||
      request === null ||
      error.operationId !== request.operationId
    ))
  ) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  if (surface === "repair" || surface === "label") {
    const expectedCode = surface === "repair" ? "REPAIR_FAILED" : "LABEL_FAILED";
    if (hasFallback || error.code !== expectedCode || !error.retryable) {
      return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
    }
    const outcome = status === 504 ? "timeout" : status === 429 || status === 503 ? "busy" : "unavailable";
    return Object.freeze({ ok: false, outcome, reason: `HTTP_${status}` });
  }
  if (!error.retryable) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  if (!hasFallback) {
    const validBoundaryFailure = surface === "inquiry"
      ? error.code === "INQUIRY_FAILED" && (status === 429 || status === 503 || status === 504)
      : error.code === "TURN_FAILED" && status === 504;
    if (!validBoundaryFailure) {
      return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
    }
    return Object.freeze({
      ok: false,
      outcome: status === 504 ? "timeout" : "busy",
      reason: `HTTP_${status}`,
    });
  }
  if (!CLOSED_FALLBACK_REASONS.has(error.fallbackReason)) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  const providerFailureMatches = surface === "inquiry"
    ? error.code === "INQUIRY_FAILED" && status === 503
    : error.fallbackReason === "MODEL_REJECTED"
      ? error.code === "TURN_REJECTED" && status === 422
      : error.code === "TURN_UNAVAILABLE" && (
        status === 503 || (status === 429 && error.fallbackReason === "MODEL_BUSY")
      );
  if (!providerFailureMatches) {
    return Object.freeze({ ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" });
  }
  const outcome = error.fallbackReason === "MODEL_REJECTED"
    ? "rejected"
    : error.fallbackReason === "MODEL_TIMEOUT"
      ? "timeout"
      : error.fallbackReason === "MODEL_BUSY"
        ? "busy"
        : "unavailable";
  return Object.freeze({ ok: false, outcome, reason: error.fallbackReason });
}

export async function probeLocalAi(origin, options = {}) {
  const target = normalizeLoopbackOrigin(origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const routeTimeoutMs = options.routeTimeoutMs ?? ROUTE_TIMEOUT_MS;
  const health = await readHealth(
    target,
    fetchImpl,
    options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS,
  );
  requireLocalAiDemoProfile(health.surfaces);
  const requests = localAiRequests(options.runId ?? createRunId());
  const states = Object.freeze({
    repair: health.surfaces.transcriptRepair,
    label: health.surfaces.thoughtLabel,
    inquiry: health.surfaces.inquiry,
    transform: health.surfaces.transformTurn,
    "text-swap": health.surfaces.textSwap,
  });
  const results = [];
  for (const surface of SURFACES) {
    const startedAt = now();
    const deadlineAt = performance.now() + routeTimeoutMs;
    const response = await fetchImpl(`${target}/api/${surface === "transform" ? "turn" : surface}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: new URL(target).origin,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(requests[surface]),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(routeTimeoutMs),
    });
    const noStore = response.headers.get("cache-control")?.toLowerCase().split(",")
      .some((directive) => directive.trim() === "no-store") ?? false;
    if (!noStore) {
      cancelResponseBody(response);
      throw new Error(`The local AI ${surface} route was not marked no-store.`);
    }
    const payload = await readBoundedJson(
      response,
      RESPONSE_BYTE_LIMITS[surface],
      deadlineAt,
    );
    results.push(Object.freeze({
      surface,
      configured: states[surface],
      status: response.status,
      durationMs: Math.max(0, now() - startedAt),
      ...classifyLocalAiResponse(surface, states[surface], response.status, payload, requests[surface]),
    }));
  }
  return Object.freeze({
    health,
    results: Object.freeze(results),
    voice: Object.freeze({ configured: health.surfaces.voiceAdmission, outcome: "browser-proof-required" }),
  });
}

async function readHealth(origin, fetchImpl, timeoutMs) {
  const deadlineAt = performance.now() + timeoutMs;
  const response = await fetchImpl(`${origin}/api/health`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readBoundedJson(response, 8 * 1_024, deadlineAt);
  const expectedBasePath = new URL(origin).pathname.replace(/\/$/u, "");
  const noStore = response.headers.get("cache-control")?.toLowerCase().split(",")
    .some((directive) => directive.trim() === "no-store") ?? false;
  if (!response.ok || !noStore || !isRecord(payload) ||
      !hasExactKeys(payload, ["appVersion", "basePath", "protocolVersion", "status", "surfaces"]) ||
      payload.status !== "ok" ||
      payload.protocolVersion !== "0.2" || payload.appVersion !== APP_VERSION ||
      payload.basePath !== expectedBasePath || !isHealthSurfaces(payload.surfaces)) {
    throw new Error("The target does not match the expected Matter version and base path.");
  }
  return payload;
}

function isHealthSurfaces(value) {
  if (!hasExactKeys(value, HEALTH_SURFACE_KEYS)) return false;
  return value.material === "available" &&
    value.localPersistence === "available" &&
    value.archiveExportImport === "available" &&
    HEALTH_STATES.has(value.voiceAdmission) &&
    HEALTH_STATES.has(value.thoughtLabel) &&
    HEALTH_STATES.has(value.transcriptRepair) &&
    HEALTH_STATES.has(value.inquiry) &&
    HEALTH_STATES.has(value.transformTurn) &&
    HEALTH_STATES.has(value.textSwap);
}

function requireLocalAiDemoProfile(surfaces) {
  if (
    surfaces.transcriptRepair !== "available" ||
    surfaces.inquiry !== "available" ||
    surfaces.textSwap !== "available" ||
    surfaces.voiceAdmission !== "available"
  ) {
    throw new Error("The target is not running the localhost AI demo profile.");
  }
}

async function readBoundedJson(response, maxBytes, deadlineAt) {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/u.test(type)) {
    cancelResponseBody(response);
    throw new Error("A local AI route did not return JSON.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxBytes) {
      cancelResponseBody(response);
      throw new Error("A local AI route response exceeded its probe bound.");
    }
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  const chunks = [];
  let total = 0;
  let timeoutId;
  const interrupted = new Promise((resolveInterrupted) => {
    timeoutId = setTimeout(
      () => resolveInterrupted({ kind: "interrupted" }),
      Math.max(0, deadlineAt - performance.now()),
    );
  });
  try {
    for (;;) {
      // An immediately resolving empty stream can starve the timer task, so
      // the same absolute deadline is checked before every read as well.
      if (performance.now() >= deadlineAt) {
        cancelReader(reader);
        throw new Error("A local AI route response exceeded its probe deadline.");
      }
      const next = await Promise.race([
        reader.read().then(
          (value) => ({ kind: "read", value }),
          () => ({ kind: "failed" }),
        ),
        interrupted,
      ]);
      if (next.kind === "interrupted") {
        cancelReader(reader);
        throw new Error("A local AI route response exceeded its probe deadline.");
      }
      if (next.kind === "failed") {
        cancelReader(reader);
        throw new Error("A local AI route response could not be read.");
      }
      const { done, value } = next.value;
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        cancelReader(reader);
        throw new Error("A local AI route response exceeded its probe bound.");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeoutId);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("A local AI route returned malformed JSON.");
  }
}

function cancelReader(reader) {
  void reader.cancel().catch(() => undefined);
}

function cancelResponseBody(response) {
  void response.body?.cancel().catch(() => undefined);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function createRunId() {
  return `localai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 24);
}

async function main() {
  const options = parseLocalAiProbeArguments(process.argv.slice(2));
  if (!options.execute) {
    console.log("local-ai: dry run — zero requests sent");
    console.log(`local-ai: target ${options.origin}`);
    console.log("local-ai: --execute sends at most five synthetic route requests after a version/base-path health check");
    console.log("local-ai: one route request may try more than one configured provider candidate");
    console.log("local-ai: Voice remains a browser capability/permission test and is not called by this probe");
    console.log("local-ai: this is route/provider smoke, not exact dirty-source or production proof");
    return;
  }
  const report = await probeLocalAi(options.origin);
  for (const result of report.results) {
    const reason = result.reason === null ? "" : ` ${result.reason}`;
    console.log(
      `local-ai: ${result.surface.padEnd(9)} ${result.outcome.padEnd(8)} HTTP ${result.status}` +
      ` ${Math.round(result.durationMs)}ms configured=${result.configured}${reason}`,
    );
  }
  console.log(`local-ai: voice     ${report.voice.outcome} configured=${report.voice.configured}`);
  console.log("local-ai: scope     route/provider smoke; not exact dirty-source or production proof");
  if (report.results.some((result) => !result.ok)) process.exitCode = 1;
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`local-ai: ${error instanceof Error ? error.message : "probe failed"}`);
    process.exitCode = 1;
  });
}
