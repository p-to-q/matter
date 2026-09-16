import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETION_POLICY_VERSION,
  MAX_EVAL_REPEAT,
  MAX_EVAL_WALL_CLOCK_MS,
  assertSecureEvalTls,
  authorizeEvalRun,
  buildEvalPlan,
  candidateDeclarationDigest,
  createEvalAuthority,
  createEvalPlanArtifact,
  evalPlanDigest,
  executeAuthorizedEvalRun,
  parseEvalRepeat,
  verifyEvalPlan,
} from "./label-eval-plan.mjs";

const AUTHORITY = Object.freeze({
  authorizationId: "a".repeat(32),
  credentialBindingSalt: Buffer.alloc(32, 7).toString("base64url"),
});
const CANDIDATE = Object.freeze({
  station: "abc",
  baseUrl: "https://relay.example/v1",
  apiKey: "private-key-one",
  model: "Qwen-flash",
});
const baseBindings = Object.freeze({
  authorizationId: AUTHORITY.authorizationId,
  scenarioId: "matter-thought-label",
  candidateDeclarationDigest: candidateDeclarationDigest(
    [CANDIDATE],
    AUTHORITY.credentialBindingSalt,
  ),
  candidateCount: 1,
  promptVersion: "thought-label/4",
  compiledPromptDigest: "2".repeat(64),
  corpusVersion: "label-corpus/2",
  corpusContentDigest: "0".repeat(64),
  adjudicationPolicyVersion: "label-adjudication/1",
  completionPolicyVersion: COMPLETION_POLICY_VERSION,
  requestBudget: Object.freeze({
    deadlineMs: 20_000,
    disableThinking: true,
    repeat: 1,
    releaseCanaryMaxGraphemes: 28,
    caseBudgetDigest: "1".repeat(64),
  }),
  worstCaseProviderMs: 420_000,
  wallClockCeilingMs: MAX_EVAL_WALL_CLOCK_MS,
  totalCallCap: 21,
  totalOutputTokenCap: 1_064,
});

test("an externally frozen artifact authorizes the matching reconstructed plan", () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  const digest = authorizeEvalRun({
    artifact: structuredClone(artifact),
    suppliedDigest: artifact.digest,
    actualBindings: baseBindings,
  });
  assert.equal(digest, evalPlanDigest(buildEvalPlan(baseBindings)));
  assert.equal(verifyEvalPlan(artifact.plan, baseBindings).ok, true);
});

test("plan drift prevents the injected provider path from running", async () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: true };
  };
  await assert.rejects(
    executeAuthorizedEvalRun({
      environment: {},
      artifact,
      suppliedDigest: artifact.digest,
      actualBindings: { ...baseBindings, corpusVersion: "label-corpus/3" },
      initialize: async () => Object.freeze({}),
      execute: async () => fetchImpl("https://relay.example/v1/chat/completions"),
    }),
    (error) => error.name === "EvalPlanBindingError"
      && error.mismatches.includes("corpusVersion"),
  );
  assert.equal(fetchCalls, 0);
});

test("an artifact cannot self-authorize without the separately supplied digest", () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  assert.throws(
    () => authorizeEvalRun({ artifact, suppliedDigest: "", actualBindings: baseBindings }),
    { name: "EvalPlanBindingError" },
  );
});

test("journal preflight failure prevents the injected provider path from running", async () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: true };
  };
  await assert.rejects(
    executeAuthorizedEvalRun({
      environment: {},
      artifact,
      suppliedDigest: artifact.digest,
      actualBindings: baseBindings,
      initialize: async () => {
        throw new Error("EACCES");
      },
      execute: async () => fetchImpl("https://relay.example/v1/chat/completions"),
    }),
    /EACCES/u,
  );
  assert.equal(fetchCalls, 0);
});

test("the authorized and initialized lifecycle exposes the injected fetch exactly once", async () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  let fetchCalls = 0;
  const result = await executeAuthorizedEvalRun({
    environment: {},
    artifact,
    suppliedDigest: artifact.digest,
    actualBindings: baseBindings,
    initialize: async () => Object.freeze({ ready: true }),
    execute: async (initialized) => {
      assert.equal(initialized.ready, true);
      fetchCalls += 1;
      return "answered";
    },
  });
  assert.equal(result, "answered");
  assert.equal(fetchCalls, 1);
});

test("disabled TLS verification fails before journal or provider work", async () => {
  const artifact = createEvalPlanArtifact(baseBindings, AUTHORITY.credentialBindingSalt);
  let journalInitializations = 0;
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: true };
  };
  await assert.rejects(
    executeAuthorizedEvalRun({
      environment: { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      artifact,
      suppliedDigest: artifact.digest,
      actualBindings: baseBindings,
      initialize: async () => {
        journalInitializations += 1;
      },
      execute: async () => fetchImpl("https://relay.example/v1/chat/completions"),
    }),
    /TLS certificate verification is disabled/u,
  );
  assert.equal(journalInitializations, 0);
  assert.equal(fetchCalls, 0);
});

test("repeat parsing accepts only a bounded canonical safe integer", () => {
  assert.equal(parseEvalRepeat(undefined), 1);
  assert.equal(parseEvalRepeat("1"), 1);
  assert.equal(parseEvalRepeat(String(MAX_EVAL_REPEAT)), MAX_EVAL_REPEAT);
  for (const invalid of ["0", "-1", "1.5", "01", "NaN", "Infinity", " 2 ", "9007199254740993", String(MAX_EVAL_REPEAT + 1)]) {
    assert.throws(() => parseEvalRepeat(invalid), /whole number/u);
  }
});

test("TLS policy accepts the default and rejects only the explicit insecure override", () => {
  assert.doesNotThrow(() => assertSecureEvalTls({}));
  assert.doesNotThrow(() => assertSecureEvalTls({ NODE_TLS_REJECT_UNAUTHORIZED: "1" }));
  assert.throws(
    () => assertSecureEvalTls({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
    /TLS certificate verification is disabled/u,
  );
});

test("the digest is byte-stable and candidate drift is named", () => {
  const first = evalPlanDigest(buildEvalPlan(baseBindings));
  const second = evalPlanDigest(buildEvalPlan(baseBindings));
  assert.equal(first, second);
  const result = verifyEvalPlan(buildEvalPlan(baseBindings), {
    ...baseBindings,
    candidateDeclarationDigest: candidateDeclarationDigest([
      { ...CANDIDATE, model: "DeepSeek-V3" },
    ], AUTHORITY.credentialBindingSalt),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches, ["candidateDeclarationDigest"]);
});

test("one private authority is unique and credential changes invalidate the plan", () => {
  const first = createEvalAuthority();
  const second = createEvalAuthority();
  assert.match(first.authorizationId, /^[a-f0-9]{32}$/u);
  assert.match(first.credentialBindingSalt, /^[A-Za-z0-9_-]{43}$/u);
  assert.notDeepEqual(first, second);

  const original = candidateDeclarationDigest([CANDIDATE], AUTHORITY.credentialBindingSalt);
  const rotated = candidateDeclarationDigest(
    [{ ...CANDIDATE, apiKey: "private-key-two" }],
    AUTHORITY.credentialBindingSalt,
  );
  assert.notEqual(original, rotated);
  assert.throws(
    () => createEvalPlanArtifact(baseBindings, "not-a-private-binding-salt"),
    /credential binding is invalid/u,
  );
});
