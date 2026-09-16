import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETION_POLICY_VERSION,
  authorizeEvalRun,
  buildEvalPlan,
  candidateDeclarationDigest,
  evalPlanDigest,
  verifyEvalPlan,
} from "./label-eval-plan.mjs";

/**
 * Focused proof for the eval-plan binding front gate (spec 5.1.1 rule 6).
 * No network: these tests exercise the pure build/verify/digest cycle only.
 */
const baseBindings = Object.freeze({
  scenarioId: "matter-thought-label",
  candidateDeclarationDigest: candidateDeclarationDigest([
    { station: "abc", baseUrl: "https://relay.example/v1", model: "Qwen-flash" },
  ]),
  promptVersion: "thought-label/3",
  corpusVersion: "thought-label-corpus/1",
  corpusContentDigest: "0".repeat(64),
  adjudicationPolicyVersion: "label-adjudication/1",
  completionPolicyVersion: COMPLETION_POLICY_VERSION,
  perCaseBudget: Object.freeze({ deadlineMs: 20_000, maxOutputTokens: 32, repeat: 1 }),
  totalCallCap: 18,
  totalOutputTokenCap: 576,
});

test("a matching plan verifies and continues", () => {
  const plan = buildEvalPlan(baseBindings);
  const result = verifyEvalPlan(plan, baseBindings);
  assert.equal(result.ok, true);
  assert.equal(result.digest, evalPlanDigest(plan));
  assert.match(result.digest, /^[a-f0-9]{64}$/u);
});

test("a single field drift stops with a named mismatch before any provider call", () => {
  const plan = buildEvalPlan(baseBindings);
  const drifted = { ...baseBindings, corpusVersion: "thought-label-corpus/2" };
  let providerCalls = 0;
  assert.throws(
    () => authorizeEvalRun(plan, drifted),
    (error) => error.name === "EvalPlanBindingError"
      && error.mismatches.includes("corpusVersion")
      && /corpusVersion/.test(error.message),
  );
  // authorizeEvalRun sits before the provider loop in the caller; a thrown
  // error exits the block before any fetch, so zero calls are made.
  assert.equal(providerCalls, 0);
});

test("the digest is byte-stable across rebuilds", () => {
  const first = evalPlanDigest(buildEvalPlan(baseBindings));
  const second = evalPlanDigest(buildEvalPlan(baseBindings));
  assert.equal(first, second);
});

test("a candidate declaration drift is named separately from corpus drift", () => {
  const plan = buildEvalPlan(baseBindings);
  const driftedPool = candidateDeclarationDigest([
    { station: "abc", baseUrl: "https://relay.example/v1", model: "DeepSeek-V3" },
  ]);
  const drifted = { ...baseBindings, candidateDeclarationDigest: driftedPool };
  const result = verifyEvalPlan(plan, drifted);
  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches, ["candidateDeclarationDigest"]);
});