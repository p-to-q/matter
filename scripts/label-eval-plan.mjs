import { createHash } from "node:crypto";

/**
 * Eval-plan binding for the label attribution run.
 *
 * A paid attribution run must be bound to an authorization plan digest before
 * any provider call (spec 5.1.1 rule 6). The digest is rebuilt locally from
 * the same bindings and compared field by field; any mismatch stops the run
 * with zero provider requests. This is the fail-closed front gate.
 *
 * The adjudicator is wrapped, never reimplemented: this module binds metadata
 * about the adjudication policy version owned by semantic-label.ts, it does not
 * rejudge. Station and model names never appear in routine output; only their
 * declaration digest enters the plan artifact (spec 6.3.1).
 */

export const EVAL_PLAN_SCHEMA_VERSION = "label-eval-plan/1";
/**
 * Binds the eval request shape (temperature 0, max_tokens 32, stream false,
 * 20s deadline) and the closed-set judgement vocabulary. Advancing it
 * invalidates prior plan artifacts bound to an older completion shape.
 */
export const COMPLETION_POLICY_VERSION = "label-eval-completion/1";

const PLAN_FIELDS = Object.freeze([
  "schemaVersion",
  "scenarioId",
  "candidateDeclarationDigest",
  "promptVersion",
  "corpusVersion",
  "corpusContentDigest",
  "adjudicationPolicyVersion",
  "completionPolicyVersion",
  "perCaseBudget",
  "totalCallCap",
  "totalOutputTokenCap",
]);

/**
 * SHA-256 over the sorted-key JSON of each candidate's declaration. The digest
 * is the form that enters the plan artifact; the station and model names that
 * produced it do not.
 */
export function candidateDeclarationDigest(candidates) {
  const declarations = [...candidates].map((candidate) => {
    const entry = {
      station: candidate.station,
      baseUrl: candidate.baseUrl,
      model: candidate.model,
    };
    if (candidate.enableThinking !== undefined) {
      entry.enableThinking = candidate.enableThinking;
    }
    return entry;
  });
  return sha256(stableJson(declarations));
}

/**
 * Builds the bound plan from the current run bindings. Pure and deterministic:
 * the same bindings always produce the same plan and digest, so a rebuild is
 * the verification.
 */
export function buildEvalPlan(bindings) {
  return Object.freeze({
    schemaVersion: EVAL_PLAN_SCHEMA_VERSION,
    scenarioId: bindings.scenarioId,
    candidateDeclarationDigest: bindings.candidateDeclarationDigest,
    promptVersion: bindings.promptVersion,
    corpusVersion: bindings.corpusVersion,
    corpusContentDigest: bindings.corpusContentDigest,
    adjudicationPolicyVersion: bindings.adjudicationPolicyVersion,
    completionPolicyVersion: bindings.completionPolicyVersion,
    perCaseBudget: Object.freeze({ ...bindings.perCaseBudget }),
    totalCallCap: bindings.totalCallCap,
    totalOutputTokenCap: bindings.totalOutputTokenCap,
  });
}

/** Stable SHA-256 digest of a plan, independent of key insertion order. */
export function evalPlanDigest(plan) {
  return sha256(stableJson(plan));
}

/**
 * Rebuilds the plan from the actual bindings and compares it field by field
 * against the expected plan. Returns the named mismatch fields on drift, so a
 * caller can report which binding changed rather than only that one did.
 */
export function verifyEvalPlan(expectedPlan, actualBindings) {
  const actualPlan = buildEvalPlan(actualBindings);
  const expectedDigest = evalPlanDigest(expectedPlan);
  const actualDigest = evalPlanDigest(actualPlan);
  if (expectedDigest === actualDigest) {
    return Object.freeze({ ok: true, digest: actualDigest });
  }
  const mismatches = [];
  for (const field of PLAN_FIELDS) {
    if (stableJson(expectedPlan[field]) !== stableJson(actualPlan[field])) {
      mismatches.push(field);
    }
  }
  return Object.freeze({
    ok: false,
    mismatches: Object.freeze(mismatches),
    expectedDigest,
    actualDigest,
  });
}

/**
 * Front gate for a paid run. Rebuilds the plan from the current bindings and
 * throws a named error on any mismatch before the caller reaches a provider
 * loop. A thrown error here is the "zero provider calls" stop: the caller
 * places this call before `for (const candidate of pool)`, so the throw exits
 * the block before any fetch.
 */
export function authorizeEvalRun(expectedPlan, actualBindings) {
  const result = verifyEvalPlan(expectedPlan, actualBindings);
  if (result.ok) return result.digest;
  const error = new Error(
    `Label eval plan binding mismatch: ${result.mismatches.join(", ")}`,
  );
  error.name = "EvalPlanBindingError";
  error.mismatches = result.mismatches;
  error.expectedDigest = result.expectedDigest;
  error.actualDigest = result.actualDigest;
  throw error;
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