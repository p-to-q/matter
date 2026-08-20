import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveExpandInPlaceLength,
} from "../features/matter/protocol/expand-in-place-policy";
import {
  deriveTextSwapLength,
  normalizeTextSwapDirection,
} from "../features/matter/protocol/text-swap-policy";
import {
  ScenarioGovernor,
  runScenario,
} from "../features/matter/server/harness";
import {
  createPoolAdapter,
  readModelPool,
  resetPoolHealth,
} from "../features/matter/server/model-pool";
import {
  TRANSFORM_PROMPT_VERSION,
  TRANSFORM_SCENARIO,
} from "../features/matter/server/transform-harness";
import {
  TEXT_SWAP_PROMPT_VERSION,
  TEXT_SWAP_SCENARIO,
} from "../features/matter/server/text-swap-harness";
import {
  EVAL_REPEATS,
  SUPPORTED_LOCALES,
  buildEvaluationMatrix,
  createReviewerPackets,
  evaluatePromotion,
  executeEvaluationMatrix,
  expectedEvaluationCalls,
  formatSafeEvaluationSummary,
  inspectCorpusCoverage,
  reviewContent,
  summarizeEvaluation,
  summarizeHumanReviews,
} from "./material-language-eval-core.mjs";
import {
  TRANSFORM_AMOUNTS,
  TRANSFORM_CLASSES,
  TRANSFORM_CORPUS_VERSION,
  TRANSFORM_LIVE_CORPUS,
} from "./transform-live-corpus.mjs";
import {
  TEXT_SWAP_CLASSES,
  TEXT_SWAP_CORPUS_VERSION,
  TEXT_SWAP_DIRECTION_FAMILIES,
  TEXT_SWAP_LIVE_CORPUS,
  textSwapDirection,
} from "./text-swap-live-corpus.mjs";

const LIVE_ENABLED = process.env.MATTER_LANGUAGE_EVAL === "1";
const REPORT_ROOT = resolve(process.cwd(), "tmp", "material-language-eval");

describe("material language live corpora", () => {
  it("forms an exact 5 locale by 12 class by 3 axis matrix for each scenario", () => {
    const transform = inspectCorpusCoverage({
      baseCases: TRANSFORM_LIVE_CORPUS,
      axes: TRANSFORM_AMOUNTS,
      classes: TRANSFORM_CLASSES,
    });
    const textSwap = inspectCorpusCoverage({
      baseCases: TEXT_SWAP_LIVE_CORPUS,
      axes: TEXT_SWAP_DIRECTION_FAMILIES,
      classes: TEXT_SWAP_CLASSES,
    });

    expect(transform).toMatchObject({ ok: true, baseCount: 60, matrixCount: 180 });
    expect(transform.failures).toEqual([]);
    expect(textSwap).toMatchObject({ ok: true, baseCount: 60, matrixCount: 180 });
    expect(textSwap.failures).toEqual([]);
    expect(new Set(TRANSFORM_LIVE_CORPUS.map((item) => item.locale))).toEqual(new Set(SUPPORTED_LOCALES));
    expect(new Set(TEXT_SWAP_LIVE_CORPUS.map((item) => item.locale))).toEqual(new Set(SUPPORTED_LOCALES));
  });

  it("preflights every production length and bounded Text Swap direction", () => {
    for (const item of buildEvaluationMatrix(TRANSFORM_LIVE_CORPUS, TRANSFORM_AMOUNTS)) {
      expect(
        deriveExpandInPlaceLength(
          item.base.passage,
          item.base.before,
          item.base.after,
          item.axis.amount,
        ),
        item.id,
      ).not.toBeNull();
    }
    for (const item of buildEvaluationMatrix(TEXT_SWAP_LIVE_CORPUS, TEXT_SWAP_DIRECTION_FAMILIES)) {
      expect(
        deriveTextSwapLength(item.base.passage, item.base.before, item.base.after),
        item.id,
      ).not.toBeNull();
      expect(normalizeTextSwapDirection(textSwapDirection(item.base, item.axis.id)), item.id)
        .not.toBeNull();
    }
  });
});

describe("material language evaluation core", () => {
  it("prepares a unique writable artifact directory before a live invocation", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "matter-language-eval-"));
    const root = resolve(parent, "missing", "material-language-eval");
    try {
      await expect(stat(root)).rejects.toThrow();
      const directory = await prepareRunDirectory(
        root,
        "transform",
        new Date("2026-08-20T12:34:56.789Z"),
      );
      expect((await stat(directory)).isDirectory()).toBe(true);
      expect(relative(root, directory)).toBe("2026-08-20T12-34-56-789Z-transform");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("makes a failed artifact preflight leave provider invocation at zero", async () => {
    let calls = 0;
    await expect(executeAfterArtifactPreflight({
      prepare: async () => {
        throw new Error("REPORT_ROOT_UNWRITABLE");
      },
      execute: async () => {
        calls += 1;
        return acceptedInvocation();
      },
    })).rejects.toThrow("REPORT_ROOT_UNWRITABLE");
    expect(calls).toBe(0);
  });

  it("requires the exact 360-call confirmation before invoking anything", async () => {
    const matrix = tinyMatrix();
    let calls = 0;
    await expect(executeEvaluationMatrix({
      matrix,
      confirmedCalls: 3,
      repeats: 2,
      invoke: async () => {
        calls += 1;
        return acceptedInvocation();
      },
    })).rejects.toThrow("confirmCalls=4");
    expect(calls).toBe(0);
  });

  it("runs two planned samples per case and never retries a failure", async () => {
    const matrix = tinyMatrix();
    const calls = [];
    const result = await executeEvaluationMatrix({
      matrix,
      confirmedCalls: 4,
      repeats: 2,
      invoke: async (item, repeat) => {
        calls.push(`${item.id}/${repeat}`);
        if (item.id === "case-a/axis-a" && repeat === 1) throw new Error("PRIVATE_PROVIDER_BODY");
        return acceptedInvocation();
      },
    });

    expect(calls).toEqual([
      "case-a/axis-a/1",
      "case-a/axis-a/2",
      "case-b/axis-a/1",
      "case-b/axis-a/2",
    ]);
    expect(result.samples).toHaveLength(4);
    expect(result.samples[0]).toMatchObject({ outcome: "unavailable", reason: "UNAVAILABLE" });
    expect(JSON.stringify(result.samples)).not.toContain("PRIVATE_PROVIDER_BODY");
  });

  it("computes acceptance, per-bucket latency, and strict accept/reject stability", () => {
    const samples = [
      sample("a", "accepted", 10, 1, "zh-CN", "amount-02", "short"),
      sample("a", "accepted", 20, 2, "zh-CN", "amount-02", "short"),
      sample("b", "accepted", 30, 1, "en-US", "amount-10", "long"),
      sample("b", "rejected", 40, 2, "en-US", "amount-10", "long", "NO_CHANGE"),
      sample("c", "unavailable", 50, 1, "ja-JP", "amount-06", "medium", "MODEL_UNAVAILABLE"),
      sample("c", "unavailable", 60, 2, "ja-JP", "amount-06", "medium", "MODEL_UNAVAILABLE"),
    ];
    const summary = summarizeEvaluation(samples);

    expect(summary).toMatchObject({
      cases: 3,
      calls: 6,
      accepted: 3,
      rejected: 1,
      unavailable: 2,
      acceptanceRate: 0.5,
      latencyMs: { p50: 30, p95: 60, max: 60 },
      stability: { stableCases: 1, totalCases: 3, rate: 0.333333 },
    });
    expect(summary.byAxis["amount-02"].acceptanceRate).toBe(1);
    expect(summary.byLengthBucket.long.acceptanceRate).toBe(0.5);
  });

  it("keeps raw material and provider failures out of safe summaries", async () => {
    const sentinel = "RAW_MATERIAL_AND_RESPONSE_SENTINEL";
    const matrix = tinyMatrix().slice(0, 1);
    const result = await executeEvaluationMatrix({
      matrix,
      confirmedCalls: 2,
      invoke: async () => ({
        outcome: "accepted",
        reason: null,
        latencyMs: 12,
        privateData: {
          scenario: "transform",
          passage: sentinel,
          before: "",
          after: "",
          lineage: [],
          amount: 0.2,
          response: sentinel,
        },
      }),
    });
    const metrics = summarizeEvaluation(result.samples);
    const promotion = evaluatePromotion(
      "transform",
      metrics,
      summarizeHumanReviews([], [], ["review-0001"]),
    );
    const report = formatSafeEvaluationSummary("transform", metrics, promotion);

    expect(JSON.stringify(metrics)).not.toContain(sentinel);
    expect(report).not.toContain(sentinel);
    expect(JSON.stringify(createReviewerPackets(result.privateRecords))).toContain(sentinel);
  });

  it("cannot pass without two complete independent reviews", () => {
    const privateRecords = [privateAcceptedRecord("case-a/axis-a", 1)];
    const packets = createReviewerPackets(privateRecords);
    const pending = summarizeHumanReviews(
      packets.reviewerA,
      packets.reviewerB,
      packets.expectedReviewIds,
    );
    const metrics = passingMetrics();

    expect(pending.complete).toBe(false);
    expect(evaluatePromotion("transform", metrics, pending)).toMatchObject({
      pass: false,
      status: "blocked",
    });

    const reviewerA = completeReviewRows(packets.reviewerA);
    const reviewerB = completeReviewRows(packets.reviewerB);
    const complete = summarizeHumanReviews(reviewerA, reviewerB, packets.expectedReviewIds);
    expect(complete).toMatchObject({ complete: true, criticalDrift: 0, usefulRate: 1 });
    expect(evaluatePromotion("transform", metrics, complete)).toMatchObject({ pass: true, status: "pass" });
    expect(evaluatePromotion("text-swap", metrics, complete)).toMatchObject({
      pass: false,
      status: "calibration-only",
    });
  });
});

describe.runIf(LIVE_ENABLED)("material language live evaluation", () => {
  it("runs only one explicitly selected singleton candidate", { timeout: 2 * 60 * 60_000 }, async () => {
    await loadLocalEnvironment();
    const mode = process.env.MATTER_LANGUAGE_EVAL_MODE ?? "run";
    if (mode === "score") {
      await scoreExistingRun(process.env.MATTER_LANGUAGE_EVAL_SCORE_DIR ?? "");
      return;
    }
    if (mode !== "run") throw new Error("MATTER_LANGUAGE_EVAL_MODE must be run or score.");
    await runLiveEvaluation();
  });
});

async function runLiveEvaluation() {
  const definition = scenarioDefinition(process.env.MATTER_LANGUAGE_EVAL_SCENARIO ?? "");
  const coverage = inspectCorpusCoverage({
    baseCases: definition.corpus,
    axes: definition.axes,
    classes: definition.classes,
  });
  if (!coverage.ok) throw new Error("The selected synthetic corpus failed its frozen coverage check.");
  const matrix = buildEvaluationMatrix(definition.corpus, definition.axes);
  const prepared = matrix.map((item) => Object.freeze({ ...item, input: definition.prepare(item) }));
  const expectedCalls = expectedEvaluationCalls(prepared, EVAL_REPEATS);
  const confirmedCalls = wholeNumber(
    process.env.MATTER_LANGUAGE_EVAL_CONFIRM_CALLS,
    0,
    100_000,
    "MATTER_LANGUAGE_EVAL_CONFIRM_CALLS",
  );
  const paceMs = optionalWholeNumber(
    process.env.MATTER_LANGUAGE_EVAL_PACE_MS,
    250,
    0,
    10_000,
    "MATTER_LANGUAGE_EVAL_PACE_MS",
  );
  const pool = readModelPool(process.env);
  const candidateIndex = wholeNumber(
    process.env.MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX,
    1,
    Math.max(1, pool.length),
    "MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX",
  );
  const candidate = pool[candidateIndex - 1];
  if (candidate === undefined) throw new Error("The selected candidate is not configured in the local model pool.");

  // This is the last local gate before the first paid request.
  if (confirmedCalls !== expectedCalls) {
    throw new Error(`Live evaluation requires confirmCalls=${expectedCalls} before any request.`);
  }
  // Provision the private receipt before the first paid request. A missing or
  // unwritable report root must fail with zero provider calls, never after 360.
  const running = { accepted: 0, rejected: 0, unavailable: 0 };
  const { artifact: directory, result } = await executeAfterArtifactPreflight({
    prepare: () => prepareRunDirectory(REPORT_ROOT, definition.id, new Date()),
    execute: async () => {
      resetPoolHealth();
      const adapter = createPoolAdapter(Object.freeze([candidate]));
      return executeEvaluationMatrix({
        matrix: prepared,
        confirmedCalls,
        repeats: EVAL_REPEATS,
        paceMs,
        invoke: (item) => invokeScenario(definition, item, adapter),
        onProgress: ({ completed, callCount, sample: own }) => {
          if (own.outcome === "accepted") running.accepted += 1;
          else if (own.outcome === "rejected") running.rejected += 1;
          else running.unavailable += 1;
          if (completed % 24 === 0 || completed === callCount) {
            console.log(
              `language-eval: candidate-${String(candidateIndex).padStart(2, "0")} ${definition.id}` +
                ` ${completed}/${callCount} accepted=${running.accepted}` +
                ` rejected=${running.rejected} unavailable=${running.unavailable}`,
            );
          }
        },
      });
    },
  });

  const metrics = summarizeEvaluation(result.samples);
  const packets = createReviewerPackets(result.privateRecords);
  const humanReview = summarizeHumanReviews(
    packets.reviewerA,
    packets.reviewerB,
    packets.expectedReviewIds,
  );
  const promotion = evaluatePromotion(definition.id, metrics, humanReview);
  await writeRunArtifacts({
    directory,
    definition,
    candidate,
    candidateIndex,
    metrics,
    promotion,
    privateRecords: result.privateRecords,
    packets,
  });
  console.log(formatSafeEvaluationSummary(definition.id, metrics, promotion));
  console.log(`language-eval: private artifacts ${relative(process.cwd(), directory)}`);
}

async function invokeScenario(definition, item, adapter) {
  const startedAt = Date.now();
  let response;
  const capturingAdapter = async (call, signal) => {
    const answer = await adapter(call, signal);
    response = answer.text;
    return answer;
  };
  const outcome = await runScenario(
    definition.scenario,
    item.input,
    capturingAdapter,
    new ScenarioGovernor(),
    { observe: () => undefined },
  );
  let classification;
  if (response !== undefined) {
    const verdict = definition.scenario.adjudicate(response, item.input);
    classification = verdict.ok
      ? { outcome: "accepted", reason: null }
      : { outcome: "rejected", reason: verdict.reason };
  } else {
    classification = fallbackClassification(outcome.ok ? null : outcome.fallback);
  }
  return Object.freeze({
    ...classification,
    latencyMs: Date.now() - startedAt,
    privateData: Object.freeze({
      scenario: definition.id,
      passage: item.input.passage,
      before: item.input.surrounding.before,
      after: item.input.surrounding.after,
      lineage: Object.freeze(item.input.lineage.map((entry) => entry.text)),
      ...(definition.id === "transform"
        ? { amount: item.input.amount }
        : { direction: item.input.direction }),
      response: response ?? null,
    }),
  });
}

function scenarioDefinition(id) {
  if (id === "transform") {
    return Object.freeze({
      id,
      scenario: TRANSFORM_SCENARIO,
      promptVersion: TRANSFORM_PROMPT_VERSION,
      corpusVersion: TRANSFORM_CORPUS_VERSION,
      corpus: TRANSFORM_LIVE_CORPUS,
      axes: TRANSFORM_AMOUNTS,
      classes: TRANSFORM_CLASSES,
      prepare: (item) => {
        const length = deriveExpandInPlaceLength(
          item.base.passage,
          item.base.before,
          item.base.after,
          item.axis.amount,
        );
        if (length === null) throw new Error(`Synthetic transform case ${item.id} has no valid length.`);
        return Object.freeze({
          locale: item.locale,
          passage: item.base.passage,
          amount: item.axis.amount,
          length,
          lineage: Object.freeze(item.base.lineage.map((text, depth) => Object.freeze({ depth, text }))),
          surrounding: Object.freeze({ before: item.base.before, after: item.base.after }),
        });
      },
    });
  }
  if (id === "text-swap") {
    return Object.freeze({
      id,
      scenario: TEXT_SWAP_SCENARIO,
      promptVersion: TEXT_SWAP_PROMPT_VERSION,
      corpusVersion: TEXT_SWAP_CORPUS_VERSION,
      corpus: TEXT_SWAP_LIVE_CORPUS,
      axes: TEXT_SWAP_DIRECTION_FAMILIES,
      classes: TEXT_SWAP_CLASSES,
      prepare: (item) => {
        const length = deriveTextSwapLength(item.base.passage, item.base.before, item.base.after);
        const direction = normalizeTextSwapDirection(textSwapDirection(item.base, item.axis.id));
        if (length === null || direction === null) {
          throw new Error(`Synthetic Text Swap case ${item.id} is outside its frozen policy.`);
        }
        return Object.freeze({
          locale: item.locale,
          passage: item.base.passage,
          direction,
          length,
          lineage: Object.freeze(item.base.lineage.map((text, depth) => Object.freeze({ depth, text }))),
          surrounding: Object.freeze({ before: item.base.before, after: item.base.after }),
        });
      },
    });
  }
  throw new Error("MATTER_LANGUAGE_EVAL_SCENARIO must be transform or text-swap.");
}

async function writeRunArtifacts({
  directory,
  definition,
  candidate,
  candidateIndex,
  metrics,
  promotion,
  privateRecords,
  packets,
}) {
  const summary = Object.freeze({
    schemaVersion: "material-language-eval/1",
    generatedAt: new Date().toISOString(),
    scenario: definition.id,
    promptVersion: definition.promptVersion,
    corpusVersion: definition.corpusVersion,
    candidateOrdinal: candidateIndex,
    repeats: EVAL_REPEATS,
    metrics,
    promotion,
  });
  const key = Object.freeze({
    schemaVersion: "material-language-review-key/1",
    expected: Object.freeze(packets.reviewerA.map((row) => Object.freeze({
      reviewId: row.reviewId,
      digest: digestReviewContent(row),
    })).sort((left, right) => left.reviewId.localeCompare(right.reviewId))),
  });
  await Promise.all([
    writeJson(resolve(directory, "summary.json"), summary),
    writeJson(resolve(directory, "run.private.json"), {
      candidate: { station: candidate.station, model: candidate.model },
    }),
    writeFile(
      resolve(directory, "samples.private.jsonl"),
      `${privateRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8",
    ),
    writeJson(resolve(directory, "review-key.json"), key),
    writeJson(resolve(directory, "reviewer-a.json"), packets.reviewerA),
    writeJson(resolve(directory, "reviewer-b.json"), packets.reviewerB),
  ]);
  return directory;
}

async function prepareRunDirectory(root, scenario, startedAt) {
  await mkdir(root, { recursive: true });
  const runId = `${startedAt.toISOString().replaceAll(/[:.]/gu, "-")}-${scenario}`;
  const directory = resolve(root, runId);
  await mkdir(directory, { recursive: false });
  return directory;
}

async function executeAfterArtifactPreflight({ prepare, execute }) {
  const artifact = await prepare();
  const result = await execute();
  return Object.freeze({ artifact, result });
}

async function scoreExistingRun(rawDirectory) {
  const directory = safeReportDirectory(rawDirectory);
  const [summary, key, reviewerA, reviewerB] = await Promise.all([
    readJson(resolve(directory, "summary.json")),
    readJson(resolve(directory, "review-key.json")),
    readJson(resolve(directory, "reviewer-a.json")),
    readJson(resolve(directory, "reviewer-b.json")),
  ]);
  const expected = Array.isArray(key?.expected) ? key.expected : [];
  verifyReviewRows(reviewerA, expected, "reviewer-a");
  verifyReviewRows(reviewerB, expected, "reviewer-b");
  const expectedIds = expected.map((entry) => entry.reviewId);
  const humanReview = summarizeHumanReviews(reviewerA, reviewerB, expectedIds);
  const promotion = evaluatePromotion(summary?.scenario, summary?.metrics, humanReview);
  await writeJson(resolve(directory, "promotion.json"), Object.freeze({
    schemaVersion: "material-language-promotion/1",
    scoredAt: new Date().toISOString(),
    scenario: summary?.scenario,
    promotion,
  }));
  console.log(formatSafeEvaluationSummary(summary?.scenario, summary?.metrics, promotion));
  console.log(`language-eval: scored private artifacts ${relative(process.cwd(), directory)}`);
}

function verifyReviewRows(rows, expected, label) {
  if (!Array.isArray(rows) || rows.length !== expected.length) {
    throw new Error(`${label} does not contain the frozen review set.`);
  }
  const known = new Map(expected.map((entry) => [entry.reviewId, entry.digest]));
  const seen = new Set();
  for (const row of rows) {
    if (typeof row?.reviewId !== "string" || seen.has(row.reviewId)) {
      throw new Error(`${label} contains an invalid review id.`);
    }
    seen.add(row.reviewId);
    if (known.get(row.reviewId) !== digestReviewContent(row)) {
      throw new Error(`${label} changed frozen review material.`);
    }
  }
}

function safeReportDirectory(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("MATTER_LANGUAGE_EVAL_SCORE_DIR must name one prior tmp report directory.");
  }
  const directory = resolve(value);
  const child = relative(REPORT_ROOT, directory);
  if (child === "" || child.startsWith("..") || isAbsolute(child)) {
    throw new Error("Review scoring is limited to tmp/material-language-eval reports.");
  }
  return directory;
}

function digestReviewContent(row) {
  return createHash("sha256").update(JSON.stringify(reviewContent(row))).digest("hex");
}

function fallbackClassification(reason) {
  if (reason === "MODEL_TIMEOUT") return Object.freeze({ outcome: "timeout", reason });
  if (reason === "MODEL_BUSY") return Object.freeze({ outcome: "busy", reason });
  return Object.freeze({ outcome: "unavailable", reason: reason ?? "MODEL_UNAVAILABLE" });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadLocalEnvironment() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (match !== null) process.env[match[1]] ??= match[2];
    }
  } catch {
    // A deployment or explicit shell environment may own the pool instead.
  }
}

function wholeNumber(raw, min, max, name) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function optionalWholeNumber(raw, fallback, min, max, name) {
  return raw === undefined ? fallback : wholeNumber(raw, min, max, name);
}

function tinyMatrix() {
  const axis = Object.freeze({ id: "axis-a" });
  return Object.freeze([
    Object.freeze({
      id: "case-a/axis-a",
      locale: "zh-CN",
      classId: "ordinary",
      lengthBucket: "short",
      base: Object.freeze({ id: "case-a" }),
      axis,
    }),
    Object.freeze({
      id: "case-b/axis-a",
      locale: "en-US",
      classId: "ordinary",
      lengthBucket: "long",
      base: Object.freeze({ id: "case-b" }),
      axis,
    }),
  ]);
}

function acceptedInvocation() {
  return Object.freeze({ outcome: "accepted", reason: null, latencyMs: 1, privateData: null });
}

function sample(caseId, outcome, latencyMs, repeat, locale, axisId, lengthBucket, reason = null) {
  return Object.freeze({
    caseId,
    locale,
    classId: "ordinary",
    axisId,
    lengthBucket,
    repeat,
    outcome,
    reason,
    latencyMs,
  });
}

function privateAcceptedRecord(caseId, repeat) {
  return Object.freeze({
    sample: sample(caseId, "accepted", 10, repeat, "en-US", "amount-02", "short"),
    material: Object.freeze({
      scenario: "transform",
      passage: "The room became quiet",
      before: "After the door closed, ",
      after: ".",
      lineage: Object.freeze(["About the empty room"]),
      amount: 0.2,
      response: "The room gradually became completely quiet",
    }),
  });
}

function completeReviewRows(rows) {
  return rows.map((row) => Object.freeze({
    ...row,
    decision: Object.freeze({
      criticalDrift: false,
      useful: true,
      preservesVoice: true,
      preservesUnfinishedness: true,
      preservesSeam: true,
      notes: "",
    }),
  }));
}

function passingMetrics() {
  const perfect = Object.freeze({
    calls: 10,
    accepted: 10,
    rejected: 0,
    unavailable: 0,
    acceptanceRate: 1,
    latencyMs: Object.freeze({ p50: 1, p95: 1, max: 1 }),
  });
  return Object.freeze({
    cases: 5,
    calls: 10,
    ...perfect,
    stability: Object.freeze({ stableCases: 5, totalCases: 5, rate: 1 }),
    reasons: Object.freeze({}),
    byLocale: Object.freeze(Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, perfect]))),
    byAxis: Object.freeze({ "amount-02": perfect, "amount-06": perfect, "amount-10": perfect }),
    byLengthBucket: Object.freeze({ short: perfect, medium: perfect, long: perfect }),
  });
}
