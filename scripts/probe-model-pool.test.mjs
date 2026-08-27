import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyResponse,
  eligiblePoolSurfaces,
  POOL_COOLDOWN_MS,
  formatReport,
  inquiryRequest,
  labelRequest,
  normalizeOrigin,
  parseArguments,
  probeModelPool,
  probeGateFailures,
  REPAIR_PROMPT_VERSION,
  LABEL_PROMPT_VERSION,
  readPoolCapabilities,
  repairRequest,
  pacingCaveat,
  summarize,
} from "./probe-model-pool.mjs";

test("uses the deployed transcript-repair prompt contract", () => {
  assert.equal(REPAIR_PROMPT_VERSION, "transcript-repair/4");
  assert.equal(repairRequest(1).promptVersion, REPAIR_PROMPT_VERSION);
});

test("keeps the deployed thought-label probe on the browser's prompt/cache identity", async () => {
  assert.equal(labelRequest(1).promptVersion, LABEL_PROMPT_VERSION);
  const source = await readFile(
    new URL("../features/matter/material/semantic-label.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    new RegExp(`SEMANTIC_LABEL_PROMPT_VERSION\\s*=\\s*"${LABEL_PROMPT_VERSION}"`, "u"),
  );
});

test("accepts a deployed HTTPS origin and a loopback one", () => {
  assert.equal(normalizeOrigin("https://matter.ptoq.io/"), "https://matter.ptoq.io");
  assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeOrigin("http://localhost:3000/matter/"), "http://localhost:3000/matter");
  assert.throws(() => normalizeOrigin("http://matter.ptoq.io"), /HTTPS/);
  assert.throws(() => normalizeOrigin("https://user:key@matter.ptoq.io"), /credentials/);
  assert.throws(() => normalizeOrigin("https://matter.ptoq.io?debug=1"), /query/);
});

test("uses health to keep fixtures out of model-pool evidence", async () => {
  const payload = {
    surfaces: {
      transcriptRepair: "fixture",
      thoughtLabel: "available",
      inquiry: "available",
    },
  };
  assert.deepEqual(eligiblePoolSurfaces(payload), {
    live: ["label", "inquiry"],
    skipped: [{ surface: "repair", state: "fixture" }],
  });
  let requested = null;
  const capabilities = await readPoolCapabilities(
    "http://127.0.0.1:3210/matter/",
    async (url, init) => {
      requested = { url, method: init.method, cache: init.cache, redirect: init.redirect };
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  );
  assert.deepEqual(capabilities.live, ["label", "inquiry"]);
  assert.deepEqual(requested, {
    url: "http://127.0.0.1:3210/matter/api/health",
    method: "GET",
    cache: "no-store",
    redirect: "manual",
  });
  assert.throws(
    () => eligiblePoolSurfaces({ surfaces: { transcriptRepair: "available" } }),
    /thoughtLabel/,
  );
});

test("reads a floor answer as a pool failure even though it is HTTP 200", () => {
  // The whole point. Repair returning the words as heard is a correct product
  // outcome and an unanswered model, and only `fallbackReason` separates them.
  assert.deepEqual(
    classifyResponse("repair", 200, { source: "verbatim", fallbackReason: "MODEL_TIMEOUT" }),
    { outcome: "floor", reason: "MODEL_TIMEOUT" },
  );
  assert.deepEqual(
    classifyResponse("label", 200, { source: "provisional", fallbackReason: "MODEL_UNAVAILABLE" }),
    { outcome: "floor", reason: "MODEL_UNAVAILABLE" },
  );
  assert.deepEqual(classifyResponse("repair", 200, { source: "model" }), { outcome: "model", reason: null });
  assert.deepEqual(classifyResponse("label", 200, { source: "model" }), { outcome: "model", reason: null });
});

test("reads every inquiry ending, which has no floor to hide one", () => {
  assert.deepEqual(
    classifyResponse("inquiry", 200, { status: "answered", text: "…" }),
    { outcome: "model", reason: null },
  );
  assert.deepEqual(
    classifyResponse("inquiry", 200, { status: "unavailable", reason: "NO_PROVIDER" }),
    { outcome: "refused", reason: "NO_PROVIDER" },
  );
  assert.deepEqual(
    classifyResponse("inquiry", 503, { error: { code: "INQUIRY_FAILED", fallbackReason: "MODEL_TIMEOUT" } }),
    { outcome: "refused", reason: "MODEL_TIMEOUT" },
  );
  assert.deepEqual(
    classifyResponse("inquiry", 429, { error: { code: "INQUIRY_FAILED" } }),
    { outcome: "refused", reason: "INQUIRY_FAILED" },
  );
  assert.deepEqual(classifyResponse("inquiry", 0, null), { outcome: "unreachable", reason: "TRANSPORT" });
});

test("a refused answer proves the pool answered, and is not a pool failure", () => {
  // MODEL_REJECTED means the relay replied inside the deadline and the
  // scenario declined what it said. A probe that scored this as a dead pool
  // would blame the provider for its own payload.
  assert.deepEqual(
    classifyResponse("label", 200, { source: "provisional", fallbackReason: "MODEL_REJECTED" }),
    { outcome: "rejected", reason: "MODEL_REJECTED" },
  );
  assert.deepEqual(
    classifyResponse("inquiry", 503, { error: { code: "INQUIRY_FAILED", fallbackReason: "MODEL_REJECTED" } }),
    { outcome: "rejected", reason: "MODEL_REJECTED" },
  );
  const summary = summarize([
    sample("label", "rejected", "MODEL_REJECTED"),
    sample("repair", "model", null),
    sample("inquiry", "model", null),
  ]);
  assert.equal(summary.verdict, "pool-healthy");
  assert.deepEqual(summary.failures, []);
  assert.equal(summary.bySurface.label.reached, 1);
  assert.equal(summary.bySurface.label.model, 0);
});

test("never echoes a provider string as a reason", () => {
  // A relay's own message must not reach a report a person may paste into an
  // issue. Only the frozen scenario vocabulary is repeated.
  const classified = classifyResponse("repair", 200, {
    source: "verbatim",
    fallbackReason: "upstream relay 3 refused: key quota exhausted",
  });
  assert.equal(classified.outcome, "floor");
  assert.equal(classified.reason, "VERBATIM");
  const refused = classifyResponse("inquiry", 500, { error: { code: "some provider detail" } });
  assert.equal(refused.reason, "HTTP_500");
});

test("separates a pool-wide fault from a scenario-specific one", () => {
  const down = summarize([
    sample("repair", "floor", "MODEL_TIMEOUT"),
    sample("label", "floor", "MODEL_TIMEOUT"),
    sample("inquiry", "refused", "MODEL_TIMEOUT"),
  ]);
  assert.equal(down.verdict, "pool-down");
  assert.equal(down.failures.length, 3);

  const scenario = summarize([
    sample("repair", "model", null),
    sample("label", "model", null),
    sample("inquiry", "refused", "MODEL_TIMEOUT"),
  ]);
  assert.equal(scenario.verdict, "surface-specific");
  assert.deepEqual(scenario.failures, [
    "inquiry never reached a model across 1 call(s).",
  ]);

  const healthy = summarize([
    sample("repair", "model", null),
    sample("label", "model", null),
    sample("inquiry", "model", null),
  ]);
  assert.equal(healthy.verdict, "pool-healthy");
  assert.deepEqual(healthy.failures, []);
});

test("a single good round does not make a pool healthy on its own", () => {
  // #52 stayed misdiagnosed because one repair call answered. A mixed run
  // still reports every reason it saw, so the good round cannot stand alone.
  const summary = summarize([
    sample("inquiry", "model", null, 2_000),
    sample("inquiry", "refused", "MODEL_TIMEOUT", 16_000),
    sample("inquiry", "refused", "MODEL_TIMEOUT", 17_000),
  ]);
  assert.equal(summary.verdict, "pool-degraded");
  assert.deepEqual(summary.failures, [
    "inquiry reached a model on only 1 of 3 call(s).",
  ]);
  assert.deepEqual(summary.bySurface.inquiry.reasons, { MODEL_TIMEOUT: 2 });
  assert.deepEqual(summary.bySurface.inquiry.latencyMs, { min: 2_000, median: 16_000, max: 17_000 });
});

test("a degraded pool exits non-zero rather than reading as healthy", () => {
  // Every surface answered at least once, so a per-surface "did it ever work"
  // rule would call this healthy. It is the failure #52 lived inside.
  const summary = summarize([
    sample("repair", "model", null),
    sample("repair", "floor", "MODEL_TIMEOUT"),
    sample("label", "model", null),
    sample("label", "floor", "MODEL_TIMEOUT"),
    sample("inquiry", "model", null),
    sample("inquiry", "refused", "MODEL_TIMEOUT"),
  ]);
  assert.equal(summary.verdict, "pool-degraded");
  assert.equal(summary.failures.length, 3);
});

test("varies label material per round so the cache cannot answer for the pool", () => {
  assert.notEqual(labelRequest(1).text, labelRequest(2).text);
  assert.notEqual(labelRequest(1).basis.nodeId, labelRequest(2).basis.nodeId);
  assert.notEqual(inquiryRequest(1).context.lineage[0].text, inquiryRequest(2).context.lineage[0].text);
  assert.notEqual(repairRequest(1).text, repairRequest(2).text);
});

test("runs every surface each round and paces itself between rounds", async () => {
  const calls = [];
  const slept = [];
  let clock = 0;
  const result = await probeModelPool({
    origin: "https://matter.ptoq.io",
    rounds: 2,
    paceMs: 6_000,
    now: () => (clock += 500),
    sleep: async (ms) => void slept.push(ms),
    fetchImpl: async (url, init) => {
      calls.push({ url, origin: init.headers.origin, site: init.headers["sec-fetch-site"] });
      return new Response(JSON.stringify({ source: "model", status: "answered", text: "…" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.deepEqual(calls.map((call) => call.url), [
    "https://matter.ptoq.io/api/repair",
    "https://matter.ptoq.io/api/label",
    "https://matter.ptoq.io/api/inquiry",
    "https://matter.ptoq.io/api/repair",
    "https://matter.ptoq.io/api/label",
    "https://matter.ptoq.io/api/inquiry",
  ]);
  // Inquiry admission refuses a cross-origin shape in production, so a probe
  // that omitted these would measure the origin check and report a dead pool.
  assert.ok(calls.every((call) => call.origin === "https://matter.ptoq.io"));
  assert.ok(calls.every((call) => call.site === "same-origin"));
  // Paced between rounds, never after the last one.
  assert.deepEqual(slept, [6_000]);
  assert.equal(result.summary.verdict, "pool-healthy");
});

test("keeps a deployment base path out of the browser Origin header", async () => {
  const calls = [];
  await probeModelPool({
    origin: "http://127.0.0.1:3210/matter/",
    rounds: 1,
    paceMs: 0,
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async (url, init) => {
      calls.push({ url, origin: init.headers.origin });
      return new Response(JSON.stringify({ source: "model", status: "answered", text: "…" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.deepEqual(calls.map((call) => call.url), [
    "http://127.0.0.1:3210/matter/api/repair",
    "http://127.0.0.1:3210/matter/api/label",
    "http://127.0.0.1:3210/matter/api/inquiry",
  ]);
  assert.ok(calls.every((call) => call.origin === "http://127.0.0.1:3210"));
});

test("records an unreachable origin instead of throwing out of the run", async () => {
  const result = await probeModelPool({
    origin: "https://matter.ptoq.io",
    rounds: 1,
    paceMs: 0,
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      throw new Error("connect ETIMEDOUT");
    },
  });
  assert.equal(result.summary.verdict, "pool-down");
  assert.deepEqual(result.summary.bySurface.repair.reasons, { TRANSPORT: 1 });
  assert.equal(result.samples.length, 3);
});

test("reports each surface with its reasons on one line", () => {
  const report = formatReport(
    "https://matter.ptoq.io",
    summarize([
      sample("repair", "floor", "MODEL_TIMEOUT", 4_000),
      sample("label", "model", null, 900),
      sample("inquiry", "refused", "MODEL_TIMEOUT", 16_000),
    ]),
  );
  assert.match(report, /pool-down|surface-specific/);
  assert.match(report, /repair\s+reached 0\/1/);
  assert.match(report, /MODEL_TIMEOUT×1/);
  assert.match(report, /label\s+reached 1\/1/);
});

test("bounds the run so a probe cannot become a load test", () => {
  assert.deepEqual(parseArguments([]), {
    origin: undefined,
    rounds: 6,
    paceMs: 6_000,
    requireInquiryAnswer: false,
  });
  assert.deepEqual(parseArguments([
    "https://matter.ptoq.io",
    "--rounds=3",
    "--pace=10",
    "--require-inquiry-answer",
  ]), {
    origin: "https://matter.ptoq.io",
    rounds: 3,
    paceMs: 10_000,
    requireInquiryAnswer: true,
  });
  assert.throws(() => parseArguments(["--rounds=0"]), /--rounds/);
  assert.throws(() => parseArguments(["--rounds=61"]), /--rounds/);
  assert.throws(() => parseArguments(["--pace=301"]), /--pace/);
  assert.throws(() => parseArguments(["one", "two"]), /one origin/);
});

test("release gate requires every Inquiry sample to contain a real answer", () => {
  const answered = summarize([
    sample("repair", "rejected", "MODEL_REJECTED"),
    sample("label", "rejected", "MODEL_REJECTED"),
    sample("inquiry", "model", null),
  ]);
  assert.deepEqual(probeGateFailures(answered, { requireInquiryAnswer: true }), []);

  const rejected = summarize([
    sample("repair", "model", null),
    sample("label", "model", null),
    sample("inquiry", "rejected", "MODEL_REJECTED"),
  ]);
  assert.equal(rejected.verdict, "pool-healthy");
  assert.match(probeGateFailures(rejected, { requireInquiryAnswer: true })[0], /0\/1/u);
  assert.deepEqual(probeGateFailures(rejected), []);
});

function sample(surface, outcome, reason, durationMs = 1_000) {
  return Object.freeze({ round: 1, surface, status: 200, durationMs, outcome, reason });
}

test("marks attribution risk inside the process-local health window", () => {
  // Two failures cool a candidate for a minute. A run paced under that reports
  // its own cooldown back to the operator as if it were the relay — the exact
  // shape of misdiagnosis this probe exists to prevent.
  const failing = summarize([
    sample("inquiry", "refused", "MODEL_TIMEOUT"),
    sample("inquiry", "refused", "MODEL_TIMEOUT"),
    sample("repair", "model", null),
  ]);
  const caveat = pacingCaveat(failing, 6_000);
  assert.ok(caveat !== null);
  assert.match(caveat, /inquiry/u);
  assert.match(caveat, /--pace=/u);
  // Above the cooldown there is nothing to warn about.
  assert.equal(pacingCaveat(failing, POOL_COOLDOWN_MS), null);
  // Nor when nothing has failed often enough to cool anything.
  const healthy = summarize([sample("inquiry", "model", null), sample("repair", "model", null)]);
  assert.equal(pacingCaveat(healthy, 6_000), null);
  // An operator who did not state a pace is not told a number they did not use.
  assert.equal(pacingCaveat(failing, undefined), null);
});

test("carries the pacing caveat into the printed report", () => {
  const report = formatReport(
    "https://matter.test",
    summarize([
      sample("inquiry", "refused", "MODEL_TIMEOUT"),
      sample("inquiry", "refused", "MODEL_TIMEOUT"),
    ]),
    { paceMs: 6_000 },
  );
  assert.match(report, /candidate-health window/u);
  // And stays silent when the caller says nothing about pacing.
  assert.doesNotMatch(
    formatReport("https://matter.test", summarize([sample("inquiry", "model", null)])),
    /candidate-health window/u,
  );
});
