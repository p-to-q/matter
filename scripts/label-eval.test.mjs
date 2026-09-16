import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  SEMANTIC_LABEL_PROMPT_VERSION,
  adjudicateModelLabel,
  decideModelRequest,
  deriveProvisionalLabel,
  normalizeLabelInput,
  validateSemanticLabel,
} from "../features/matter/material/semantic-label";
import { LABEL_SCENARIO, buildLabelPrompt } from "../features/matter/server/label-harness";
import { readModelPool } from "../features/matter/server/model-pool";
import { CORPUS_VERSION, contentDigest, corpus } from "./label-corpus.mjs";

/**
 * Measures a live model against the deterministic label it would replace.
 *
 * This is a measurement, not a test: it needs a key, it spends money, and its
 * result is a judgement a person makes from the table it prints. It therefore
 * never runs by default — `npm run check` skips it — and only an explicit
 * `MATTER_LABEL_EVAL=1` turns it on:
 *
 *   MATTER_LABEL_EVAL=1 npx vitest run scripts/label-eval.test.mjs
 *   MATTER_LABEL_EVAL=1 MATTER_LABEL_EVAL_MODELS=Qwen-flash npx vitest run scripts/label-eval.test.mjs
 *   MATTER_LABEL_EVAL=1 MATTER_LABEL_EVAL_REPEAT=3 npx vitest run scripts/label-eval.test.mjs
 */
const enabled = process.env.MATTER_LABEL_EVAL === "1";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Eval-plan binding (spec 5.1.1 rule 6, §6.3).
 *
 * Before a paid attribution run starts, the tool builds an authorization plan
 * digest over every input that can change the result: the scenario, the
 * candidate station/model/thinking-mode declarations and endpoint digests, the
 * prompt and corpus versions with the full corpus content digest, the
 * adjudication and completion policy versions, the per-case budget, and the
 * total call and output-token ceilings. The runtime rebuilds the same digest
 * from the same inputs; any disagreement stops the run before a single
 * provider call.
 *
 * Station and model names live in the binding object so the artefact can be
 * rebuilt, but they never appear in regular output — only the digest and the
 * version strings do.
 */
const LABEL_ADJUDICATION_POLICY_VERSION = "label-adjudication/1";
const LABEL_COMPLETION_POLICY_VERSION = "label-completion/1";
const PER_CASE_MAX_OUTPUT_TOKENS = 32;

function thinkingModeOf(enableThinking) {
  if (enableThinking === true) return "on";
  if (enableThinking === false) return "off";
  return "default";
}

function endpointDigestOf(baseUrl) {
  return createHash("sha256").update(baseUrl, "utf8").digest("hex");
}

function buildEvalPlanBinding(inputs) {
  const candidates = Object.freeze(inputs.candidates.map((candidate) => Object.freeze({
    station: candidate.station,
    model: candidate.model,
    thinkingMode: candidate.thinkingMode,
    endpointDigest: candidate.endpointDigest,
  })));
  const binding = {
    scenarioId: inputs.scenarioId,
    promptVersion: inputs.promptVersion,
    corpusVersion: inputs.corpusVersion,
    corpusDigest: inputs.corpusDigest,
    adjudicationPolicyVersion: inputs.adjudicationPolicyVersion,
    completionPolicyVersion: inputs.completionPolicyVersion,
    candidates,
    perCaseBudget: Object.freeze({
      deadlineMs: inputs.perCaseDeadlineMs,
      maxOutputTokens: inputs.perCaseMaxOutputTokens,
    }),
    totalCalls: inputs.totalCalls,
    totalOutputTokenCeiling: inputs.totalOutputTokenCeiling,
  };
  return Object.freeze({ ...binding, digest: bindingDigest(binding) });
}

function bindingDigest(binding) {
  const hash = createHash("sha256");
  hash.update(binding.scenarioId, "utf8"); hash.update("\0");
  hash.update(binding.promptVersion, "utf8"); hash.update("\0");
  hash.update(binding.corpusVersion, "utf8"); hash.update("\0");
  hash.update(binding.corpusDigest, "utf8"); hash.update("\0");
  hash.update(binding.adjudicationPolicyVersion, "utf8"); hash.update("\0");
  hash.update(binding.completionPolicyVersion, "utf8"); hash.update("\0");
  for (const candidate of binding.candidates) {
    hash.update(candidate.station, "utf8"); hash.update("\0");
    hash.update(candidate.model, "utf8"); hash.update("\0");
    hash.update(candidate.thinkingMode, "utf8"); hash.update("\0");
    hash.update(candidate.endpointDigest, "utf8"); hash.update("\0");
  }
  hash.update(String(binding.perCaseBudget.deadlineMs), "utf8"); hash.update("\0");
  hash.update(String(binding.perCaseBudget.maxOutputTokens), "utf8"); hash.update("\0");
  hash.update(String(binding.totalCalls), "utf8"); hash.update("\0");
  hash.update(String(binding.totalOutputTokenCeiling), "utf8"); hash.update("\n");
  return hash.digest("hex");
}

function checkEvalPlanBinding(expected, actual) {
  const scalarFields = [
    "scenarioId",
    "promptVersion",
    "corpusVersion",
    "corpusDigest",
    "adjudicationPolicyVersion",
    "completionPolicyVersion",
  ];
  for (const field of scalarFields) {
    if (expected[field] !== actual[field]) {
      return { ok: false, field, expected: expected[field], actual: actual[field] };
    }
  }
  if (expected.perCaseBudget.deadlineMs !== actual.perCaseBudget.deadlineMs) {
    return {
      ok: false,
      field: "perCaseBudget.deadlineMs",
      expected: expected.perCaseBudget.deadlineMs,
      actual: actual.perCaseBudget.deadlineMs,
    };
  }
  if (expected.perCaseBudget.maxOutputTokens !== actual.perCaseBudget.maxOutputTokens) {
    return {
      ok: false,
      field: "perCaseBudget.maxOutputTokens",
      expected: expected.perCaseBudget.maxOutputTokens,
      actual: actual.perCaseBudget.maxOutputTokens,
    };
  }
  if (expected.totalCalls !== actual.totalCalls) {
    return { ok: false, field: "totalCalls", expected: expected.totalCalls, actual: actual.totalCalls };
  }
  if (expected.totalOutputTokenCeiling !== actual.totalOutputTokenCeiling) {
    return {
      ok: false,
      field: "totalOutputTokenCeiling",
      expected: expected.totalOutputTokenCeiling,
      actual: actual.totalOutputTokenCeiling,
    };
  }
  if (expected.candidates.length !== actual.candidates.length) {
    return {
      ok: false,
      field: "candidates.length",
      expected: expected.candidates.length,
      actual: actual.candidates.length,
    };
  }
  for (let index = 0; index < expected.candidates.length; index += 1) {
    const want = expected.candidates[index];
    const got = actual.candidates[index];
    if (want.station !== got.station) {
      return { ok: false, field: `candidates[${index}].station`, expected: want.station, actual: got.station };
    }
    if (want.model !== got.model) {
      return { ok: false, field: `candidates[${index}].model`, expected: want.model, actual: got.model };
    }
    if (want.thinkingMode !== got.thinkingMode) {
      return { ok: false, field: `candidates[${index}].thinkingMode`, expected: want.thinkingMode, actual: got.thinkingMode };
    }
    if (want.endpointDigest !== got.endpointDigest) {
      return { ok: false, field: `candidates[${index}].endpointDigest`, expected: want.endpointDigest, actual: got.endpointDigest };
    }
  }
  return { ok: true };
}

class EvalPlanBindingMismatchError extends Error {
  constructor(check) {
    super(
      `eval-plan binding mismatch: ${check.field} expected ${JSON.stringify(check.expected)} but got ${JSON.stringify(check.actual)}`,
    );
    this.name = "EvalPlanBindingMismatchError";
    this.check = check;
  }
}

function readBindingInputsFromEnv() {
  const requested = (process.env.MATTER_LABEL_EVAL_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const repeat = Math.max(1, Number(process.env.MATTER_LABEL_EVAL_REPEAT ?? 1));
  const pool = readModelPool(process.env).filter(
    (candidate) => requested.length === 0 ||
      requested.some((model) => model.toLowerCase() === candidate.model.toLowerCase()),
  );
  return {
    scenarioId: LABEL_SCENARIO.id,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    corpusVersion: CORPUS_VERSION,
    corpusDigest: contentDigest(),
    adjudicationPolicyVersion: LABEL_ADJUDICATION_POLICY_VERSION,
    completionPolicyVersion: LABEL_COMPLETION_POLICY_VERSION,
    candidates: pool.map((candidate) => ({
      station: candidate.station,
      model: candidate.model,
      thinkingMode: thinkingModeOf(candidate.enableThinking),
      endpointDigest: endpointDigestOf(candidate.baseUrl),
    })),
    perCaseDeadlineMs: REQUEST_TIMEOUT_MS,
    perCaseMaxOutputTokens: PER_CASE_MAX_OUTPUT_TOKENS,
    totalCalls: pool.length * corpus.length * repeat,
    totalOutputTokenCeiling: pool.length * corpus.length * repeat * PER_CASE_MAX_OUTPUT_TOKENS,
  };
}

async function writeBindingArtefact(plan) {
  const directory = new URL("../tmp/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const path = new URL("label-eval-binding.json", directory);
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

describe("eval-plan binding", () => {
  const fixtureInputs = () => ({
    scenarioId: LABEL_SCENARIO.id,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    corpusVersion: CORPUS_VERSION,
    corpusDigest: contentDigest(),
    adjudicationPolicyVersion: LABEL_ADJUDICATION_POLICY_VERSION,
    completionPolicyVersion: LABEL_COMPLETION_POLICY_VERSION,
    candidates: [
      {
        station: "alpha",
        model: "Qwen-flash",
        thinkingMode: "off",
        endpointDigest: endpointDigestOf("https://alpha.example/v1"),
      },
      {
        station: "beta",
        model: "DeepSeek-V3",
        thinkingMode: "default",
        endpointDigest: endpointDigestOf("https://beta.example/v1"),
      },
    ],
    perCaseDeadlineMs: REQUEST_TIMEOUT_MS,
    perCaseMaxOutputTokens: PER_CASE_MAX_OUTPUT_TOKENS,
    totalCalls: 2 * corpus.length * 1,
    totalOutputTokenCeiling: 2 * corpus.length * 1 * PER_CASE_MAX_OUTPUT_TOKENS,
  });

  it("continues when the rebuilt digest matches", () => {
    const plan = buildEvalPlanBinding(fixtureInputs());
    const rebuilt = buildEvalPlanBinding(fixtureInputs());
    expect(checkEvalPlanBinding(plan, rebuilt)).toEqual({ ok: true });
    expect(plan.digest).toBe(rebuilt.digest);
  });

  it.each([
    ["scenarioId", "drifted-scenario"],
    ["promptVersion", "thought-label/drifted"],
    ["corpusVersion", "label-corpus/drifted"],
    ["corpusDigest", "0".repeat(64)],
    ["adjudicationPolicyVersion", "label-adjudication/drifted"],
    ["completionPolicyVersion", "label-completion/drifted"],
  ])("stops with zero provider calls when %s drifts", (field, value) => {
    const plan = buildEvalPlanBinding(fixtureInputs());
    let providerCalls = 0;
    const drifted = { ...fixtureInputs(), [field]: value };
    const rebuilt = buildEvalPlanBinding(drifted);
    const check = checkEvalPlanBinding(plan, rebuilt);
    expect(check.ok).toBe(false);
    expect(check.field).toBe(field);
    expect(() => {
      if (!check.ok) throw new EvalPlanBindingMismatchError(check);
      providerCalls += 1;
    }).toThrow(EvalPlanBindingMismatchError);
    expect(providerCalls).toBe(0);
  });

  it("stops with zero provider calls when a candidate endpoint drifts", () => {
    const plan = buildEvalPlanBinding(fixtureInputs());
    let providerCalls = 0;
    const inputs = fixtureInputs();
    const drifted = {
      ...inputs,
      candidates: inputs.candidates.map((candidate, index) => (
        index === 0
          ? { ...candidate, endpointDigest: endpointDigestOf("https://drifted.example/v1") }
          : candidate
      )),
    };
    const rebuilt = buildEvalPlanBinding(drifted);
    const check = checkEvalPlanBinding(plan, rebuilt);
    expect(check.ok).toBe(false);
    expect(check.field).toBe("candidates[0].endpointDigest");
    expect(() => {
      if (!check.ok) throw new EvalPlanBindingMismatchError(check);
      providerCalls += 1;
    }).toThrow(EvalPlanBindingMismatchError);
    expect(providerCalls).toBe(0);
  });

  it("stops with zero provider calls when the per-case deadline drifts", () => {
    const plan = buildEvalPlanBinding(fixtureInputs());
    let providerCalls = 0;
    const drifted = { ...fixtureInputs(), perCaseDeadlineMs: REQUEST_TIMEOUT_MS - 1 };
    const rebuilt = buildEvalPlanBinding(drifted);
    const check = checkEvalPlanBinding(plan, rebuilt);
    expect(check.ok).toBe(false);
    expect(check.field).toBe("perCaseBudget.deadlineMs");
    expect(() => {
      if (!check.ok) throw new EvalPlanBindingMismatchError(check);
      providerCalls += 1;
    }).toThrow(EvalPlanBindingMismatchError);
    expect(providerCalls).toBe(0);
  });

  it("stops with zero provider calls when the total call ceiling drifts", () => {
    const plan = buildEvalPlanBinding(fixtureInputs());
    let providerCalls = 0;
    const drifted = { ...fixtureInputs(), totalCalls: plan.totalCalls + 1 };
    const rebuilt = buildEvalPlanBinding(drifted);
    const check = checkEvalPlanBinding(plan, rebuilt);
    expect(check.ok).toBe(false);
    expect(check.field).toBe("totalCalls");
    expect(() => {
      if (!check.ok) throw new EvalPlanBindingMismatchError(check);
      providerCalls += 1;
    }).toThrow(EvalPlanBindingMismatchError);
    expect(providerCalls).toBe(0);
  });

  it("produces a byte-stable digest across rebuilds", () => {
    const first = buildEvalPlanBinding(fixtureInputs());
    const second = buildEvalPlanBinding(fixtureInputs());
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe.runIf(enabled)("label model evaluation", () => {
  it("reports every corpus case against the live pool", { timeout: 15 * 60_000 }, async () => {
    await loadLocalEnvironment();
    const requested = (process.env.MATTER_LABEL_EVAL_MODELS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const repeat = Math.max(1, Number(process.env.MATTER_LABEL_EVAL_REPEAT ?? 1));

    const pool = readModelPool(process.env).filter(
      (candidate) => requested.length === 0 ||
        requested.some((model) => model.toLowerCase() === candidate.model.toLowerCase()),
    );
    expect(pool, "configure MATTER_MODEL_POOL (or the complete legacy MATTER_LABEL_POOL) in .env.local").not.toHaveLength(0);

    // Eval-plan binding (spec 5.1.1 rule 6): build the authorization plan
    // digest, rebuild it from the live environment, and fail closed before
    // any provider call if the two disagree. The artefact is written to the
    // git-ignored scratch directory so a later verifier can replay it.
    const plan = buildEvalPlanBinding(readBindingInputsFromEnv());
    const rebuilt = buildEvalPlanBinding(readBindingInputsFromEnv());
    const bindingCheck = checkEvalPlanBinding(plan, rebuilt);
    if (!bindingCheck.ok) throw new EvalPlanBindingMismatchError(bindingCheck);
    await writeBindingArtefact(plan);

    const scratchDirectory = new URL("../tmp/", import.meta.url);
    await mkdir(scratchDirectory, { recursive: true });
    for (const candidate of pool) {
      const journalPath = new URL(
        `label-eval-journal-${candidate.model.replaceAll(/[^\w.-]/gu, "_")}.jsonl`,
        scratchDirectory,
      );
      await writeFile(journalPath, "", "utf8").catch(() => {});
      const result = await runCaseSequence({
        corpusItems: corpus,
        candidate,
        repeat,
        complete,
        writeJournal: (record) => appendCaseJournal(journalPath, record),
      });
      await report(`${candidate.model} @ ${candidate.station}`, result.rows, {
        journalStopped: result.journalStopped,
        journalStopReason: result.journalStopReason,
      });
      if (result.journalStopped) break;
    }
  });
});

/**
 * Closed-set policy codes (spec 5.1.1 rule 6, §6.4). A shape violation or a
 * semantic refusal always carries one of these codes. Any value outside the
 * closed set is bucketed as "unknown" rather than folded into a policy code,
 * so a future drift in the judgement surface stays visible instead of silent.
 *
 * Transport errors (http-500, no-text, AbortError, …) are never policy codes:
 * a network failure is not a shape violation, and a shape violation is not a
 * transport error. They live in their own field and verdict.
 */
const LABEL_REJECTION_CODES = Object.freeze([
  "EMPTY",
  "TOO_LONG",
  "MARKUP",
  "TERMINAL_PUNCTUATION",
  "GENERIC",
  "SIBLING_DUPLICATE",
]);

const LABEL_ADJUDICATION_REASONS = Object.freeze([
  "not-grounded-in-material",
  "drops-a-stable-identifier",
  "less-distinct-than-provisional",
]);

function isLabelRejectionCode(value) {
  return LABEL_REJECTION_CODES.includes(value);
}

function isLabelAdjudicationReason(value) {
  return LABEL_ADJUDICATION_REASONS.includes(value);
}

/**
 * Two-layer judgement of one model answer. The shape layer runs first; a shape
 * violation short-circuits the semantic layer. Returns a structured record so a
 * report can tell a sporadic violation (one of N answers) from a systematic one
 * (all of N). Observation only: this never mutates the verdicts it records.
 */
function judge(input, provisional, text) {
  const validation = validateSemanticLabel(text, {
    locale: input.locale,
    maxGraphemes: input.maxGraphemes,
    siblingLabels: input.context.siblingLabels,
  });
  if (!validation.ok) {
    const code = isLabelRejectionCode(validation.code) ? validation.code : "unknown";
    return Object.freeze({
      shape: { ok: false, code },
      semantic: { ok: false, reasons: Object.freeze(["unknown"]) },
      verdict: code === "unknown" ? "unknown" : "rejected:shape",
    });
  }
  const adjudication = adjudicateModelLabel(input, provisional, validation.label);
  if (!adjudication.ok) {
    const reasons = Object.freeze(
      adjudication.reasons
        .map((reason) => (isLabelAdjudicationReason(reason) ? reason : "unknown"))
        .filter((reason, index, array) => array.indexOf(reason) === index),
    );
    const hasUnknown = reasons.includes("unknown");
    return Object.freeze({
      shape: { ok: true, label: validation.label },
      semantic: { ok: false, reasons },
      verdict: hasUnknown ? "unknown" : "rejected:semantic",
    });
  }
  return Object.freeze({
    shape: { ok: true, label: validation.label },
    semantic: { ok: true },
    verdict: "accepted",
  });
}

/**
 * Wraps one answer with its attempt index, latency, and transport-error
 * channel. Transport errors are kept separate from policy codes: a failed
 * request is never reported as a shape violation.
 */
function judgeAnswer(input, provisional, answer, attempt, latencyMs) {
  if (!answer.ok) {
    return Object.freeze({
      attempt,
      transportError: answer.error,
      text: null,
      shape: { ok: false, code: "unknown" },
      semantic: { ok: false, reasons: Object.freeze(["unknown"]) },
      verdict: "transport-error",
      latencyMs,
    });
  }
  const judgement = judge(input, provisional, answer.text);
  return Object.freeze({
    attempt,
    transportError: null,
    text: answer.text,
    shape: judgement.shape,
    semantic: judgement.semantic,
    verdict: judgement.verdict,
    latencyMs,
  });
}

/**
 * Judges every answer in a repeat, so a sporadic shape violation (1 of N) is
 * distinguishable from a systematic one (N of N). `unstable` is verdict-level,
 * not text-level: two different texts that both validate to "accepted" are
 * stable judgement even if the wording differs.
 */
function judgeCase(input, provisionalText, answers, latencies) {
  const judgements = Object.freeze(
    answers.map((answer, index) =>
      judgeAnswer(input, provisionalText, answer, index, latencies[index] ?? 0),
    ),
  );
  const verdicts = new Set(judgements.map((judgement) => judgement.verdict));
  const acceptedCount = judgements.filter((judgement) => judgement.verdict === "accepted").length;
  return Object.freeze({
    provisional: provisionalText,
    answers: judgements,
    unstable: verdicts.size > 1,
    acceptedCount,
    askedCount: judgements.length,
  });
}

/**
 * A case the deterministic path never sent to the model. It is reported
 * explicitly and never counts as accepted — `notAsked` is a first-class flag,
 * not a verdict string that a later aggregation might misread.
 */
function notAskedCase(provisionalText) {
  return Object.freeze({
    provisional: provisionalText,
    notAsked: true,
    answers: Object.freeze([]),
    unstable: false,
    acceptedCount: 0,
    askedCount: 0,
  });
}

async function complete(candidate, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${candidate.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${candidate.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: candidate.model,
        temperature: 0,
        max_tokens: PER_CASE_MAX_OUTPUT_TOKENS,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `http-${response.status}` };
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return { ok: false, error: "no-text" };
    return { ok: true, text: text.trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Appends one case record as a JSONL line to the per-candidate journal. A write
 * failure returns `{ ok: false }` rather than throwing, so the caller can stop
 * the run cleanly instead of leaving a partial paid sequence behind.
 */
async function appendCaseJournal(journalPath, caseRecord) {
  try {
    await appendFile(journalPath, `${JSON.stringify(caseRecord)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Runs the per-case sequence for one candidate with injected `complete` and
 * `writeJournal` dependencies, so the stop-on-failure discipline is testable
 * without a live provider. When a journal write fails the run ends in
 * `stopped/partial`: no further paid call is made, and the rows already
 * collected stay intact for inspection.
 */
async function runCaseSequence({ corpusItems, candidate, repeat, complete, writeJournal, now }) {
  const rows = [];
  let journalStopped = false;
  let journalStopReason = null;
  let paidCalls = 0;
  const clock = now ?? Date.now;
  for (const item of corpusItems) {
    if (journalStopped) break;
    const input = normalizeLabelInput({
      text: item.text,
      locale: item.locale ?? "zh-CN",
      context: item.context,
    });
    const provisional = deriveProvisionalLabel(input);
    let caseRecord;
    if (!decideModelRequest(input, provisional).request) {
      caseRecord = { id: item.id, ...notAskedCase(provisional.text) };
    } else {
      const prompt = buildLabelPrompt(input);
      const answers = [];
      const latencies = [];
      for (let attempt = 0; attempt < repeat; attempt += 1) {
        const startedAt = clock();
        answers.push(await complete(candidate, prompt));
        latencies.push(clock() - startedAt);
        paidCalls += 1;
      }
      caseRecord = { id: item.id, ...judgeCase(input, provisional.text, answers, latencies) };
    }
    rows.push({ id: item.id, caseRecord });
    const journalResult = await writeJournal(caseRecord);
    if (!journalResult.ok) {
      journalStopped = true;
      journalStopReason = journalResult.error;
    }
  }
  return { rows, journalStopped, journalStopReason, paidCalls };
}

function caseVerdictSummary(record) {
  if (record.notAsked || record.answers.length === 0) return "not-asked";
  const verdicts = new Set(record.answers.map((answer) => answer.verdict));
  if (verdicts.size === 1) return [...verdicts][0];
  return [...verdicts].sort().join("|");
}

function caseLatencyMs(record) {
  if (record.answers.length === 0) return 0;
  return Math.max(...record.answers.map((answer) => answer.latencyMs));
}

function caseAnswerPreview(record) {
  if (record.notAsked || record.answers.length === 0) return "—";
  const first = record.answers[0];
  return first.text ?? `<${first.transportError}>`;
}

async function report(title, rows, { journalStopped, journalStopReason } = {}) {
  const columns = [["case", 20], ["deterministic", 24], ["model", 24], ["verdict", 36], ["ms", 6]];
  const lines = [
    `\n=== ${title} ===`,
    columns.map(([name, size]) => pad(name, size)).join(""),
  ];
  for (const row of rows) {
    const record = row.caseRecord;
    lines.push([
      pad(row.id, 20),
      pad(record.provisional, 24),
      pad(caseAnswerPreview(record), 24),
      pad(caseVerdictSummary(record) + (record.unstable ? " !unstable" : ""), 36),
      pad(String(caseLatencyMs(record) || ""), 6),
    ].join(""));
    for (const answer of record.answers) {
      const detail = answer.transportError
        ? `transport:${answer.transportError}`
        : `${answer.verdict} shape=${answer.shape.ok ? "ok" : answer.shape.code}` +
          (answer.semantic && !answer.semantic.ok
            ? ` semantic=${answer.semantic.reasons.join("+")}`
            : "");
      lines.push(`    attempt ${answer.attempt}: ${detail} ${answer.latencyMs}ms`);
    }
  }

  const asked = rows.filter((row) => !row.caseRecord.notAsked && row.caseRecord.answers.length > 0);
  const accepted = asked.filter(
    (row) => row.caseRecord.acceptedCount > 0 && row.caseRecord.acceptedCount === row.caseRecord.askedCount,
  );
  const latencies = asked.map((row) => caseLatencyMs(row.caseRecord)).sort((left, right) => left - right);
  lines.push(
    `\nasked ${asked.length}/${rows.length} · accepted ${accepted.length} (${percent(accepted.length, asked.length)})` +
    ` · p50 ${quantile(latencies, 0.5)}ms · p95 ${quantile(latencies, 0.95)}ms · max ${latencies.at(-1) ?? 0}ms`,
  );
  const reasons = new Map();
  for (const row of asked) {
    for (const answer of row.caseRecord.answers) {
      if (answer.verdict === "accepted") continue;
      reasons.set(answer.verdict, (reasons.get(answer.verdict) ?? 0) + 1);
    }
  }
  for (const [reason, count] of [...reasons].sort((left, right) => right[1] - left[1])) {
    lines.push(`  ${count}x ${reason}`);
  }
  if (journalStopped) {
    lines.push(`\njournal stopped: ${journalStopReason} — run ended partial, no further paid calls`);
  }
  // Vitest intercepts console output in run mode, so the readable artefact is
  // a file under the git-ignored scratch directory.
  const reportText = lines.join("\n");
  const directory = new URL("../tmp/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const path = new URL(`label-eval-${title.split(" ")[0].replaceAll(/[^\w.-]/gu, "_")}.txt`, directory);
  await writeFile(path, `${reportText}\n`, "utf8");
  process.stdout.write(`${reportText}\n\nwritten to ${path.pathname}\n`);
}

/** Han and full-width punctuation occupy two terminal columns. */
function pad(value, size) {
  let width = 0;
  for (const character of value) width += (character.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
  return value + " ".repeat(Math.max(1, size - width));
}

function percent(part, total) {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * `.env.local` is git-ignored and holds the keys. Existing environment values
 * win, so a deployment or a one-off shell override is never overwritten.
 */
async function loadLocalEnvironment() {
  try {
    const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (match !== null) process.env[match[1]] ??= match[2];
    }
  } catch {
    // A deployment supplies the pool through real environment variables.
  }
}
describe("per-case two-layer judgement", () => {
  it("records a shape violation with its closed-set code", () => {
    const input = normalizeLabelInput({ text: "一些关于延迟的思考", locale: "zh-CN" });
    const provisional = deriveProvisionalLabel(input).text;
    const judgement = judge(input, provisional, "");
    expect(judgement.shape.ok).toBe(false);
    expect(judgement.shape.code).toBe("EMPTY");
    expect(LABEL_REJECTION_CODES).toContain("EMPTY");
    expect(judgement.verdict).toBe("rejected:shape");
  });

  it("records a semantic refusal with its closed-set reason", () => {
    const input = normalizeLabelInput({ text: "升级到 v2.3 后延迟下降明显", locale: "zh-CN" });
    const provisional = "v2.3 延迟下降";
    const judgement = judge(input, provisional, "升级后延迟下降");
    expect(judgement.shape.ok).toBe(true);
    expect(judgement.semantic.ok).toBe(false);
    expect(judgement.semantic.reasons).toContain("drops-a-stable-identifier");
    expect(LABEL_ADJUDICATION_REASONS).toContain("drops-a-stable-identifier");
    expect(judgement.verdict).toBe("rejected:semantic");
  });

  it("marks a not-asked case explicitly and never counts it as accepted", () => {
    const input = normalizeLabelInput({ text: "恐惧", locale: "zh-CN" });
    const provisional = deriveProvisionalLabel(input);
    expect(decideModelRequest(input, provisional).request).toBe(false);
    const record = notAskedCase(provisional.text);
    expect(record.notAsked).toBe(true);
    expect(record.acceptedCount).toBe(0);
    expect(record.askedCount).toBe(0);
    expect(record.answers).toHaveLength(0);
  });

  it("judges every answer in a repeat so sporadic and systematic violations are distinguishable", () => {
    const input = normalizeLabelInput({
      text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
      locale: "zh-CN",
    });
    const provisional = deriveProvisionalLabel(input).text;
    const answers = [
      { ok: true, text: provisional },
      { ok: true, text: "" },
    ];
    const record = judgeCase(input, provisional, answers, [10, 12]);
    expect(record.answers).toHaveLength(2);
    expect(record.answers[0].verdict).toBe("accepted");
    expect(record.answers[0].latencyMs).toBe(10);
    expect(record.answers[1].verdict).toBe("rejected:shape");
    expect(record.answers[1].shape.code).toBe("EMPTY");
    expect(record.answers[1].latencyMs).toBe(12);
    expect(record.unstable).toBe(true);
    expect(record.acceptedCount).toBe(1);
    expect(record.askedCount).toBe(2);
  });

  it("stops all subsequent paid calls when a journal write fails", async () => {
    let paidCalls = 0;
    const complete = async () => {
      paidCalls += 1;
      return { ok: true, text: "一个模型答案" };
    };
    const writeJournal = async () => ({ ok: false, error: "EACCES" });
    const items = [
      { id: "spoken-1", text: "呃，我觉得，我们怀念的其实不是过去本身，而是那个过去仍然允许我们想象的其他生活。" },
      { id: "spoken-2", text: "然后呢，这个延迟问题我觉得需要单独看，尤其是冷启动的时候会更明显。" },
      { id: "spoken-3", text: "其实这一块我完全没有算过，可能需要对比一下 v2.3 和 v3.0 的数据。" },
    ];
    const result = await runCaseSequence({
      corpusItems: items,
      candidate: { model: "fixture" },
      repeat: 1,
      complete,
      writeJournal,
    });
    expect(result.journalStopped).toBe(true);
    expect(result.journalStopReason).toBe("EACCES");
    expect(result.rows).toHaveLength(1);
    expect(paidCalls).toBeLessThan(items.length);
  });

  it("keeps transport errors separate from policy codes", () => {
    const input = normalizeLabelInput({ text: "升级到 v2.3 后延迟下降明显", locale: "zh-CN" });
    const provisional = "v2.3 延迟下降";
    const record = judgeAnswer(input, provisional, { ok: false, error: "http-500" }, 0, 50);
    expect(record.verdict).toBe("transport-error");
    expect(record.transportError).toBe("http-500");
    expect(record.text).toBeNull();
    expect(record.shape.code).toBe("unknown");
    expect(LABEL_REJECTION_CODES).not.toContain("http-500");
  });
});

export {
  appendCaseJournal,
  buildEvalPlanBinding,
  checkEvalPlanBinding,
  endpointDigestOf,
  EvalPlanBindingMismatchError,
  isLabelAdjudicationReason,
  isLabelRejectionCode,
  judge,
  judgeAnswer,
  judgeCase,
  LABEL_ADJUDICATION_POLICY_VERSION,
  LABEL_ADJUDICATION_REASONS,
  LABEL_COMPLETION_POLICY_VERSION,
  LABEL_REJECTION_CODES,
  notAskedCase,
  PER_CASE_MAX_OUTPUT_TOKENS,
  readBindingInputsFromEnv,
  runCaseSequence,
  thinkingModeOf,
};
