import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Authorization boundary for a paid Label evaluation.
 *
 * `plan` and `run` are deliberately separate invocations. Plan mode freezes a
 * private artifact; run mode reconstructs the plan and requires both that
 * artifact and its explicit digest. Building an expected and actual value in
 * one process is not authorization.
 */
export const EVAL_PLAN_SCHEMA_VERSION = "label-eval-plan/3";
export const COMPLETION_POLICY_VERSION = "label-eval-completion/3";
export const MAX_EVAL_REPEAT = 10;
export const MAX_EVAL_WALL_CLOCK_MS = 2 * 60 * 60_000;

const PLAN_FIELDS = Object.freeze([
  "schemaVersion",
  "authorizationId",
  "scenarioId",
  "candidateDeclarationDigest",
  "candidateCount",
  "promptVersion",
  "compiledPromptDigest",
  "corpusVersion",
  "corpusContentDigest",
  "adjudicationPolicyVersion",
  "completionPolicyVersion",
  "requestBudget",
  "worstCaseProviderMs",
  "wallClockCeilingMs",
  "totalCallCap",
  "totalOutputTokenCap",
]);

export function parseEvalRepeat(value) {
  if (value === undefined || value === "") return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    throw new Error(`MATTER_LABEL_EVAL_REPEAT must be a whole number from 1 to ${MAX_EVAL_REPEAT}.`);
  }
  const repeat = Number(value);
  if (!Number.isSafeInteger(repeat) || repeat > MAX_EVAL_REPEAT) {
    throw new Error(`MATTER_LABEL_EVAL_REPEAT must be a whole number from 1 to ${MAX_EVAL_REPEAT}.`);
  }
  return repeat;
}

export function assertSecureEvalTls(environment) {
  if (environment?.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Label evaluation refuses to run while TLS certificate verification is disabled.");
  }
}

/** One private, single-use authorization identity and credential-binding key. */
export function createEvalAuthority() {
  return Object.freeze({
    authorizationId: randomBytes(16).toString("hex"),
    credentialBindingSalt: randomBytes(32).toString("base64url"),
  });
}

/**
 * A private keyed digest over exact provider declarations and credentials.
 * The salt exists only in the gitignored authorization artifact; neither it nor
 * a reusable plain hash of a possibly low-entropy key enters safe output.
 */
export function candidateDeclarationDigest(candidates, credentialBindingSalt) {
  assertCredentialBindingSalt(credentialBindingSalt);
  const declarations = [...candidates].map((candidate) => {
    const entry = {
      station: candidate.station,
      baseUrl: candidate.baseUrl,
      model: candidate.model,
      apiKey: candidate.apiKey,
    };
    if (candidate.enableThinking !== undefined) entry.enableThinking = candidate.enableThinking;
    return entry;
  });
  return createHmac("sha256", Buffer.from(credentialBindingSalt, "base64url"))
    .update("matter/label-eval/candidate-binding/1\0", "utf8")
    .update(stableJson(declarations), "utf8")
    .digest("hex");
}

export function buildEvalPlan(bindings) {
  return Object.freeze({
    schemaVersion: EVAL_PLAN_SCHEMA_VERSION,
    authorizationId: bindings.authorizationId,
    scenarioId: bindings.scenarioId,
    candidateDeclarationDigest: bindings.candidateDeclarationDigest,
    candidateCount: bindings.candidateCount,
    promptVersion: bindings.promptVersion,
    compiledPromptDigest: bindings.compiledPromptDigest,
    corpusVersion: bindings.corpusVersion,
    corpusContentDigest: bindings.corpusContentDigest,
    adjudicationPolicyVersion: bindings.adjudicationPolicyVersion,
    completionPolicyVersion: bindings.completionPolicyVersion,
    requestBudget: Object.freeze({ ...bindings.requestBudget }),
    worstCaseProviderMs: bindings.worstCaseProviderMs,
    wallClockCeilingMs: bindings.wallClockCeilingMs,
    totalCallCap: bindings.totalCallCap,
    totalOutputTokenCap: bindings.totalOutputTokenCap,
  });
}

export function evalPlanDigest(plan) {
  return sha256(stableJson(plan));
}

export function createEvalPlanArtifact(bindings, credentialBindingSalt) {
  assertCredentialBindingSalt(credentialBindingSalt);
  const plan = buildEvalPlan(bindings);
  return Object.freeze({
    schemaVersion: EVAL_PLAN_SCHEMA_VERSION,
    digest: evalPlanDigest(plan),
    credentialBindingSalt,
    plan,
  });
}

export function verifyEvalPlan(expectedPlan, actualBindings) {
  const actualPlan = buildEvalPlan(actualBindings);
  const expectedDigest = evalPlanDigest(expectedPlan);
  const actualDigest = evalPlanDigest(actualPlan);
  if (expectedDigest === actualDigest) return Object.freeze({ ok: true, digest: actualDigest });

  const mismatches = [];
  for (const field of PLAN_FIELDS) {
    if (stableJson(expectedPlan?.[field]) !== stableJson(actualPlan[field])) mismatches.push(field);
  }
  return Object.freeze({
    ok: false,
    mismatches: Object.freeze(mismatches),
    expectedDigest,
    actualDigest,
  });
}

/**
 * Requires an artifact produced by an earlier plan invocation plus the digest
 * copied explicitly by the operator. Neither one authorizes a run alone.
 */
export function authorizeEvalRun({ artifact, suppliedDigest, actualBindings }) {
  const expectedPlan = artifact?.plan;
  const artifactDigest = artifact?.digest;
  const validAuthority = typeof expectedPlan?.authorizationId === "string" &&
    /^[a-f0-9]{32}$/u.test(expectedPlan.authorizationId) &&
    isCredentialBindingSalt(artifact?.credentialBindingSalt);
  const validDigest = typeof suppliedDigest === "string" && /^[a-f0-9]{64}$/u.test(suppliedDigest);
  const result = expectedPlan === undefined
    ? null
    : verifyEvalPlan(expectedPlan, actualBindings);
  if (
    artifact?.schemaVersion === EVAL_PLAN_SCHEMA_VERSION &&
    validAuthority &&
    validDigest &&
    artifactDigest === suppliedDigest &&
    result?.ok === true &&
    result.digest === suppliedDigest
  ) {
    return result.digest;
  }

  const error = new Error("Label evaluation does not match its pre-generated private plan.");
  error.name = "EvalPlanBindingError";
  error.mismatches = result?.ok === false ? result.mismatches : Object.freeze(["artifact"]);
  throw error;
}

function assertCredentialBindingSalt(value) {
  if (!isCredentialBindingSalt(value)) {
    throw new Error("Label evaluation credential binding is invalid.");
  }
}

function isCredentialBindingSalt(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

/**
 * The single paid-run lifecycle seam. Security, frozen authorization, and all
 * durable output preflight finish before `execute` can obtain a fetch path.
 */
export async function executeAuthorizedEvalRun({
  environment,
  artifact,
  suppliedDigest,
  actualBindings,
  initialize,
  execute,
}) {
  assertSecureEvalTls(environment);
  const digest = authorizeEvalRun({ artifact, suppliedDigest, actualBindings });
  const initialized = await initialize(digest);
  return execute(initialized, digest);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
