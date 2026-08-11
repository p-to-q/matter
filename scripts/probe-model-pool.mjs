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

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROTOCOL_VERSION = "0.2";
export const REPAIR_PROMPT_VERSION = "transcript-repair/3";
export const LABEL_PROMPT_VERSION = "thought-label/2";
export const SURFACES = Object.freeze(["repair", "label", "inquiry"]);

/**
 * Inquiry admits twelve requests per minute per source, and a probe that trips
 * its own rate limit measures the limiter rather than the pool.
 */
export const DEFAULT_PACE_MS = 6_000;
export const DEFAULT_ROUNDS = 6;

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

export function labelRequest(round) {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    promptVersion: LABEL_PROMPT_VERSION,
    operationId: `probe-label-${round}`,
    basis: Object.freeze({ treeId: "probe-tree", nodeId: `probe-node-${round}`, revision: round }),
    locale: "en-US",
    // Roomy on purpose. A tight bound makes the label adjudicator refuse
    // answers a working pool produced, and the probe would report
    // MODEL_REJECTED for its own payload rather than for the pool.
    maxGraphemes: 28,
    // Varied per round on purpose. The label generator caches by a fingerprint
    // of the material, so a fixed string would measure the cache from the
    // second round on and report a healthy pool that was never asked.
    text: `probe round ${round}: a room that keeps its shape after everyone has left it`,
    // No parent label or excerpt: the probe measures the pool, and every field
    // it omits is one fewer reason for a request to be refused before a model
    // is ever asked.
    reference: Object.freeze({ siblingLabels: [] }),
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
export function classifyResponse(surface, status, payload) {
  if (status === 0) return outcome("unreachable", "TRANSPORT");
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
    failures: Object.freeze(failures),
  });
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

export function formatReport(origin, summary) {
  const lines = [`pool: ${origin} — ${summary.verdict}`];
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
  return lines.join("\n");
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
}) {
  const target = normalizeOrigin(origin);
  const samples = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const surface of surfaces) {
      const startedAt = now();
      let status = 0;
      let payload = null;
      try {
        const response = await fetchImpl(`${target}/api/${surface}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Inquiry admission requires a same-origin browser shape in
            // production. A probe that omits it measures the origin check.
            origin: target,
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify(requestFor(surface, round)),
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = response.status;
        payload = await response.json().catch(() => null);
      } catch {
        status = 0;
      }
      const classified = classifyResponse(surface, status, payload);
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
  for (const value of args) {
    if (value.startsWith("--rounds=")) {
      rounds = wholeNumber(value.slice("--rounds=".length), 1, 60, "--rounds");
      continue;
    }
    if (value.startsWith("--pace=")) {
      paceMs = wholeNumber(value.slice("--pace=".length), 0, 300, "--pace") * 1_000;
      continue;
    }
    if (origin !== undefined) {
      throw new Error("Pool probe accepts one origin, --rounds=<n>, and --pace=<seconds>.");
    }
    origin = value;
  }
  return Object.freeze({ origin, rounds, paceMs });
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
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("Pool probe origin must not include a path, query, or fragment.");
  }
  return url.origin;
}

function requestFor(surface, round) {
  if (surface === "repair") return repairRequest(round);
  if (surface === "label") return labelRequest(round);
  return inquiryRequest(round);
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
  const { origin, rounds, paceMs } = parseArguments(process.argv.slice(2));
  const result = await probeModelPool({
    origin: origin ?? process.env.MATTER_DEPLOYMENT_ORIGIN ?? "https://matter.ptoq.io",
    rounds,
    paceMs,
    onSample: (sample) => {
      const reason = sample.reason === null ? "" : ` ${sample.reason}`;
      console.log(
        `pool: round ${sample.round} ${sample.surface.padEnd(8)} ${sample.outcome.padEnd(11)}` +
          ` ${String(sample.durationMs).padStart(6)} ms  HTTP ${sample.status}${reason}`,
      );
    },
  });
  console.log(formatReport(result.origin, result.summary));
  if (result.summary.failures.length > 0) process.exitCode = 1;
}

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryUrl === import.meta.url) {
  await main().catch((error) => {
    console.error(`pool: ${error instanceof Error ? error.message : "probe failed"}`);
    process.exitCode = 1;
  });
}
