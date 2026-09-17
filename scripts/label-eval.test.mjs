import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
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
import { createPoolAdapter, readModelPool, resetPoolHealth } from "../features/matter/server/model-pool";
import { CORPUS_VERSION, contentDigest, corpus } from "./label-corpus.mjs";
import {
  COMPLETION_POLICY_VERSION,
  MAX_EVAL_WALL_CLOCK_MS,
  assertSecureEvalTls,
  candidateDeclarationDigest,
  createEvalAuthority,
  createEvalPlanArtifact,
  executeAuthorizedEvalRun,
  parseEvalRepeat,
} from "./label-eval-plan.mjs";

/**
 * Measures a live model against the deterministic label it would replace.
 *
 * This is a measurement, not a test: it needs a key, it spends money, and its
 * result is a judgement a person makes from the table it prints. It therefore
 * never runs by default. Plan and run are separate invocations: plan mode
 * freezes a private authorization artifact without calling a provider; run
 * mode reconstructs it and requires its explicitly supplied digest.
 *
 *   MATTER_LABEL_EVAL=plan npx vitest run scripts/label-eval.test.mjs
 *   MATTER_LABEL_EVAL=run MATTER_LABEL_EVAL_PLAN_DIGEST=<digest> npx vitest run scripts/label-eval.test.mjs
 */
const mode = process.env.MATTER_LABEL_EVAL;
const planMode = mode === "plan";
const runMode = mode === "run" || mode === "1";
const LABEL_ADJUDICATION_POLICY_VERSION = "label-adjudication/1";
const REPORT_ROOT = new URL("../tmp/label-eval/", import.meta.url);
const PLAN_PATH = new URL("plan.private.json", REPORT_ROOT);
const RELEASE_CANARY_MAX_GRAPHEMES = 28;
const EVAL_RUNNER_OVERHEAD_MS = 60_000;

describe.runIf(planMode)("label model evaluation plan", () => {
  it("freezes a private plan without calling a provider", async () => {
    await loadLocalEnvironment();
    assertSecureEvalTls(process.env);
    const authority = createEvalAuthority();
    const setup = prepareEvaluation(process.env, authority);
    const artifact = createEvalPlanArtifact(setup.bindings, authority.credentialBindingSalt);
    await mkdir(REPORT_ROOT, { recursive: true, mode: 0o700 });
    await writePrivateFile(PLAN_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    writeSafeOutput(
      `label-eval: plan calls<=${setup.bindings.totalCallCap}` +
      ` output-tokens<=${setup.bindings.totalOutputTokenCap}` +
      ` provider-ms<=${setup.bindings.worstCaseProviderMs}`,
    );
    writeSafeOutput(`label-eval: plan digest ${artifact.digest}`);
    writeSafeOutput("label-eval: private plan tmp/label-eval/plan.private.json");
  });
});

describe.runIf(runMode)("label model evaluation run", () => {
  it("reports every corpus case against the authorized live pool", {
    timeout: MAX_EVAL_WALL_CLOCK_MS + EVAL_RUNNER_OVERHEAD_MS,
  }, async () => {
    await loadLocalEnvironment();
    const artifact = JSON.parse(await readFile(PLAN_PATH, "utf8"));
    const setup = prepareEvaluation(process.env, {
      authorizationId: artifact?.plan?.authorizationId,
      credentialBindingSalt: artifact?.credentialBindingSalt,
    });
    await executeAuthorizedEvalRun({
      environment: process.env,
      artifact,
      suppliedDigest: process.env.MATTER_LABEL_EVAL_PLAN_DIGEST ?? "",
      actualBindings: setup.bindings,
      initialize: (planDigest) => initializeEvalArtifacts(setup.pool.length, planDigest),
      execute: async (artifacts) => {
        resetPoolHealth();
        for (const [index, candidate] of setup.pool.entries()) {
          const result = await runCaseSequence({
            corpusItems: corpus,
            candidate,
            repeat: setup.repeat,
            complete: (ownCandidate, prompt, budget, input) =>
              complete(ownCandidate, prompt, budget, input, fetch),
            writeJournal: (record) => appendCaseJournal(artifacts[index].journalPath, record),
          });
          await report(index, result.rows, artifacts[index].reportPath, {
            journalStopped: result.journalStopped,
            attemptedCalls: result.attemptedCalls,
          });
          if (result.journalStopped) break;
        }
      },
    });
  });
});

function prepareEvaluation(environment, authority) {
  const requested = (environment.MATTER_LABEL_EVAL_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const repeat = parseEvalRepeat(environment.MATTER_LABEL_EVAL_REPEAT);
  const pool = readModelPool(environment).filter(
    (candidate) => requested.length === 0 ||
      requested.some((model) => model.toLowerCase() === candidate.model.toLowerCase()),
  );
  if (pool.length === 0) {
    throw new Error("Configure MATTER_MODEL_POOL (or the complete legacy MATTER_LABEL_POOL) before evaluation.");
  }

  const caseBudgets = corpus.map((item) => {
    const input = normalizeCorpusItem(item);
    const budget = LABEL_SCENARIO.budget(input);
    const provisional = deriveProvisionalLabel(input);
    return Object.freeze({
      id: item.id,
      requested: decideModelRequest(input, provisional).request,
      maxGraphemes: input.maxGraphemes,
      deadlineMs: budget.deadlineMs,
      maxOutputTokens: budget.maxOutputTokens,
      disableThinking: budget.disableThinking === true,
    });
  });
  const caseBudgetDigest = createHash("sha256")
    .update(JSON.stringify(caseBudgets), "utf8")
    .digest("hex");
  const compiledPromptDigest = createHash("sha256");
  for (const item of corpus) {
    compiledPromptDigest.update(item.id, "utf8");
    compiledPromptDigest.update("\0");
    compiledPromptDigest.update(buildLabelPrompt(normalizeCorpusItem(item)), "utf8");
    compiledPromptDigest.update("\n");
  }
  const requestedBudgets = caseBudgets.filter((budget) => budget.requested);
  const outputTokensPerCandidate = requestedBudgets.reduce(
    (total, budget) => total + budget.maxOutputTokens,
    0,
  );
  const providerMsPerCandidate = requestedBudgets.reduce(
    (total, budget) => total + budget.deadlineMs,
    0,
  );
  const deadlines = new Set(caseBudgets.map((budget) => budget.deadlineMs));
  if (deadlines.size !== 1 || caseBudgets.some((budget) => !budget.disableThinking)) {
    throw new Error("The Label evaluation request policy no longer matches one production budget.");
  }
  const totalCallCap = pool.length * requestedBudgets.length * repeat;
  const totalOutputTokenCap = pool.length * outputTokensPerCandidate * repeat;
  const worstCaseProviderMs = pool.length * providerMsPerCandidate * repeat;
  if (
    !Number.isSafeInteger(totalCallCap) ||
    !Number.isSafeInteger(totalOutputTokenCap) ||
    !Number.isSafeInteger(worstCaseProviderMs) ||
    worstCaseProviderMs > MAX_EVAL_WALL_CLOCK_MS
  ) {
    throw new Error("The Label evaluation plan exceeds its bounded wall-clock authority.");
  }
  const bindings = Object.freeze({
    authorizationId: authority.authorizationId,
    scenarioId: LABEL_SCENARIO.id,
    candidateDeclarationDigest: candidateDeclarationDigest(
      pool,
      authority.credentialBindingSalt,
    ),
    candidateCount: pool.length,
    promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
    compiledPromptDigest: compiledPromptDigest.digest("hex"),
    corpusVersion: CORPUS_VERSION,
    corpusContentDigest: contentDigest(),
    adjudicationPolicyVersion: LABEL_ADJUDICATION_POLICY_VERSION,
    completionPolicyVersion: COMPLETION_POLICY_VERSION,
    requestBudget: Object.freeze({
      deadlineMs: caseBudgets[0].deadlineMs,
      disableThinking: true,
      repeat,
      releaseCanaryMaxGraphemes: RELEASE_CANARY_MAX_GRAPHEMES,
      requestedCaseCount: requestedBudgets.length,
      caseBudgetDigest,
    }),
    worstCaseProviderMs,
    wallClockCeilingMs: MAX_EVAL_WALL_CLOCK_MS,
    totalCallCap,
    totalOutputTokenCap,
  });
  return Object.freeze({ pool, repeat, bindings });
}

async function initializeEvalArtifacts(candidateCount, planDigest, reportRoot = REPORT_ROOT) {
  if (!/^[a-f0-9]{64}$/u.test(planDigest)) throw new Error("Invalid Label evaluation plan digest.");
  const runDirectory = new URL(`run-${planDigest}/`, reportRoot);
  // Directory creation is the single-use authorization claim. EEXIST means
  // this digest already ran or is running; neither evidence nor spend may be
  // replayed or truncated under the same authorization.
  await mkdir(runDirectory, { mode: 0o700 });
  const artifacts = [];
  for (let index = 0; index < candidateCount; index += 1) {
    const ordinal = String(index + 1).padStart(2, "0");
    const journalPath = new URL(`candidate-${ordinal}.private.jsonl`, runDirectory);
    const reportPath = new URL(`candidate-${ordinal}.safe.txt`, runDirectory);
    // Exclusive creation is the durable preflight. A failure throws and the
    // lifecycle gate never exposes the provider execution callback.
    await writeFile(journalPath, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await writeFile(reportPath, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
    artifacts.push(Object.freeze({ journalPath, reportPath }));
  }
  return Object.freeze(artifacts);
}

function normalizeCorpusItem(item) {
  return normalizeLabelInput({
    text: item.text,
    locale: item.locale ?? "zh-CN",
    context: item.context,
    ...(item.id.startsWith("canary-sourced-")
      ? { maxGraphemes: RELEASE_CANARY_MAX_GRAPHEMES }
      : {}),
  });
}

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
  return summarizeJudgements(provisionalText, judgements, judgements.length);
}

function summarizeJudgements(provisionalText, judgements, expectedAttempts) {
  const verdicts = new Set(judgements.map((judgement) => judgement.verdict));
  const acceptedCount = judgements.filter((judgement) => judgement.verdict === "accepted").length;
  return Object.freeze({
    provisional: provisionalText,
    answers: Object.freeze([...judgements]),
    unstable: verdicts.size > 1,
    acceptedCount,
    askedCount: judgements.length,
    complete: judgements.length === expectedAttempts,
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
    complete: true,
  });
}

async function complete(candidate, prompt, budget, input, fetchImpl) {
  try {
    const adapter = createPoolAdapter([candidate], undefined, Date.now, fetchImpl);
    const result = await adapter(Object.freeze({
      scenario: LABEL_SCENARIO.id,
      prompt,
      locale: input.locale,
      input,
      deadlineMs: budget.deadlineMs,
      maxOutputTokens: budget.maxOutputTokens,
      ...(budget.disableThinking === true ? { disableThinking: true } : {}),
      observeCandidate: () => undefined,
    }), new AbortController().signal);
    return { ok: true, text: result.text.trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "failed" };
  }
}

/**
 * Appends one case or completion-attempt record to the per-candidate journal. A write
 * failure returns `{ ok: false }` rather than throwing, so the caller can stop
 * the run cleanly instead of leaving a partial attempt sequence behind.
 */
async function appendCaseJournal(journalPath, caseRecord, { openFile = open } = {}) {
  let handle;
  try {
    handle = await openFile(journalPath, "a");
    await handle.appendFile(`${JSON.stringify(caseRecord)}\n`, "utf8");
    await handle.datasync();
    await handle.close();
    handle = undefined;
    return { ok: true };
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // Preserve the first filesystem failure as the bounded stop reason.
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writePrivateFile(path, contents) {
  const handle = await open(path, "w", 0o600);
  try {
    // `open` does not narrow an existing file's mode, so enforce it before
    // writing the credential verifier and flush before announcing its digest.
    await handle.chmod(0o600);
    await handle.writeFile(contents, "utf8");
    await handle.datasync();
  } finally {
    await handle.close();
  }
}

/**
 * Runs the per-case sequence for one candidate with injected `complete` and
 * `writeJournal` dependencies, so the stop-on-failure discipline is testable
 * without a live provider. When a journal write fails the run ends in
 * `stopped/partial`: no further completion attempt is made, and the rows already
 * collected stay intact for inspection.
 */
async function runCaseSequence({ corpusItems, candidate, repeat, complete, writeJournal, now }) {
  const rows = [];
  let journalStopped = false;
  let journalStopReason = null;
  let attemptedCalls = 0;
  const clock = now ?? Date.now;
  corpusLoop: for (const item of corpusItems) {
    if (journalStopped) break;
    const input = normalizeCorpusItem(item);
    const provisional = deriveProvisionalLabel(input);
    const requested = decideModelRequest(input, provisional).request;
    const headerResult = await writeJournal(Object.freeze({
      kind: "case",
      id: item.id,
      provisional: provisional.text,
      requested,
    }));
    if (!headerResult.ok) {
      journalStopped = true;
      journalStopReason = headerResult.error;
      break;
    }
    if (!requested) {
      const caseRecord = { id: item.id, ...notAskedCase(provisional.text) };
      rows.push({ id: item.id, caseRecord });
      continue;
    }

    const prompt = buildLabelPrompt(input);
    const budget = LABEL_SCENARIO.budget(input);
    const judgements = [];
    for (let attempt = 0; attempt < repeat; attempt += 1) {
      const startedAt = clock();
      const answer = await complete(candidate, prompt, budget, input);
      const judgement = judgeAnswer(
        input,
        provisional.text,
        answer,
        attempt,
        clock() - startedAt,
      );
      attemptedCalls += 1;
      const journalResult = await writeJournal(Object.freeze({
        kind: "attempt",
        id: item.id,
        ...judgement,
      }));
      if (!journalResult.ok) {
        journalStopped = true;
        journalStopReason = journalResult.error;
        if (judgements.length > 0) {
          rows.push({
            id: item.id,
            caseRecord: {
              id: item.id,
              ...summarizeJudgements(provisional.text, judgements, repeat),
            },
          });
        }
        break corpusLoop;
      }
      judgements.push(judgement);
    }
    rows.push({
      id: item.id,
      caseRecord: { id: item.id, ...summarizeJudgements(provisional.text, judgements, repeat) },
    });
  }
  return { rows, journalStopped, journalStopReason, attemptedCalls };
}

async function report(candidateIndex, rows, reportPath, options = {}) {
  const reportText = formatSafeReport(candidateIndex, rows, options);
  await writeFile(reportPath, `${reportText}\n`, "utf8");
  writeSafeOutput(reportText);
}

function formatSafeReport(candidateIndex, rows, {
  journalStopped = false,
  attemptedCalls,
} = {}) {
  const asked = rows.filter((row) => !row.caseRecord.notAsked && row.caseRecord.answers.length > 0);
  const accepted = asked.filter(
    (row) => row.caseRecord.complete &&
      row.caseRecord.acceptedCount > 0 &&
      row.caseRecord.acceptedCount === row.caseRecord.askedCount,
  );
  const attempts = asked.flatMap((row) => row.caseRecord.answers);
  const completionAttempts = attemptedCalls ?? attempts.length;
  const unrecordedAttempts = Math.max(0, completionAttempts - attempts.length);
  const verdicts = new Map([
    ["accepted", 0],
    ["rejected:shape", 0],
    ["rejected:semantic", 0],
    ["transport-error", 0],
    ["unknown", 0],
  ]);
  const shapeCodes = new Map([...LABEL_REJECTION_CODES, "unknown"].map((code) => [code, 0]));
  const semanticReasons = new Map([...LABEL_ADJUDICATION_REASONS, "unknown"].map((reason) => [reason, 0]));
  const latencyBuckets = new Map([
    ["lt-250ms", 0],
    ["250-999ms", 0],
    ["1-4.999s", 0],
    ["gte-5s", 0],
  ]);
  for (const answer of attempts) {
    const verdict = verdicts.has(answer.verdict) ? answer.verdict : "unknown";
    verdicts.set(verdict, verdicts.get(verdict) + 1);
    if (!answer.shape.ok) {
      const code = shapeCodes.has(answer.shape.code) ? answer.shape.code : "unknown";
      shapeCodes.set(code, shapeCodes.get(code) + 1);
    }
    if (answer.semantic && !answer.semantic.ok) {
      for (const reason of answer.semantic.reasons) {
        const safeReason = semanticReasons.has(reason) ? reason : "unknown";
        semanticReasons.set(safeReason, semanticReasons.get(safeReason) + 1);
      }
    }
    const bucket = answer.latencyMs < 250
      ? "lt-250ms"
      : answer.latencyMs < 1_000
        ? "250-999ms"
        : answer.latencyMs < 5_000
          ? "1-4.999s"
          : "gte-5s";
    latencyBuckets.set(bucket, (latencyBuckets.get(bucket) ?? 0) + 1);
  }
  const lines = [
    `label-eval: candidate-${String(candidateIndex + 1).padStart(2, "0")}`,
    `status=${journalStopped ? "stopped-journal" : "completed"}`,
    `cases total=${rows.length} asked=${asked.length} not-asked=${rows.length - asked.length}` +
      ` accepted-all=${accepted.length}` +
      ` partial=${rows.filter((row) => row.caseRecord.complete === false).length}` +
      ` unstable=${rows.filter((row) => row.caseRecord.unstable).length}`,
    `attempts attempted=${completionAttempts} recorded=${attempts.length}` +
      ` unrecorded=${unrecordedAttempts} ${formatClosedCounts(verdicts)}`,
    `shape ${formatClosedCounts(shapeCodes)}`,
    `semantic ${formatClosedCounts(semanticReasons)}`,
    `latency ${formatClosedCounts(latencyBuckets)}`,
  ];
  return lines.join("\n");
}

function formatClosedCounts(counts) {
  return [...counts].map(([name, count]) => `${name}=${count}`).join(" ");
}

function writeSafeOutput(value) {
  process.stdout.write(`${value}\n`);
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
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    // A deployment may supply the pool through real environment variables.
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

  it("stops all subsequent completion attempts when a journal write fails", async () => {
    let completionCalls = 0;
    let journalWrites = 0;
    const complete = async () => {
      completionCalls += 1;
      return { ok: true, text: "一个模型答案" };
    };
    const writeJournal = async () => {
      journalWrites += 1;
      return journalWrites === 1 ? { ok: true } : { ok: false, error: "EACCES" };
    };
    const items = [
      { id: "spoken-1", text: "呃，我觉得，我们怀念的其实不是过去本身，而是那个过去仍然允许我们想象的其他生活。" },
      { id: "spoken-2", text: "然后呢，这个延迟问题我觉得需要单独看，尤其是冷启动的时候会更明显。" },
      { id: "spoken-3", text: "其实这一块我完全没有算过，可能需要对比一下 v2.3 和 v3.0 的数据。" },
    ];
    const result = await runCaseSequence({
      corpusItems: items,
      candidate: { model: "fixture" },
      repeat: 3,
      complete,
      writeJournal,
    });
    expect(result.journalStopped).toBe(true);
    expect(result.journalStopReason).toBe("EACCES");
    expect(result.rows).toHaveLength(0);
    expect(completionCalls).toBe(1);
    expect(formatSafeReport(0, result.rows, {
      journalStopped: result.journalStopped,
      attemptedCalls: result.attemptedCalls,
    })).toContain("attempts attempted=1 recorded=0 unrecorded=1");
  });

  it.each(["datasync", "close"])(
    "stops after a real journal handle %s failure",
    async (failureMethod) => {
      let openCount = 0;
      let completionCalls = 0;
      const openFile = async () => {
        openCount += 1;
        const failThisHandle = openCount === 2;
        return {
          appendFile: async () => undefined,
          datasync: async () => {
            if (failThisHandle && failureMethod === "datasync") throw new Error("EIO-datasync");
          },
          close: async () => {
            if (failThisHandle && failureMethod === "close") throw new Error("EIO-close");
          },
        };
      };
      const result = await runCaseSequence({
        corpusItems: [{
          id: "spoken-1",
          text: "呃，我觉得，我们怀念的其实不是过去本身，而是那个过去仍然允许我们想象的其他生活。",
        }],
        candidate: { model: "fixture" },
        repeat: 2,
        complete: async () => {
          completionCalls += 1;
          return { ok: true, text: "想象的生活" };
        },
        writeJournal: (record) => appendCaseJournal("fixture", record, { openFile }),
      });
      expect(result.journalStopped).toBe(true);
      expect(result.journalStopReason).toContain(`EIO-${failureMethod}`);
      expect(result).toMatchObject({ attemptedCalls: 1, rows: [] });
      expect(completionCalls).toBe(1);
    },
  );

  it("journals every completion result before allowing the next call", async () => {
    const events = [];
    const result = await runCaseSequence({
      corpusItems: [{
        id: "spoken-1",
        text: "呃，我觉得，我们怀念的其实不是过去本身，而是那个过去仍然允许我们想象的其他生活。",
      }],
      candidate: { model: "fixture" },
      repeat: 2,
      complete: async () => {
        events.push("call");
        return { ok: true, text: "想象的生活" };
      },
      writeJournal: async (record) => {
        events.push(record.kind === "attempt" ? `write-${record.attempt}` : "write-case");
        return { ok: true };
      },
    });
    expect(events).toEqual(["write-case", "call", "write-0", "call", "write-1"]);
    expect(result).toMatchObject({ journalStopped: false, attemptedCalls: 2 });
    expect(result.rows[0].caseRecord.complete).toBe(true);
  });

  it("atomically claims one plan digest and never truncates its evidence", async () => {
    const directory = await mkdtemp(`${tmpdir()}/matter-label-eval-`);
    const reportRoot = pathToFileURL(`${directory}/`);
    try {
      const digest = "a".repeat(64);
      const first = await initializeEvalArtifacts(1, digest, reportRoot);
      expect((await stat(first[0].journalPath)).mode & 0o777).toBe(0o600);
      expect((await stat(first[0].reportPath)).mode & 0o777).toBe(0o600);
      await writeFile(first[0].journalPath, "sentinel\n", "utf8");
      await expect(initializeEvalArtifacts(1, digest, reportRoot)).rejects.toMatchObject({
        code: "EEXIST",
      });
      await expect(readFile(first[0].journalPath, "utf8")).resolves.toBe("sentinel\n");

      const concurrentDigest = "b".repeat(64);
      const claims = await Promise.allSettled([
        initializeEvalArtifacts(1, concurrentDigest, reportRoot),
        initializeEvalArtifacts(1, concurrentDigest, reportRoot),
      ]);
      expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
      expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stores the credential verifier with owner-only permissions", async () => {
    const directory = await mkdtemp(`${tmpdir()}/matter-label-plan-`);
    const planPath = pathToFileURL(`${directory}/plan.private.json`);
    try {
      await writeFile(planPath, "old\n", { encoding: "utf8", mode: 0o644 });
      await writePrivateFile(planPath, "new\n");
      expect((await stat(planPath)).mode & 0o777).toBe(0o600);
      await expect(readFile(planPath, "utf8")).resolves.toBe("new\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an authorized shape whose worst-case provider time exceeds the runner", () => {
    const models = Array.from({ length: 12 }, (_, index) => `model-${index}`).join(",");
    expect(() => prepareEvaluation({
      MATTER_MODEL_POOL: "primary",
      MATTER_MODEL_PRIMARY_BASE_URL: "https://relay.example/v1",
      MATTER_MODEL_PRIMARY_API_KEY: "private-key",
      MATTER_MODEL_PRIMARY_MODELS: models,
      MATTER_LABEL_EVAL_REPEAT: "10",
    }, {
      authorizationId: "a".repeat(32),
      credentialBindingSalt: Buffer.alloc(32, 8).toString("base64url"),
    })).toThrow(/bounded wall-clock authority/u);
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

  it("uses the production Label token and thinking policy in the eval request", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "cold-start latency" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const input = normalizeLabelInput({
      text: "The caching layer dominates latency during cold starts.",
      locale: "en-US",
    });
    const budget = LABEL_SCENARIO.budget(input);
    expect(budget).toMatchObject({ maxOutputTokens: 64, disableThinking: true });
    await complete(
      {
        baseUrl: "https://relay.example/v1",
        apiKey: "fixture",
        model: "fixture-model",
        enableThinking: true,
      },
      "fixture prompt",
      budget,
      input,
      fetchImpl,
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body)).toMatchObject({
      max_tokens: 64,
      enable_thinking: false,
      stream: false,
      temperature: 0,
    });

    calls.length = 0;
    await complete(
      {
        baseUrl: "https://relay.example/v1",
        apiKey: "fixture",
        model: "fixture-model",
      },
      "fixture prompt",
      budget,
      input,
      fetchImpl,
    );
    expect(JSON.parse(calls[0].init.body)).not.toHaveProperty("enable_thinking");
  });

  it("uses the production completion parser and rejects a truncated answer", async () => {
    const input = normalizeLabelInput({
      text: "The caching layer dominates latency during cold starts.",
      locale: "en-US",
    });
    const result = await complete(
      {
        baseUrl: "https://relay.example/v1",
        apiKey: "fixture",
        model: "fixture-model",
      },
      "fixture prompt",
      LABEL_SCENARIO.budget(input),
      input,
      async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "partial answer" } }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(result).toEqual({ ok: false, error: "UnusableCompletionError" });
  });

  it("binds release-canary cases to the route's 28-grapheme envelope", () => {
    const canary = normalizeCorpusItem(corpus.find((item) => item.id === "canary-sourced-absence"));
    const ordinaryLatin = normalizeCorpusItem(corpus.find((item) => item.id === "latin-long"));
    expect(canary.maxGraphemes).toBe(28);
    expect(LABEL_SCENARIO.budget(canary).maxOutputTokens).toBe(56);
    expect(ordinaryLatin.maxGraphemes).toBe(32);
    expect(LABEL_SCENARIO.budget(ordinaryLatin).maxOutputTokens).toBe(64);
  });

  it("keeps exact material, answers, providers, and transport details out of safe output", () => {
    const rows = [{
      id: "private-case-id",
      caseRecord: {
        provisional: "private material words",
        answers: [{
          text: "private model answer",
          transportError: "http-599-provider-detail",
          verdict: "transport-error",
          shape: { ok: false, code: "unknown" },
          semantic: { ok: false, reasons: ["unknown"] },
          latencyMs: 812,
        }, {
          text: "another private answer",
          transportError: null,
          verdict: "future-provider-verdict",
          shape: { ok: false, code: "future-provider-shape" },
          semantic: { ok: false, reasons: ["future-provider-semantic"] },
          latencyMs: 8_000,
        }],
        unstable: false,
        acceptedCount: 0,
        askedCount: 1,
      },
    }];
    const output = formatSafeReport(0, rows);
    expect(output).toContain("candidate-01");
    expect(output).toContain("transport-error=1");
    expect(output).toContain("unknown=1");
    expect(output).toContain("250-999ms=1");
    expect(output).toContain("attempts attempted=2 recorded=2 unrecorded=0");
    expect(output).not.toMatch(/private|future-provider|provider-detail|http-599/u);
  });
});

export {
  appendCaseJournal,
  complete,
  formatSafeReport,
  initializeEvalArtifacts,
  isLabelAdjudicationReason,
  isLabelRejectionCode,
  judge,
  judgeAnswer,
  judgeCase,
  LABEL_ADJUDICATION_POLICY_VERSION,
  LABEL_ADJUDICATION_REASONS,
  LABEL_REJECTION_CODES,
  normalizeCorpusItem,
  notAskedCase,
  prepareEvaluation,
  report,
  runCaseSequence,
};
