import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { segmentText } from "../features/matter/material/text-segments";
import {
  EXPAND_IN_PLACE_POLICY_VERSION,
  deriveExpandInPlaceLength,
} from "../features/matter/protocol/expand-in-place-policy";
import {
  TEXT_SWAP_POLICY_VERSION,
  deriveTextSwapLength,
  normalizeTextSwapDirection,
} from "../features/matter/protocol/text-swap-policy";
import { COMPLETION_OUTCOME_POLICY_VERSION } from "../features/matter/server/completion-outcome";
import {
  ScenarioGovernor,
  runScenario,
} from "../features/matter/server/harness";
import {
  DEFAULT_POOL_LIMITS,
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
  countExtendedGraphemes,
  createReviewerPackets,
  evaluationPlanDigest,
  evaluatePromotion,
  executeEvaluationMatrix,
  expectedEvaluationCalls,
  formatSafeEvaluationSummary,
  inspectCorpusCoverage,
  requireEvaluationPlanAuthorization,
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
    expect({
      transform: TRANSFORM_LIVE_CORPUS
        .filter((item) => !isExactCurrentSegment(item)).map((item) => item.id),
      textSwap: TEXT_SWAP_LIVE_CORPUS
        .filter((item) => !isExactCurrentSegment(item)).map((item) => item.id),
    }).toEqual({ transform: [], textSwap: [] });
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

  it("freezes each locale's source-length buckets from real extended grapheme counts", () => {
    for (const corpus of [TRANSFORM_LIVE_CORPUS, TEXT_SWAP_LIVE_CORPUS]) {
      for (const item of corpus) {
        expect(item.sourceGraphemes, item.id).toBe(countExtendedGraphemes(item.passage));
      }
      for (const locale of SUPPORTED_LOCALES) {
        const ranked = corpus
          .filter((item) => item.locale === locale)
          .toSorted((left, right) =>
            left.sourceGraphemes - right.sourceGraphemes || left.id.localeCompare(right.id));
        expect(ranked.map((item) => item.lengthBucket)).toEqual([
          ...Array(4).fill("short"),
          ...Array(4).fill("medium"),
          ...Array(4).fill("long"),
        ]);
      }
    }

    const changedText = TRANSFORM_LIVE_CORPUS.map((item, index) => index === 0
      ? Object.freeze({ ...item, passage: `${item.passage}🙂` })
      : item);
    expect(inspectCorpusCoverage({
      baseCases: changedText,
      axes: TRANSFORM_AMOUNTS,
      classes: TRANSFORM_CLASSES,
    }).failures).toContain(
      `graphemes:${TRANSFORM_LIVE_CORPUS[0].id}:` +
      `${TRANSFORM_LIVE_CORPUS[0].sourceGraphemes}/${TRANSFORM_LIVE_CORPUS[0].sourceGraphemes + 1}`,
    );
    const relabelled = TRANSFORM_LIVE_CORPUS.map((item, index) => index === 0
      ? Object.freeze({ ...item, lengthBucket: "long" })
      : item);
    expect(inspectCorpusCoverage({
      baseCases: relabelled,
      axes: TRANSFORM_AMOUNTS,
      classes: TRANSFORM_CLASSES,
    }).failures).toContain(`length-rank:${TRANSFORM_LIVE_CORPUS[0].id}:long/short`);
  });

  it("rejects a non-segment corpus row during preparation with zero provider work", () => {
    const definition = scenarioDefinition("transform");
    const source = buildEvaluationMatrix(definition.corpus, definition.axes)[0];
    const invalid = Object.freeze({
      ...source,
      base: Object.freeze({
        ...source.base,
        passage: `${source.base.passage}，这是第二段`,
      }),
    });
    let providerCalls = 0;

    expect(() => {
      const prepared = prepareEvaluationMatrix(definition, [invalid]);
      for (const item of prepared) {
        providerCalls += 1;
        void item;
      }
    }).toThrow("not one current punctuation segment");
    expect(providerCalls).toBe(0);
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
      const definition = scenarioDefinition("transform");
      await initializeRunArtifacts({
        directory,
        definition,
        candidate: { station: "private-station", model: "private-model" },
        candidateIndex: 1,
        expectedCalls: 360,
        plan: testEvaluationPlan(),
        planDigest: "a".repeat(64),
        startedAt: new Date("2026-08-20T12:34:56.789Z"),
      });
      expect(await readJson(resolve(directory, "run.json"))).toMatchObject({
        status: "running",
        expectedCalls: 360,
        completedCalls: 0,
        planDigest: "a".repeat(64),
      });
      expect(await readFile(resolve(directory, "samples.jsonl"), "utf8")).toBe("");
      expect(await readFile(resolve(directory, "samples.private.jsonl"), "utf8")).toBe("");
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

  it("binds paid authority to every private plan input before provider work", () => {
    const localPlan = testEvaluationPlan();
    const digest = evaluationPlanDigest(localPlan);
    const artifact = Object.freeze({
      schemaVersion: "material-language-eval-plan/1",
      generatedAt: "2026-08-20T12:34:56.789Z",
      digest,
      plan: localPlan,
    });
    expect(requireEvaluationPlanAuthorization({
      localPlan,
      artifact,
      suppliedDigest: digest,
    })).toBe(digest);

    const mismatches = [
      { ...localPlan, scenario: "text-swap" },
      { ...localPlan, candidate: { ...localPlan.candidate, station: "changed-station" } },
      { ...localPlan, candidate: { ...localPlan.candidate, model: "changed-model" } },
      { ...localPlan, candidate: { ...localPlan.candidate, enableThinking: true } },
      { ...localPlan, candidate: { ...localPlan.candidate, endpointDigest: "0".repeat(64) } },
      { ...localPlan, promptVersion: "transform/changed" },
      { ...localPlan, compiledPromptDigest: "0".repeat(64) },
      { ...localPlan, executionContract: { ...localPlan.executionContract, completionPolicyVersion: "changed" } },
      { ...localPlan, executionContract: { ...localPlan.executionContract, caseBudgetsDigest: "0".repeat(64) } },
      { ...localPlan, corpusVersion: "transform-live-corpus/changed" },
      { ...localPlan, corpus: [{ ...localPlan.corpus[0], passage: "changed material" }] },
      { ...localPlan, axes: [{ id: "amount-03", amount: 0.3 }] },
      { ...localPlan, repeats: 3 },
      { ...localPlan, ceilings: { ...localPlan.ceilings, calls: 361 } },
      { ...localPlan, ceilings: { ...localPlan.ceilings, outputTokens: 99_999 } },
    ];
    let providerCalls = 0;
    for (const changed of mismatches) {
      expect(() => {
        requireEvaluationPlanAuthorization({
          localPlan: changed,
          artifact,
          suppliedDigest: digest,
        });
        providerCalls += 1;
      }).toThrow("does not match its pre-generated private plan digest");
    }
    expect(providerCalls).toBe(0);
    expect(() => requireEvaluationPlanAuthorization({
      localPlan,
      artifact,
      suppliedDigest: "0".repeat(64),
    })).toThrow("does not match its pre-generated private plan digest");
  });

  it("recomputes the exact output-token ceiling before scoring an old run", () => {
    const definition = scenarioDefinition("transform");
    const prepared = prepareEvaluationMatrix(
      definition,
      buildEvaluationMatrix(definition.corpus, definition.axes),
    );
    const candidate = evaluationCandidate({ station: "private-station", model: "private-model" });
    const plan = Object.freeze({
      schemaVersion: "material-language-eval-authority/3",
      scenario: definition.id,
      candidate: evaluationCandidate(candidate),
      promptVersion: definition.promptVersion,
      compiledPromptDigest: compiledPromptDigest(definition, prepared),
      executionContract: evaluationExecutionContract(definition, prepared),
      corpusVersion: definition.corpusVersion,
      corpus: definition.corpus,
      axes: definition.axes,
      repeats: EVAL_REPEATS,
      ceilings: Object.freeze({
        calls: expectedEvaluationCalls(prepared, EVAL_REPEATS),
        outputTokens: expectedEvaluationOutputTokenCeiling(definition, prepared),
      }),
    });
    const planDigest = evaluationPlanDigest(plan);
    const run = Object.freeze({ planDigest });
    expect(() => verifyPrivateRunAuthority(Object.freeze({
      schemaVersion: "material-language-run-private/1",
      candidate,
      planDigest,
      plan,
    }), run, definition)).not.toThrow();

    const changedPlan = Object.freeze({
      ...plan,
      ceilings: Object.freeze({
        ...plan.ceilings,
        outputTokens: plan.ceilings.outputTokens + 1,
      }),
    });
    const changedDigest = evaluationPlanDigest(changedPlan);
    expect(() => verifyPrivateRunAuthority(Object.freeze({
      schemaVersion: "material-language-run-private/1",
      candidate,
      planDigest: changedDigest,
      plan: changedPlan,
    }), Object.freeze({ planDigest: changedDigest }), definition))
      .toThrow("does not match the paid evaluation plan");
  });

  it("stops before a second paid call when a durable sample receipt cannot be written", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "matter-language-journal-"));
    await Promise.all([
      writeFile(resolve(directory, "samples.jsonl"), "", "utf8"),
      writeFile(resolve(directory, "samples.private.jsonl"), "", "utf8"),
    ]);
    let calls = 0;
    let writes = 0;
    try {
      await expect(executeEvaluationMatrix({
        matrix: tinyMatrix(),
        confirmedCalls: 4,
        repeats: 2,
        invoke: async () => {
          calls += 1;
          return acceptedInvocation();
        },
        onProgress: (progress) => appendEvaluationReceipt(
          directory,
          progress,
          async (path, data, encoding) => {
            writes += 1;
            if (writes === 2) throw new Error("PRIVATE_JOURNAL_UNWRITABLE");
            return appendFile(path, data, encoding);
          },
        ),
      })).rejects.toThrow("PRIVATE_JOURNAL_UNWRITABLE");
      expect(calls).toBe(1);
      expect(await readJsonLines(resolve(directory, "samples.jsonl"))).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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

  it("reports Text Swap usefulness and direction following by evidence bucket", () => {
    const packets = createReviewerPackets([
      privateTextSwapAcceptedRecord("case-a/clarity", 1, "zh-CN", "clarity", "short"),
      privateTextSwapAcceptedRecord("case-b/emphasis", 1, "en-US", "emphasis", "long"),
    ]);
    const reviewerA = completeReviewRows(packets.reviewerA);
    const missingDirectionDecision = reviewerA.map((row, index) => {
      if (index !== 0) return row;
      const decision = { ...row.decision };
      Reflect.deleteProperty(decision, "followsDirection");
      return Object.freeze({ ...row, decision: Object.freeze(decision) });
    });
    expect(summarizeHumanReviews(
      missingDirectionDecision,
      completeReviewRows(packets.reviewerB),
      packets.expectedReviewIds,
    ).complete).toBe(false);
    const reviewerB = completeReviewRows(packets.reviewerB).map((row) => row.axisId === "emphasis"
      ? Object.freeze({
        ...row,
        decision: Object.freeze({ ...row.decision, followsDirection: false }),
      })
      : row);
    const summary = summarizeHumanReviews(reviewerA, reviewerB, packets.expectedReviewIds);

    expect(summary).toMatchObject({
      complete: true,
      reviewedOutputs: 2,
      useful: 2,
      usefulRate: 1,
      followsDirection: 1,
      followsDirectionRate: 0.5,
      byLocale: {
        "zh-CN": { usefulRate: 1, followsDirectionRate: 1 },
        "en-US": { usefulRate: 1, followsDirectionRate: 0 },
      },
      byDirection: {
        clarity: { usefulRate: 1, followsDirectionRate: 1 },
        emphasis: { usefulRate: 1, followsDirectionRate: 0 },
      },
      bySourceLengthBucket: {
        short: { usefulRate: 1, followsDirectionRate: 1 },
        long: { usefulRate: 1, followsDirectionRate: 0 },
      },
    });
    expect(evaluatePromotion("text-swap", passingMetrics(), summary)).toMatchObject({
      status: "calibration-only",
      pass: false,
    });
  });

  it("refuses incomplete receipts and recomputes metrics instead of trusting a summary", () => {
    const definition = scenarioDefinition("transform");
    const samples = completedSampleReceipt(definition);
    const run = completedRunReceipt(definition, samples.length);
    const summary = {
      schemaVersion: "material-language-eval/1",
      candidateOrdinal: 1,
      scenario: definition.id,
      planDigest: run.planDigest,
      metrics: summarizeEvaluation(samples),
    };

    expect(() => verifyCompletedRun(run, summary, samples.slice(0, -1)))
      .toThrow("sample receipt is incomplete");
    expect(() => verifySavedMetrics({ ...summary.metrics, accepted: 359 }, samples))
      .toThrow("summary does not match");
    expect(verifySavedMetrics(summary.metrics, samples)).toEqual(summary.metrics);
  });

  it("rejects review packets copied from another run with the same accepted count", () => {
    const planDigest = "a".repeat(64);
    const ownRecords = [privateAcceptedRecord("case-a/axis-a", 1)];
    const foreignRecords = [Object.freeze({
      ...privateAcceptedRecord("case-a/axis-a", 1),
      material: Object.freeze({
        ...privateAcceptedRecord("case-a/axis-a", 1).material,
        response: "A different run returned unrelated review material",
      }),
    })];
    const foreignPackets = createReviewerPackets(foreignRecords);
    const foreignKey = createReviewKey(
      foreignPackets,
      planDigest,
      digestPrivateRecords(foreignRecords),
    );

    expect(() => verifyReviewBinding({
      definition: scenarioDefinition("transform"),
      samples: ownRecords.map((record) => record.sample),
      privateRecords: ownRecords,
      key: foreignKey,
      reviewerA: completeReviewRows(foreignPackets.reviewerA),
      reviewerB: completeReviewRows(foreignPackets.reviewerB),
      planDigest,
    })).toThrow("does not match this run's private sample receipt");
  });
});

describe.runIf(LIVE_ENABLED)("material language live evaluation", () => {
  it("runs only one explicitly selected singleton candidate", { timeout: 2 * 60 * 60_000 }, async () => {
    await loadLocalEnvironment();
    const mode = process.env.MATTER_LANGUAGE_EVAL_MODE ?? "plan";
    if (mode === "plan") {
      await writePrivateEvaluationPlan();
      return;
    }
    if (mode === "score") {
      await scoreExistingRun(process.env.MATTER_LANGUAGE_EVAL_SCORE_DIR ?? "");
      return;
    }
    if (mode !== "run") throw new Error("MATTER_LANGUAGE_EVAL_MODE must be plan, run, or score.");
    await runLiveEvaluation();
  });
});

function prepareLiveEvaluation() {
  const definition = scenarioDefinition(process.env.MATTER_LANGUAGE_EVAL_SCENARIO ?? "");
  const coverage = inspectCorpusCoverage({
    baseCases: definition.corpus,
    axes: definition.axes,
    classes: definition.classes,
  });
  if (!coverage.ok) throw new Error("The selected synthetic corpus failed its frozen coverage check.");
  const matrix = buildEvaluationMatrix(definition.corpus, definition.axes);
  const prepared = prepareEvaluationMatrix(definition, matrix);
  const expectedCalls = expectedEvaluationCalls(prepared, EVAL_REPEATS);
  const pool = readModelPool(process.env);
  const candidateIndex = wholeNumber(
    process.env.MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX,
    1,
    Math.max(1, pool.length),
    "MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX",
  );
  const candidate = pool[candidateIndex - 1];
  if (candidate === undefined) throw new Error("The selected candidate is not configured in the local model pool.");
  const tokenCeiling = expectedEvaluationOutputTokenCeiling(definition, prepared);
  const plan = Object.freeze({
    schemaVersion: "material-language-eval-authority/3",
    scenario: definition.id,
    candidate: evaluationCandidate(candidate),
    promptVersion: definition.promptVersion,
    compiledPromptDigest: compiledPromptDigest(definition, prepared),
    executionContract: evaluationExecutionContract(definition, prepared),
    corpusVersion: definition.corpusVersion,
    corpus: definition.corpus,
    axes: definition.axes,
    repeats: EVAL_REPEATS,
    ceilings: Object.freeze({ calls: expectedCalls, outputTokens: tokenCeiling }),
  });
  return Object.freeze({
    definition,
    prepared,
    expectedCalls,
    candidateIndex,
    candidate,
    plan,
  });
}

async function writePrivateEvaluationPlan() {
  const setup = prepareLiveEvaluation();
  const digest = evaluationPlanDigest(setup.plan);
  const generatedAt = new Date();
  const directory = await prepareRunDirectory(
    REPORT_ROOT,
    `${setup.definition.id}-plan`,
    generatedAt,
  );
  const path = resolve(directory, "plan.private.json");
  await writeJson(path, Object.freeze({
    schemaVersion: "material-language-eval-plan/1",
    generatedAt: generatedAt.toISOString(),
    digest,
    plan: setup.plan,
  }));
  writeSafeOutput(
    `language-eval: plan ${setup.expectedCalls} calls, output-token ceiling ${setup.plan.ceilings.outputTokens}`,
  );
  writeSafeOutput(`language-eval: plan digest ${digest}`);
  writeSafeOutput(`language-eval: private plan ${relative(process.cwd(), path)}`);
}

async function runLiveEvaluation() {
  const setup = prepareLiveEvaluation();
  const {
    definition,
    prepared,
    expectedCalls,
    candidateIndex,
    candidate,
    plan,
  } = setup;
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

  if (confirmedCalls !== expectedCalls) {
    throw new Error(`Live evaluation requires confirmCalls=${expectedCalls} before any request.`);
  }
  const planPath = safePlanFile(process.env.MATTER_LANGUAGE_EVAL_PLAN_FILE ?? "");
  const planArtifact = await readJson(planPath);
  const planDigest = requireEvaluationPlanAuthorization({
    localPlan: plan,
    artifact: planArtifact,
    suppliedDigest: process.env.MATTER_LANGUAGE_EVAL_PLAN_DIGEST ?? "",
  });
  // The call count and private plan authority are the last local gates before
  // the first paid request. The adapter is not constructed above this line.
  // Provision the private receipt before the first paid request. A missing or
  // unwritable report root must fail with zero provider calls, never after 360.
  const running = { accepted: 0, rejected: 0, unavailable: 0 };
  const startedAt = new Date();
  const { artifact: directory, result } = await executeAfterArtifactPreflight({
    prepare: async () => {
      const ownDirectory = await prepareRunDirectory(REPORT_ROOT, definition.id, startedAt);
      await initializeRunArtifacts({
        directory: ownDirectory,
        definition,
        candidate,
        candidateIndex,
        expectedCalls,
        plan,
        planDigest,
        startedAt,
      });
      return ownDirectory;
    },
    execute: async (ownDirectory) => {
      resetPoolHealth();
      const adapter = createPoolAdapter(Object.freeze([candidate]));
      return executeEvaluationMatrix({
        matrix: prepared,
        confirmedCalls,
        repeats: EVAL_REPEATS,
        paceMs,
        invoke: (item) => invokeScenario(definition, item, adapter),
        onProgress: async (progress) => {
          await appendEvaluationReceipt(ownDirectory, progress);
          const { completed, callCount, sample: own } = progress;
          if (own.outcome === "accepted") running.accepted += 1;
          else if (own.outcome === "rejected") running.rejected += 1;
          else running.unavailable += 1;
          if (completed % 24 === 0 || completed === callCount) {
            writeSafeOutput(
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
    candidateIndex,
    metrics,
    promotion,
    packets,
    privateRecords: result.privateRecords,
    planDigest,
    startedAt,
  });
  writeSafeOutput(formatSafeEvaluationSummary(definition.id, metrics, promotion));
  writeSafeOutput(`language-eval: private artifacts ${relative(process.cwd(), directory)}`);
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
      policyVersion: EXPAND_IN_PLACE_POLICY_VERSION,
      corpusVersion: TRANSFORM_CORPUS_VERSION,
      corpus: TRANSFORM_LIVE_CORPUS,
      axes: TRANSFORM_AMOUNTS,
      classes: TRANSFORM_CLASSES,
      prepare: (item) => {
        if (!isExactCurrentSegment(item.base)) {
          throw new Error(`Synthetic transform case ${item.id} is not one current punctuation segment.`);
        }
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
      policyVersion: TEXT_SWAP_POLICY_VERSION,
      corpusVersion: TEXT_SWAP_CORPUS_VERSION,
      corpus: TEXT_SWAP_LIVE_CORPUS,
      axes: TEXT_SWAP_DIRECTION_FAMILIES,
      classes: TEXT_SWAP_CLASSES,
      prepare: (item) => {
        if (!isExactCurrentSegment(item.base)) {
          throw new Error(`Synthetic Text Swap case ${item.id} is not one current punctuation segment.`);
        }
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

function prepareEvaluationMatrix(definition, matrix) {
  return matrix.map((item) => Object.freeze({ ...item, input: definition.prepare(item) }));
}

/**
 * Binds paid authority to the exact prompts the prepared matrix will send.
 * A scenario version remains human-readable identity; this digest prevents a
 * shared-spine edit from silently reusing evidence for different model input.
 */
function compiledPromptDigest(definition, prepared) {
  const prompts = prepared.map((item) => Object.freeze({
    id: item.id,
    prompt: definition.scenario.compile(item.input),
  }));
  return createHash("sha256").update(JSON.stringify(prompts)).digest("hex");
}

function evaluationCandidate(candidate) {
  return Object.freeze({
    station: candidate.station,
    model: candidate.model,
    enableThinking: candidate.enableThinking ?? null,
    endpointDigest: createHash("sha256").update(candidate.baseUrl ?? "").digest("hex"),
  });
}

function evaluationExecutionContract(definition, prepared) {
  const caseBudgets = prepared.map((item) => Object.freeze({
    id: item.id,
    ...definition.scenario.budget(item.input),
  }));
  return Object.freeze({
    temperature: 0,
    stream: false,
    scenarioPolicyVersion: definition.policyVersion,
    completionPolicyVersion: COMPLETION_OUTCOME_POLICY_VERSION,
    poolLimits: Object.freeze({ ...DEFAULT_POOL_LIMITS }),
    caseBudgetsDigest: createHash("sha256").update(JSON.stringify(caseBudgets)).digest("hex"),
  });
}

async function writeRunArtifacts({
  directory,
  definition,
  candidateIndex,
  metrics,
  promotion,
  packets,
  privateRecords,
  planDigest,
  startedAt,
}) {
  const reviewSourceDigest = digestPrivateRecords(privateRecords);
  const summary = Object.freeze({
    schemaVersion: "material-language-eval/1",
    generatedAt: new Date().toISOString(),
    scenario: definition.id,
    promptVersion: definition.promptVersion,
    corpusVersion: definition.corpusVersion,
    candidateOrdinal: candidateIndex,
    planDigest,
    reviewSourceDigest,
    repeats: EVAL_REPEATS,
    metrics,
    promotion,
  });
  const key = createReviewKey(packets, planDigest, reviewSourceDigest);
  await Promise.all([
    writeJson(resolve(directory, "summary.json"), summary),
    writeJson(resolve(directory, "review-key.json"), key),
    writeJson(resolve(directory, "reviewer-a.json"), packets.reviewerA),
    writeJson(resolve(directory, "reviewer-b.json"), packets.reviewerB),
  ]);
  await writeJson(resolve(directory, "run.json"), Object.freeze({
    schemaVersion: "material-language-run/1",
    scenario: definition.id,
    promptVersion: definition.promptVersion,
    corpusVersion: definition.corpusVersion,
    candidateOrdinal: candidateIndex,
    planDigest,
    reviewSourceDigest,
    repeats: EVAL_REPEATS,
    expectedCalls: metrics.calls,
    completedCalls: metrics.calls,
    status: "completed",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
  }));
  return directory;
}

async function initializeRunArtifacts({
  directory,
  definition,
  candidate,
  candidateIndex,
  expectedCalls,
  plan,
  planDigest,
  startedAt,
}) {
  await Promise.all([
    writeJson(resolve(directory, "run.json"), Object.freeze({
      schemaVersion: "material-language-run/1",
      scenario: definition.id,
      promptVersion: definition.promptVersion,
      corpusVersion: definition.corpusVersion,
      candidateOrdinal: candidateIndex,
      planDigest,
      repeats: EVAL_REPEATS,
      expectedCalls,
      completedCalls: 0,
      status: "running",
      startedAt: startedAt.toISOString(),
    })),
    writeJson(resolve(directory, "run.private.json"), Object.freeze({
      schemaVersion: "material-language-run-private/1",
      candidate: evaluationCandidate(candidate),
      planDigest,
      plan,
    })),
    writeFile(resolve(directory, "samples.jsonl"), "", "utf8"),
    writeFile(resolve(directory, "samples.private.jsonl"), "", "utf8"),
  ]);
}

async function appendEvaluationReceipt(directory, { sample, privateRecord }, append = appendFile) {
  await append(resolve(directory, "samples.jsonl"), `${JSON.stringify(sample)}\n`, "utf8");
  await append(
    resolve(directory, "samples.private.jsonl"),
    `${JSON.stringify(privateRecord)}\n`,
    "utf8",
  );
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
  const result = await execute(artifact);
  return Object.freeze({ artifact, result });
}

async function scoreExistingRun(rawDirectory) {
  const directory = safeReportDirectory(rawDirectory);
  const [run, runPrivate, summary, samples, privateRecords, key, reviewerA, reviewerB] = await Promise.all([
    readJson(resolve(directory, "run.json")),
    readJson(resolve(directory, "run.private.json")),
    readJson(resolve(directory, "summary.json")),
    readJsonLines(resolve(directory, "samples.jsonl")),
    readJsonLines(resolve(directory, "samples.private.jsonl")),
    readJson(resolve(directory, "review-key.json")),
    readJson(resolve(directory, "reviewer-a.json")),
    readJson(resolve(directory, "reviewer-b.json")),
  ]);
  const definition = verifyCompletedRun(run, summary, samples);
  verifyPrivateRunAuthority(runPrivate, run, definition);
  const metrics = summarizeEvaluation(samples);
  verifySavedMetrics(summary.metrics, samples);
  if (
    summary.schemaVersion !== "material-language-eval/1" ||
    summary.candidateOrdinal !== run.candidateOrdinal ||
    summary.scenario !== definition.id ||
    summary.promptVersion !== definition.promptVersion ||
    summary.corpusVersion !== definition.corpusVersion ||
    summary.planDigest !== run.planDigest ||
    summary.repeats !== EVAL_REPEATS
  ) {
    throw new Error("The saved summary does not match the frozen evaluation definition.");
  }
  const { expected, reviewSourceDigest } = verifyReviewBinding({
    definition,
    samples,
    privateRecords,
    key,
    reviewerA,
    reviewerB,
    planDigest: run.planDigest,
  });
  if (
    run.reviewSourceDigest !== reviewSourceDigest ||
    summary.reviewSourceDigest !== reviewSourceDigest
  ) {
    throw new Error("The review set does not match this run's private sample receipt.");
  }
  const expectedIds = expected.map((entry) => entry.reviewId);
  const humanReview = summarizeHumanReviews(reviewerA, reviewerB, expectedIds);
  const promotion = evaluatePromotion(definition.id, metrics, humanReview);
  await writeJson(resolve(directory, "promotion.json"), Object.freeze({
    schemaVersion: "material-language-promotion/2",
    scoredAt: new Date().toISOString(),
    scenario: definition.id,
    promptVersion: definition.promptVersion,
    corpusVersion: definition.corpusVersion,
    candidateOrdinal: run.candidateOrdinal,
    planDigest: run.planDigest,
    reviewSourceDigest,
    promotion,
  }));
  writeSafeOutput(formatSafeEvaluationSummary(definition.id, metrics, promotion));
  writeSafeOutput(`language-eval: scored private artifacts ${relative(process.cwd(), directory)}`);
}

function verifyCompletedRun(run, summary, samples) {
  if (
    run?.schemaVersion !== "material-language-run/1" ||
    run.status !== "completed" ||
    run.repeats !== EVAL_REPEATS ||
    !Number.isSafeInteger(run.expectedCalls) ||
    run.completedCalls !== run.expectedCalls
  ) {
    throw new Error("The evaluation run is incomplete.");
  }
  const definition = scenarioDefinition(run.scenario);
  if (
    run.promptVersion !== definition.promptVersion ||
    run.corpusVersion !== definition.corpusVersion ||
    typeof run.planDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(run.planDigest) ||
    !Number.isSafeInteger(run.candidateOrdinal) ||
    run.candidateOrdinal < 1
  ) {
    throw new Error("The evaluation run does not match the frozen definition.");
  }
  const matrix = buildEvaluationMatrix(definition.corpus, definition.axes);
  const expectedCalls = expectedEvaluationCalls(matrix, EVAL_REPEATS);
  if (run.expectedCalls !== expectedCalls || samples.length !== expectedCalls) {
    throw new Error("The sample receipt is incomplete.");
  }
  const expected = new Map();
  for (const item of matrix) {
    for (let repeat = 1; repeat <= EVAL_REPEATS; repeat += 1) {
      expected.set(`${item.id}/${repeat}`, Object.freeze({ item, repeat }));
    }
  }
  const seen = new Set();
  for (const sample of samples) {
    const key = `${sample?.caseId}/${sample?.repeat}`;
    const own = expected.get(key);
    if (
      !hasExactKeys(sample, [
        "axisId",
        "caseId",
        "classId",
        "latencyMs",
        "lengthBucket",
        "locale",
        "outcome",
        "reason",
        "repeat",
      ]) ||
      own === undefined ||
      seen.has(key) ||
      sample.locale !== own.item.locale ||
      sample.classId !== own.item.classId ||
      sample.axisId !== own.item.axis.id ||
      sample.lengthBucket !== own.item.lengthBucket ||
      !["accepted", "rejected", "timeout", "unavailable", "busy", "malformed"].includes(sample.outcome) ||
      !(sample.reason === null || (
        typeof sample.reason === "string" && /^[A-Z][A-Z0-9_]{0,47}$/u.test(sample.reason)
      )) ||
      !Number.isSafeInteger(sample.latencyMs) ||
      sample.latencyMs < 0
    ) {
      throw new Error("The sample receipt does not match the frozen evaluation matrix.");
    }
    seen.add(key);
  }
  if (
    seen.size !== expected.size ||
    summary?.scenario !== run.scenario ||
    summary?.planDigest !== run.planDigest
  ) {
    throw new Error("The sample receipt is incomplete.");
  }
  return definition;
}

function hasExactKeys(value, keys) {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function verifySavedMetrics(savedMetrics, samples) {
  const metrics = summarizeEvaluation(samples);
  if (JSON.stringify(metrics) !== JSON.stringify(savedMetrics)) {
    throw new Error("The saved summary does not match the append-only sample receipt.");
  }
  return metrics;
}

function verifyPrivateRunAuthority(runPrivate, run, definition) {
  const plan = runPrivate?.plan;
  const candidate = runPrivate?.candidate;
  const prepared = prepareEvaluationMatrix(
    definition,
    buildEvaluationMatrix(definition.corpus, definition.axes),
  );
  const expectedCalls = expectedEvaluationCalls(prepared, EVAL_REPEATS);
  const expectedOutputTokens = expectedEvaluationOutputTokenCeiling(definition, prepared);
  if (
    runPrivate?.schemaVersion !== "material-language-run-private/1" ||
    runPrivate.planDigest !== run.planDigest ||
    evaluationPlanDigest(plan) !== run.planDigest ||
    typeof candidate?.station !== "string" || candidate.station.length < 1 ||
    typeof candidate?.model !== "string" || candidate.model.length < 1 ||
    !(candidate.enableThinking === null || typeof candidate.enableThinking === "boolean") ||
    typeof candidate.endpointDigest !== "string" || !/^[a-f0-9]{64}$/u.test(candidate.endpointDigest) ||
    plan?.schemaVersion !== "material-language-eval-authority/3" ||
    plan.scenario !== definition.id ||
    plan.promptVersion !== definition.promptVersion ||
    plan.compiledPromptDigest !== compiledPromptDigest(definition, prepared) ||
    JSON.stringify(plan.executionContract) !== JSON.stringify(evaluationExecutionContract(definition, prepared)) ||
    plan.corpusVersion !== definition.corpusVersion ||
    JSON.stringify(plan.corpus) !== JSON.stringify(definition.corpus) ||
    JSON.stringify(plan.axes) !== JSON.stringify(definition.axes) ||
    plan.repeats !== EVAL_REPEATS ||
    plan.ceilings?.calls !== expectedCalls ||
    plan.ceilings?.outputTokens !== expectedOutputTokens ||
    JSON.stringify(plan.candidate) !== JSON.stringify(candidate)
  ) {
    throw new Error("The private run authority does not match the paid evaluation plan.");
  }
}

function expectedEvaluationOutputTokenCeiling(definition, prepared) {
  return prepared.reduce((total, item) =>
    total + definition.scenario.budget(item.input).maxOutputTokens * EVAL_REPEATS, 0);
}

function verifyReviewBinding({
  definition,
  samples,
  privateRecords,
  key,
  reviewerA,
  reviewerB,
  planDigest,
}) {
  if (!Array.isArray(privateRecords) || privateRecords.length !== samples.length) {
    throw new Error("The private sample receipt is incomplete.");
  }
  for (let index = 0; index < samples.length; index += 1) {
    const record = privateRecords[index];
    const sample = samples[index];
    if (JSON.stringify(record?.sample) !== JSON.stringify(sample)) {
      throw new Error("The private sample receipt does not match its safe journal.");
    }
    if (sample.outcome === "accepted" && !isValidAcceptedMaterial(record.material, definition.id)) {
      throw new Error("An accepted sample is missing its frozen private review material.");
    }
  }
  const reviewSourceDigest = digestPrivateRecords(privateRecords);
  const packets = createReviewerPackets(privateRecords);
  const expectedKey = createReviewKey(packets, planDigest, reviewSourceDigest);
  if (JSON.stringify(key) !== JSON.stringify(expectedKey)) {
    throw new Error("The review set does not match this run's private sample receipt.");
  }
  const expected = expectedKey.expected;
  verifyReviewRows(reviewerA, expected, "reviewer-a");
  verifyReviewRows(reviewerB, expected, "reviewer-b");
  return Object.freeze({ expected, reviewSourceDigest });
}

function isValidAcceptedMaterial(material, scenario) {
  return typeof material === "object" && material !== null &&
    material.scenario === scenario &&
    typeof material.passage === "string" && material.passage.length > 0 &&
    typeof material.before === "string" &&
    typeof material.after === "string" &&
    Array.isArray(material.lineage) && material.lineage.every((entry) => typeof entry === "string") &&
    typeof material.response === "string" && material.response.length > 0 &&
    (scenario === "transform"
      ? Number.isFinite(material.amount) && material.amount > 0 && material.amount <= 1
      : typeof material.direction === "string" && material.direction.length > 0);
}

function digestPrivateRecords(records) {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

function createReviewKey(packets, planDigest, reviewSourceDigest) {
  return Object.freeze({
    schemaVersion: "material-language-review-key/2",
    planDigest,
    reviewSourceDigest,
    expected: Object.freeze(packets.reviewerA.map((row) => Object.freeze({
      reviewId: row.reviewId,
      digest: digestReviewContent(row),
    })).sort((left, right) => left.reviewId.localeCompare(right.reviewId))),
  });
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

function safePlanFile(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("MATTER_LANGUAGE_EVAL_PLAN_FILE must name one generated private plan.");
  }
  const path = resolve(value);
  const child = relative(REPORT_ROOT, path);
  if (child === "" || child.startsWith("..") || isAbsolute(child)) {
    throw new Error("Evaluation plans are limited to tmp/material-language-eval.");
  }
  return path;
}

function isExactCurrentSegment(item) {
  const text = `${item.before}${item.passage}${item.after}`;
  const start = item.before.length;
  const end = start + item.passage.length;
  return segmentText(text).some((segment) => segment.start === start && segment.end === end);
}

function digestReviewContent(row) {
  return createHash("sha256").update(JSON.stringify(reviewContent(row))).digest("hex");
}

function fallbackClassification(reason) {
  if (reason === "MODEL_TIMEOUT") return Object.freeze({ outcome: "timeout", reason });
  if (reason === "MODEL_BUSY") return Object.freeze({ outcome: "busy", reason });
  return Object.freeze({ outcome: "unavailable", reason: reason ?? "MODEL_UNAVAILABLE" });
}

function writeSafeOutput(value) {
  process.stdout.write(`${value}\n`);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
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

function privateTextSwapAcceptedRecord(caseId, repeat, locale, axisId, lengthBucket) {
  return Object.freeze({
    sample: sample(caseId, "accepted", 10, repeat, locale, axisId, lengthBucket),
    material: Object.freeze({
      scenario: "text-swap",
      passage: "The room became quiet",
      before: "After the door closed, ",
      after: ".",
      lineage: Object.freeze(["About the empty room"]),
      direction: "Make the wording clearer without changing its meaning.",
      response: "The room fell quiet",
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
      ...(row.scenario === "text-swap" ? { followsDirection: true } : {}),
      notes: "",
    }),
  }));
}

function testEvaluationPlan() {
  const definition = scenarioDefinition("transform");
  const prepared = prepareEvaluationMatrix(
    definition,
    buildEvaluationMatrix(definition.corpus, definition.axes),
  );
  return Object.freeze({
    schemaVersion: "material-language-eval-authority/3",
    scenario: "transform",
    candidate: evaluationCandidate({ station: "private-station", model: "private-model" }),
    promptVersion: "transform/3",
    compiledPromptDigest: "b".repeat(64),
    executionContract: evaluationExecutionContract(definition, prepared),
    corpusVersion: "transform-live-corpus/2",
    corpus: Object.freeze([Object.freeze({
      id: "en-us-ordinary-claim",
      locale: "en-US",
      classId: "ordinary-claim",
      passage: "The room became quiet",
      before: "After the door closed, ",
      after: ".",
      lineage: Object.freeze(["About the empty room"]),
      sourceGraphemes: 21,
      lengthBucket: "short",
    })]),
    axes: Object.freeze([Object.freeze({ id: "amount-02", amount: 0.2 })]),
    repeats: 2,
    ceilings: Object.freeze({ calls: 360, outputTokens: 120_000 }),
  });
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

function completedSampleReceipt(definition) {
  return buildEvaluationMatrix(definition.corpus, definition.axes).flatMap((item) =>
    [1, 2].map((repeat) => Object.freeze({
      caseId: item.id,
      locale: item.locale,
      classId: item.classId,
      axisId: item.axis.id,
      lengthBucket: item.lengthBucket,
      repeat,
      outcome: "accepted",
      reason: null,
      latencyMs: 1,
    })),
  );
}

function completedRunReceipt(definition, calls) {
  return Object.freeze({
    schemaVersion: "material-language-run/1",
    scenario: definition.id,
    promptVersion: definition.promptVersion,
    corpusVersion: definition.corpusVersion,
    candidateOrdinal: 1,
    planDigest: "a".repeat(64),
    repeats: EVAL_REPEATS,
    expectedCalls: calls,
    completedCalls: calls,
    status: "completed",
  });
}
