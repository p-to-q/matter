/**
 * Measures whether the model pool is answering a deployed origin.
 *
 * The pool is the one part of Matter whose failure is invisible from outside.
 * Label and repair each have a floor that is already correct without a model —
 * the deterministic name, the words as heard — so a pool that has stopped
 * answering still returns HTTP 200 from both, and a person sees a slightly
 * worse result rather than an error. Inquiry has no floor, so it is the only
 * surface that says anything, and it says it as one 503 that a reader is free
 * to read as an inquiry bug. #52 was diagnosed as an inquiry bug for that
 * reason, on the strength of one repair call that happened to answer.
 *
 * So this probe reads `fallbackReason` rather than status. Every surface
 * already publishes it, using the same four words, and it is the difference
 * between "repair answered" and "repair answered without a model". One round
 * asks all three, which is what makes a scenario-specific fault distinguishable
 * from a pool-wide one — the comparison nobody could make from a single
 * surface's receipt.
 *
 * It sends no material: the payloads are generated placeholder text, varied per
 * round so the label cache cannot answer for the pool.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isInquiryAnswerProse } from "../features/matter/protocol/inquiry-answer-policy.mjs";

export const PROTOCOL_VERSION = "0.2";
export const REPAIR_PROMPT_VERSION = "transcript-repair/4";
export const LABEL_PROMPT_VERSION = "thought-label/3";
export const APP_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
export const MAX_REPAIR_TEXT_CODE_UNITS = 2_000;
export const MAX_INQUIRY_ANSWER_CODE_POINTS = 3_200;
export const MAX_REPAIR_RESPONSE_BYTES = 12 * 1_024;
export const MAX_LABEL_RESPONSE_BYTES = 4 * 1_024;
export const MAX_INQUIRY_RESPONSE_BYTES = 16 * 1_024;
export const MAX_HEALTH_RESPONSE_BYTES = 8 * 1_024;
export const LABEL_CANARY_MATERIAL = Object.freeze(JSON.parse(
  readFileSync(new URL("./probe-model-pool-canaries.json", import.meta.url), "utf8"),
));
export const SURFACES = Object.freeze(["repair", "label", "inquiry"]);
const HEALTH_SURFACE = Object.freeze({
  repair: "transcriptRepair",
  label: "thoughtLabel",
  inquiry: "inquiry",
});

/**
 * Inquiry admits twelve requests per minute per source, and a probe that trips
 * its own rate limit measures the limiter rather than the pool.
 */
export const DEFAULT_PACE_MS = 6_000;

/**
 * `DEFAULT_POOL_LIMITS.cooldownMs` in features/matter/server/model-pool.ts owns
 * this conservative attribution window; it is restated because an operator
 * script cannot import the TypeScript module.
 *
 * It matters here because the default pace is well inside it. That is the right
 * trade while the pool answers — nothing cools, and a run stays short — and the
 * wrong one the moment it does not, which is the only time anybody runs this.
 * Rather than make every run wait a minute between rounds, the report says when
 * later samples may be measuring this probe's own effect.
 */
export const POOL_COOLDOWN_MS = 60_000;
export const DEFAULT_ROUNDS = LABEL_CANARY_MATERIAL.length;
export const MAX_ROUNDS = LABEL_CANARY_MATERIAL.length;

/**
 * What one call proves about the pool, independent of which surface made it.
 *
 * `floor` is the value this whole probe exists for: HTTP 200, a usable answer,
 * and no model behind it. A status code cannot express that, which is why a
 * green deployment check has never contradicted #52.
 */
export const OUTCOMES = Object.freeze(["model", "rejected", "floor", "refused", "unreachable"]);

/**
 * `MODEL_REJECTED` is the one fallback that proves the pool is working: the
 * relay answered inside the deadline and the scenario's adjudicator declined
 * what it said. Counting it as a pool failure would make a probe payload the
 * bound cannot satisfy look like a dead provider — the same conflation the
 * harness itself used to make when it cooled a relay over a refused answer.
 */
const POOL_REACHED = new Set(["model", "rejected"]);

export function repairRequest(round) {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: REPAIR_PROMPT_VERSION,
    operationId: `probe-repair-${round}`,
    attempt: 1,
    locale: "en-US",
    // Missing punctuation and a homophone, so a model that answers has
    // something to change and the answer is distinguishable from the floor.
    text: `probe round ${round} the quiet room aloud held it's shape until the morning came`,
    vocabulary: [],
  });
}

export function labelRequest(round, runId = "standalone") {
  const safeRunId = normalizeRunId(runId);
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: LABEL_PROMPT_VERSION,
    operationId: `probe-label-${safeRunId}-${round}`,
    basis: Object.freeze({
      treeId: "probe-tree",
      nodeId: `probe-node-${safeRunId}-${round}`,
      revision: round,
    }),
    locale: "en-US",
    // Roomy on purpose. A tight bound makes the label adjudicator refuse
    // answers a working pool produced, and the probe would report
    // MODEL_REJECTED for its own payload rather than for the pool.
    maxGraphemes: 28,
    // Varied per round on purpose. The label generator caches by a fingerprint
    // of the material, so a fixed string would measure the cache from the
    // second round on and report a healthy pool that was never asked.
    text: LABEL_CANARY_MATERIAL[round - 1],
    // Operation identity is deliberately absent from the server cache key.
    // This synthetic sibling is therefore the per-run nonce: it participates
    // in the real prompt/cache fingerprint without carrying user material.
    reference: Object.freeze({
      siblingLabels: Object.freeze([`Canary ${safeRunId}`]),
    }),
  });
}

export function inquiryRequest(round) {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestId: `probe-inquiry-${round}`,
    question: "What does this material claim, in one sentence?",
    locale: "en-US",
    context: Object.freeze({
      treeId: "probe-tree",
      revision: round,
      scope: "tree",
      lineage: Object.freeze([
        Object.freeze({
          nodeId: "probe-node-a",
          depth: 0,
          text: `probe round ${round}: a room keeps its shape after everyone has left it.`,
          truncated: false,
        }),
        Object.freeze({
          nodeId: "probe-node-b",
          depth: 1,
          text: "What stays is the arrangement, not the people who arranged it.",
          truncated: false,
        }),
      ]),
      thoughtCount: 2,
      clipped: false,
    }),
  });
}

/**
 * Repair and label answer 200 whether or not a model was involved, so `source`
 * decides and `fallbackReason` explains. Inquiry has no floor: it answers or it
 * refuses, and its refusal carries the same vocabulary.
 */
export function classifyResponse(surface, status, payload, expectedRequest = null) {
  if (status === 0) return outcome("unreachable", "TRANSPORT");
  if (
    status === 200 &&
    expectedRequest !== null &&
    !matchesProbeResponse(surface, payload, expectedRequest)
  ) return outcome("refused", "INVALID_ENVELOPE");
  if (surface === "inquiry") {
    if (status === 200 && isRecord(payload) && payload.status === "answered") return outcome("model");
    if (status === 200 && isRecord(payload) && payload.status === "unavailable") {
      return outcome("refused", asReason(payload.reason));
    }
    return withRejection(errorReason(payload, status));
  }
  if (status !== 200) return withRejection(errorReason(payload, status));
  if (!isRecord(payload)) return outcome("refused", `HTTP_${status}`);
  if (payload.source === "model") return outcome("model");
  const reason = asReason(payload.fallbackReason) ?? String(payload.source ?? "UNKNOWN").toUpperCase();
  return withRejection(reason, "floor");
}

export function summarize(samples) {
  const bySurface = {};
  for (const surface of SURFACES) {
    const own = samples.filter((sample) => sample.surface === surface);
    const latencies = own.map((sample) => sample.durationMs).sort((left, right) => left - right);
    const reasons = {};
    for (const sample of own) {
      if (sample.reason === null) continue;
      reasons[sample.reason] = (reasons[sample.reason] ?? 0) + 1;
    }
    bySurface[surface] = Object.freeze({
      calls: own.length,
      model: own.filter((sample) => sample.outcome === "model").length,
      rejected: own.filter((sample) => sample.outcome === "rejected").length,
      // Every call the relay answered at all, which is what "is the pool up"
      // actually asks. A refused answer still crossed the wire and back.
      reached: own.filter((sample) => POOL_REACHED.has(sample.outcome)).length,
      floor: own.filter((sample) => sample.outcome === "floor").length,
      refused: own.filter((sample) => sample.outcome === "refused").length,
      unreachable: own.filter((sample) => sample.outcome === "unreachable").length,
      reasons: Object.freeze(reasons),
      latencyMs: Object.freeze({
        min: latencies[0] ?? 0,
        median: median(latencies),
        max: latencies[latencies.length - 1] ?? 0,
      }),
    });
  }
  const attempted = SURFACES.filter((surface) => bySurface[surface].calls > 0);
  const failures = [];
  for (const surface of attempted) {
    const entry = bySurface[surface];
    if (entry.reached === 0) {
      failures.push(`${surface} never reached a model across ${entry.calls} call(s).`);
    } else if (entry.reached < entry.calls) {
      failures.push(`${surface} reached a model on only ${entry.reached} of ${entry.calls} call(s).`);
    }
  }
  return Object.freeze({
    bySurface: Object.freeze(bySurface),
    // The verdict a reader needs first, and the one #52 could not reach from a
    // single surface: is this the pool, or is it one scenario?
    verdict: verdictOf(attempted, bySurface),
    usabilityVerdict: usabilityVerdictOf(attempted, bySurface),
    failures: Object.freeze(failures),
  });
}

function usabilityVerdictOf(attempted, bySurface) {
  if (attempted.length === 0) return "no-samples";
  const usable = attempted.filter((surface) => bySurface[surface].model === bySurface[surface].calls);
  if (usable.length === attempted.length) return "surface-usable";
  if (usable.length === 0) return "surface-unusable";
  return "surface-degraded";
}

/**
 * Intermittence is a verdict of its own, not a rounding error on health.
 *
 * A surface that answered once and failed five times is the exact shape that
 * kept #52 misdiagnosed: any single sample of it supports either conclusion.
 * Collapsing that into "healthy" because one call succeeded would rebuild the
 * mistake this probe exists to prevent, so partial success is named.
 */
function verdictOf(attempted, bySurface) {
  if (attempted.length === 0) return "no-samples";
  const reached = attempted.filter((surface) => bySurface[surface].reached > 0);
  if (reached.length === 0) return "pool-down";
  if (reached.length < attempted.length) return "surface-specific";
  return attempted.every((surface) => bySurface[surface].reached === bySurface[surface].calls)
    ? "pool-healthy"
    : "pool-degraded";
}

export function formatReport(origin, summary, options = {}) {
  const lines = [
    `pool: ${origin} — ${summary.verdict}`,
    `surfaces: ${origin} — ${summary.usabilityVerdict}`,
  ];
  for (const surface of SURFACES) {
    const entry = summary.bySurface[surface];
    if (entry.calls === 0) continue;
    const reasons = Object.entries(entry.reasons)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => `${reason}×${count}`)
      .join(" ");
    lines.push(
      `  ${surface.padEnd(8)} reached ${entry.reached}/${entry.calls}  model ${entry.model}` +
        `  rejected ${entry.rejected}  floor ${entry.floor}  refused ${entry.refused}  unreachable ${entry.unreachable}` +
        `  ${entry.latencyMs.min}/${entry.latencyMs.median}/${entry.latencyMs.max} ms` +
        (reasons === "" ? "" : `  ${reasons}`),
    );
  }
  for (const failure of summary.failures) lines.push(`  ! ${failure}`);
  for (const failure of probeGateFailures(summary, options)) lines.push(`  ! ${failure}`);
  const caveat = pacingCaveat(summary, options.paceMs);
  if (caveat !== null) lines.push(`  ! ${caveat}`);
  return lines.join("\n");
}

/** Release-only assertions layered on top of the diagnostic pool verdict. */
export function probeGateFailures(summary, options = {}) {
  const failures = [];
  if (options.requireInquiryAnswer === true) {
    const inquiry = summary.bySurface.inquiry;
    if (inquiry === undefined || inquiry.calls === 0 || inquiry.model !== inquiry.calls) {
      failures.push(
        `release gate requires a real Inquiry answer on every call; observed ${inquiry?.model ?? 0}/${inquiry?.calls ?? 0}.`,
      );
    }
  }
  for (const surface of options.requiredUsableSurfaces ?? []) {
    const entry = summary.bySurface[surface];
    if (entry === undefined || entry.calls === 0 || entry.model !== entry.calls) {
      failures.push(
        `release gate requires a real ${surface} result on every call; observed ${entry?.model ?? 0}/${entry?.calls ?? 0}.`,
      );
    }
  }
  return Object.freeze(failures);
}

/**
 * Names the one way this probe can lie to the person running it.
 *
 * An origin probe cannot prove instance affinity or which internal candidate was
 * attempted. Repeated failures inside this window therefore create an
 * attribution caveat, not proof that a candidate entered cooldown.
 */
export function pacingCaveat(summary, paceMs) {
  if (typeof paceMs !== "number" || paceMs >= POOL_COOLDOWN_MS) return null;
  const cooled = SURFACES.filter((surface) => {
    const entry = summary.bySurface[surface];
    return entry !== undefined && entry.calls - entry.reached >= 2;
  });
  if (cooled.length === 0) return null;
  return `${cooled.join(", ")} had repeated non-model results while rounds were `
    + `paced ${Math.round(paceMs / 1_000)}s apart, inside the process-local `
    + `${POOL_COOLDOWN_MS / 1_000}s candidate-health window. If later requests `
    + `hit the same warm instance, local ordering or governor state may affect `
    + `them; correlate server receipts before attributing the result to a relay. `
    + `Use --pace=${Math.ceil(POOL_COOLDOWN_MS / 1_000) + 5} for a cleaner retry window.`;
}

export async function probeModelPool({
  origin,
  rounds = DEFAULT_ROUNDS,
  paceMs = DEFAULT_PACE_MS,
  timeoutMs = 30_000,
  surfaces = SURFACES,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = delay,
  onSample = () => undefined,
  runId = createProbeRunId(),
}) {
  const target = normalizeOrigin(origin);
  const requestOrigin = new URL(target).origin;
  const samples = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const surface of surfaces) {
      const startedAt = now();
      const expectedRequest = requestFor(surface, round, runId);
      let status = 0;
      let payload = null;
      try {
        const deadlineAt = performance.now() + timeoutMs;
        const signal = AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl(`${target}/api/${surface}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Inquiry admission requires a same-origin browser shape in
            // production. A probe that omits it measures the origin check.
            origin: requestOrigin,
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify(expectedRequest),
          cache: "no-store",
          redirect: "manual",
          signal,
        });
        status = response.status;
        payload = await readProbePayload(response, surface, deadlineAt);
      } catch {
        status = 0;
      }
      const classified = classifyResponse(surface, status, payload, expectedRequest);
      const sample = Object.freeze({
        round,
        surface,
        status,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        outcome: classified.outcome,
        reason: classified.reason,
      });
      samples.push(sample);
      onSample(sample);
    }
    if (round < rounds && paceMs > 0) await sleep(paceMs);
  }
  return Object.freeze({ origin: target, samples: Object.freeze(samples), summary: summarize(samples) });
}

export function parseArguments(args) {
  let origin;
  let rounds = DEFAULT_ROUNDS;
  let paceMs = DEFAULT_PACE_MS;
  let requireInquiryAnswer = false;
  let profile = "diagnostic";
  let expectedVersion = APP_VERSION;
  for (const value of args) {
    if (value.startsWith("--rounds=")) {
      rounds = wholeNumber(value.slice("--rounds=".length), 1, MAX_ROUNDS, "--rounds");
      continue;
    }
    if (value.startsWith("--pace=")) {
      paceMs = wholeNumber(value.slice("--pace=".length), 0, 300, "--pace") * 1_000;
      continue;
    }
    if (value === "--require-inquiry-answer") {
      requireInquiryAnswer = true;
      continue;
    }
    if (value.startsWith("--profile=")) {
      profile = value.slice("--profile=".length);
      if (profile !== "diagnostic" && profile !== "release") {
        throw new Error("--profile must be diagnostic or release.");
      }
      continue;
    }
    if (value.startsWith("--expected-version=")) {
      expectedVersion = value.slice("--expected-version=".length);
      if (!/^0\.2\.0-preview\.\d+$/u.test(expectedVersion)) {
        throw new Error("--expected-version must name one Matter preview version.");
      }
      continue;
    }
    if (origin !== undefined) {
      throw new Error("Pool probe accepts one origin and its documented flags.");
    }
    origin = value;
  }
  return Object.freeze({ origin, rounds, paceMs, requireInquiryAnswer, profile, expectedVersion });
}

export function normalizeOrigin(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Pool probe origin must be HTTPS, or plain HTTP on the loopback interface.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Pool probe origin must not carry credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("Pool probe origin must not include a query or fragment.");
  }
  // A local or shared deployment may use Next's basePath. Keep that path in
  // the request target while the browser-shaped Origin header remains the
  // scheme/host/port tuple; an Origin value is never allowed to carry a path.
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/u, "");
  return `${url.origin}${basePath}`;
}

/**
 * A fixture can return the same public `source: "model"` shape as a live
 * adapter. Health is therefore the authority for whether a probe result says
 * anything about the external pool at all.
 */
export function eligiblePoolSurfaces(payload, requiredSurfaces = []) {
  if (!isRecord(payload) || !isRecord(payload.surfaces)) {
    throw new Error("Pool probe health response was malformed.");
  }
  const live = [];
  const skipped = [];
  for (const surface of SURFACES) {
    const healthName = HEALTH_SURFACE[surface];
    const state = payload.surfaces[healthName];
    if (state === "available") live.push(surface);
    else if (state === "fixture" || state === "unavailable" || state === "not-implemented") {
      skipped.push(Object.freeze({ surface, state }));
    } else {
      throw new Error(`Pool probe health omitted the ${healthName} capability.`);
    }
  }
  for (const surface of requiredSurfaces) {
    if (!live.includes(surface)) {
      throw new Error(`Pool probe requires live ${surface}; health did not report it available.`);
    }
  }
  return Object.freeze({ live: Object.freeze(live), skipped: Object.freeze(skipped) });
}

export async function readPoolCapabilities(target, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const normalizedTarget = normalizeOrigin(target);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const deadlineAt = performance.now() + timeoutMs;
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(`${normalizedTarget}/api/health`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "manual",
    signal,
  });
  if (!response.ok) {
    cancelResponseBody(response);
    throw new Error("Pool probe health request failed.");
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    cancelResponseBody(response);
    throw new Error("Pool probe health did not declare JSON.");
  }
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  if (!cacheControl.split(",").some((directive) => directive.trim() === "no-store")) {
    cancelResponseBody(response);
    throw new Error("Pool probe health was not marked no-store.");
  }
  const payload = await readBoundedJson(response, MAX_HEALTH_RESPONSE_BYTES, deadlineAt);
  if (!isRecord(payload) || payload.status !== "ok") {
    throw new Error("Pool probe health status was not ok.");
  }
  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error("Pool probe health protocol version did not match.");
  }
  const expectedVersion = options.expectedVersion ?? APP_VERSION;
  if (payload.appVersion !== expectedVersion) {
    throw new Error(`Pool probe expected app ${expectedVersion}, received ${String(payload.appVersion)}.`);
  }
  const expectedBasePath = new URL(normalizedTarget).pathname.replace(/\/$/u, "");
  if (payload.basePath !== expectedBasePath) {
    throw new Error(`Pool probe expected basePath ${expectedBasePath || "<empty>"}.`);
  }
  return eligiblePoolSurfaces(payload, options.requiredSurfaces ?? []);
}

function requestFor(surface, round, runId) {
  if (surface === "repair") return repairRequest(round);
  if (surface === "label") return labelRequest(round, runId);
  return inquiryRequest(round);
}

function matchesProbeResponse(surface, payload, request) {
  if (!isRecord(payload) || payload.protocolVersion !== PROTOCOL_VERSION) return false;
  if (surface === "repair") {
    return hasOnlyKeys(payload, [
      "protocolVersion", "promptVersion", "operationId", "attempt", "text", "source", "fallbackReason",
    ]) &&
      payload.promptVersion === request.promptVersion &&
      payload.operationId === request.operationId &&
      payload.attempt === request.attempt &&
      typeof payload.text === "string" &&
      payload.text.trim().length > 0 &&
      payload.text.length <= MAX_REPAIR_TEXT_CODE_UNITS &&
      (payload.source === "model" || payload.source === "verbatim") &&
      (payload.fallbackReason === undefined || asReason(payload.fallbackReason) !== null) &&
      (payload.source !== "model" || payload.fallbackReason === undefined);
  }
  if (surface === "label") {
    return hasOnlyKeys(payload, [
      "protocolVersion", "promptVersion", "operationId", "basis", "label", "source", "fallbackReason",
    ]) &&
      payload.promptVersion === request.promptVersion &&
      payload.operationId === request.operationId &&
      isRecord(payload.basis) &&
      hasExactKeys(payload.basis, ["treeId", "nodeId", "revision"]) &&
      payload.basis.treeId === request.basis.treeId &&
      payload.basis.nodeId === request.basis.nodeId &&
      payload.basis.revision === request.basis.revision &&
      isUsableProbeLabel(payload.label, request.maxGraphemes) &&
      (payload.source === "model" || payload.source === "provisional") &&
      (payload.fallbackReason === undefined || asReason(payload.fallbackReason) !== null) &&
      (payload.source !== "model" || payload.fallbackReason === undefined);
  }
  const expectedKeys = payload.status === "answered"
    ? ["protocolVersion", "basis", "status", "text", "receipt"]
    : ["protocolVersion", "basis", "status", "reason", "receipt"];
  const expectedReceipt = {
    scope: request.context.scope,
    lineageNodes: request.context.lineage.length,
    contextCodePoints: request.context.lineage.reduce(
      (total, node) => total + Array.from(node.text).length,
      0,
    ),
    clipped: request.context.clipped,
    thoughtCount: request.context.thoughtCount,
  };
  return hasExactKeys(payload, expectedKeys) &&
    (payload.status === "answered" || payload.status === "unavailable") &&
    isRecord(payload.basis) &&
    hasExactKeys(payload.basis, ["requestId", "treeId", "revision", "scope"]) &&
    payload.basis.requestId === request.requestId &&
    payload.basis.treeId === request.context.treeId &&
    payload.basis.revision === request.context.revision &&
    payload.basis.scope === request.context.scope &&
    isRecord(payload.receipt) &&
    hasExactKeys(payload.receipt, ["scope", "lineageNodes", "contextCodePoints", "clipped", "thoughtCount"]) &&
    Object.entries(expectedReceipt).every(([key, value]) => payload.receipt[key] === value) &&
    (payload.status === "answered"
      ? typeof payload.text === "string" &&
        payload.text.trim().length > 0 &&
        Array.from(payload.text).length <= MAX_INQUIRY_ANSWER_CODE_POINTS &&
        isInquiryAnswerProse(payload.text)
      : payload.reason === "NO_PROVIDER" || payload.reason === "NO_MATERIAL");
}

function isUsableProbeLabel(value, maxGraphemes) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  if (/[\u0000-\u001F\u007F]/u.test(value)) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(value.trim())).length <= maxGraphemes;
}

async function readProbePayload(response, surface, deadlineAt) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    cancelResponseBody(response);
    return null;
  }
  if (!cacheControl.split(",").some((directive) => directive.trim() === "no-store")) {
    cancelResponseBody(response);
    return null;
  }
  const byteLimit = surface === "repair"
    ? MAX_REPAIR_RESPONSE_BYTES
    : surface === "label"
      ? MAX_LABEL_RESPONSE_BYTES
      : MAX_INQUIRY_RESPONSE_BYTES;
  return readBoundedJson(response, byteLimit, deadlineAt);
}

async function readBoundedJson(response, byteLimit, deadlineAt) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > byteLimit) {
      cancelResponseBody(response);
      return null;
    }
  }
  const bytes = await readBoundedBytes(response, byteLimit, deadlineAt);
  if (bytes === null) return null;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readBoundedBytes(response, byteLimit, deadlineAt) {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let timeoutId;
  const interrupted = new Promise((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ kind: "interrupted" }),
      Math.max(0, deadlineAt - performance.now()),
    );
  });
  try {
    while (true) {
      // A hostile reader can resolve an endless sequence of empty chunks in
      // microtasks and starve the timer task. Check the same absolute deadline
      // synchronously before every read so that path is bounded too.
      if (performance.now() >= deadlineAt) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      const next = await Promise.race([
        reader.read().then(
          (value) => ({ kind: "read", value }),
          () => ({ kind: "error" }),
        ),
        interrupted,
      ]);
      if (next.kind !== "read") {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      if (next.value.done) break;
      total += next.value.value.byteLength;
      if (total > byteLimit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(next.value.value);
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancelResponseBody(response) {
  void response.body?.cancel().catch(() => undefined);
}

function createProbeRunId() {
  return randomBytes(8).toString("hex");
}

function normalizeRunId(value) {
  if (typeof value !== "string" || !/^[a-z0-9]{1,24}$/u.test(value)) {
    throw new Error("Pool probe run id must contain 1 to 24 lowercase letters or digits.");
  }
  return value;
}

function hasOnlyKeys(value, allowed) {
  const accepted = new Set(allowed);
  return Object.keys(value).every((key) => accepted.has(key));
}

function hasExactKeys(value, expected) {
  return Object.keys(value).length === expected.length && hasOnlyKeys(value, expected);
}

function outcome(name, reason = null) {
  return Object.freeze({ outcome: name, reason });
}

/** Separates "the relay answered and we refused it" from "the relay did not answer". */
function withRejection(reason, otherwise = "refused") {
  return outcome(reason === "MODEL_REJECTED" ? "rejected" : otherwise, reason);
}

/** Only the four frozen scenario words are echoed; a provider string is not. */
function asReason(value) {
  const known = new Set([
    "MODEL_TIMEOUT",
    "MODEL_UNAVAILABLE",
    "MODEL_BUSY",
    "MODEL_REJECTED",
    "NO_PROVIDER",
    "NO_MATERIAL",
  ]);
  return typeof value === "string" && known.has(value) ? value : null;
}

function errorReason(payload, status) {
  const reason = isRecord(payload) && isRecord(payload.error)
    ? asReason(payload.error.fallbackReason) ?? codeOf(payload.error.code)
    : null;
  return reason ?? `HTTP_${status}`;
}

function codeOf(value) {
  return typeof value === "string" && /^[A-Z_]{1,40}$/.test(value) ? value : null;
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function wholeNumber(raw, min, max, flag) {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be a whole number from ${min} to ${max}.`);
  }
  return parsed;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function main() {
  const { origin, rounds, paceMs, requireInquiryAnswer, profile, expectedVersion } = parseArguments(process.argv.slice(2));
  const target = normalizeOrigin(origin ?? process.env.MATTER_DEPLOYMENT_ORIGIN ?? "https://matter.ptoq.io");
  const requiredSurfaces = profile === "release" ? SURFACES : [];
  const capabilities = await readPoolCapabilities(target, { expectedVersion, requiredSurfaces });
  for (const entry of capabilities.skipped) {
    console.log(`pool: skip ${entry.surface} — health reports ${entry.state}`);
  }
  if (capabilities.live.length === 0) {
    throw new Error("health reports no live model-pool surface to probe.");
  }
  const result = await probeModelPool({
    origin: target,
    rounds,
    paceMs,
    surfaces: capabilities.live,
    onSample: (sample) => {
      const reason = sample.reason === null ? "" : ` ${sample.reason}`;
      console.log(
        `pool: round ${sample.round} ${sample.surface.padEnd(8)} ${sample.outcome.padEnd(11)}` +
          ` ${String(sample.durationMs).padStart(6)} ms  HTTP ${sample.status}${reason}`,
      );
    },
  });
  const requiredUsableSurfaces = profile === "release" ? SURFACES : [];
  console.log(formatReport(result.origin, result.summary, {
    paceMs,
    requireInquiryAnswer,
    requiredUsableSurfaces,
  }));
  if (
    result.summary.failures.length > 0 ||
    probeGateFailures(result.summary, { requireInquiryAnswer, requiredUsableSurfaces }).length > 0
  ) process.exitCode = 1;
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`pool: ${error instanceof Error ? error.message : "probe failed"}`);
    process.exitCode = 1;
  });
}
