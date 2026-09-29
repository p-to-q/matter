import { describe, expect, it } from "vitest";
import {
  readWikiLearningPolicyQualificationBytes,
  runWikiLearningPolicyQualification,
  WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST,
} from "../../../scripts/wiki/qualification/learning-policy-v4";
import { MATTER_WIKI_QUALIFIED_LEARNING_POLICY } from
  "./wiki-qualified-learning-policy";

describe("qualified Wiki learning policy", () => {
  it("replays the manifest-owned corpus into the committed release identity", async () => {
    const run = await runWikiLearningPolicyQualification();

    expect(run.mismatchedScenarioIds).toEqual([]);
    expect(run.qualified).toBe(true);
    expect(run.results.map((result) => result.scenarioId)).toEqual([
      "exact-three-turn-activation",
      "restricted-four-turn-activation",
      "competition-margin-abstention",
      "quiet-decay-retention",
      "quarter-unit-gradual-decay",
      "broad-term-two-turn-collection",
      "non-comparable-turns-do-not-age",
      "partial-scan-scores-only-what-it-saw",
      "informed-acceptance-retains-a-used-rule",
      "generated-implicit-acceptance-counts-by-policy",
      "two-strike-reversion",
      "revert-strike-memory-expires",
      "confirmed-authority-stays-outside-scoring",
      "non-human-zero-vote",
    ]);
    expect(run.release).toEqual(MATTER_WIKI_QUALIFIED_LEARNING_POLICY);
  }, 60_000);

  it("keeps the compact release separate from labelled scenarios", () => {
    expect(WIKI_LEARNING_POLICY_QUALIFICATION_MANIFEST.scenarios).toHaveLength(14);
    expect(MATTER_WIKI_QUALIFIED_LEARNING_POLICY).not.toHaveProperty("scenarios");
    expect(MATTER_WIKI_QUALIFIED_LEARNING_POLICY).not.toHaveProperty("results");
    expect(Object.isFrozen(MATTER_WIKI_QUALIFIED_LEARNING_POLICY)).toBe(true);
  });

  it("binds every runtime-value policy dependency into the source digest", async () => {
    const source = await readWikiLearningPolicyQualificationBytes();
    const text = new TextDecoder().decode(source);

    for (const file of [
      "wiki-learning-policy.ts",
      "wiki-evidence.ts",
      "wiki-model.ts",
      "wiki-invariants.ts",
      "wiki-script.ts",
      "wiki-producer-qualification.ts",
      "wiki-text-safety.ts",
      "config/locales.ts",
      "tree/unicode-text.ts",
    ]) expect(text).toContain(file);
  });
});
