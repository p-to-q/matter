import { describe, expect, it } from "vitest";
import {
  MAX_WIKI_LEARNING_CANDIDATES,
  MAX_WIKI_LEARNING_COUNT,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_LEARNING_POLICY_VERSION,
  WIKI_TERM_SCORE_POLICY,
  advanceWikiAliasQuietTurn,
  advanceWikiTermQuietTurn,
  ageWikiAliasCandidate,
  ageWikiTermEvidence,
  compareWikiLearningCorpusEvaluations,
  decideWikiSoftCandidateAdmission,
  evaluateWikiLearningCorpus,
  evaluateWikiLearningInteractions,
  isWikiAliasCandidateEvictable,
  isWikiTermCandidateEvictable,
  observeWikiAliasCandidate,
  reconcileWikiTermEvidence,
  replayWikiAliasLearning,
  replayWikiTermLearning,
  resolveWikiAliasCompetition,
  scoreWikiAliasCandidate,
  scoreWikiTermEvidence,
  type WikiAliasCandidate,
  type WikiAliasEvidenceProducer,
  type WikiAliasReleaseQualification,
  type WikiLearningCorpusCase,
  type WikiLearningInteractionCase,
  type WikiTermEvidence,
} from "./wiki-learning-policy";

describe("Wiki learning policy", () => {
  it("collects a canonical after two independent human admissions", () => {
    const replay = replayWikiTermLearning([], [
      {
        environment: "human-admission",
        observedCanonicalIds: ["Engelbart", "Engelbart"],
      },
      {
        environment: "generated-output",
        observedCanonicalIds: ["Engelbart"],
      },
      {
        environment: "human-admission",
        observedCanonicalIds: ["Engelbart"],
      },
    ]);

    expect(replay.policyVersion).toBe(WIKI_LEARNING_POLICY_VERSION);
    expect(replay.receipts).toEqual([
      {
        environment: "human-admission",
        admittedObservationCount: 1,
        ignoredObservationCount: 1,
        collectedCanonicalIds: [],
      },
      {
        environment: "generated-output",
        admittedObservationCount: 0,
        ignoredObservationCount: 1,
        collectedCanonicalIds: [],
      },
      {
        environment: "human-admission",
        admittedObservationCount: 1,
        ignoredObservationCount: 0,
        collectedCanonicalIds: ["Engelbart"],
      },
    ]);
    expect(replay.candidates).toEqual([{
      canonicalId: "Engelbart",
      phase: "collected",
      support: WIKI_TERM_SCORE_POLICY.collectionSupport,
      quietTurns: 0,
    }]);
  });

  it("ages each unobserved term independently after 32 human turns", () => {
    expect(advanceWikiTermQuietTurn(term("collected", 2, 30))).toEqual({
      phase: "collected",
      support: 2,
      quietTurns: 31,
    });
    const aged = reconcileWikiTermEvidence(
      advanceWikiTermQuietTurn(term("collected", 2, 31)),
    );
    expect(aged).toEqual({ phase: "collected", support: 1, quietTurns: 0 });

    const dead = reconcileWikiTermEvidence(
      advanceWikiTermQuietTurn(term("collected", 1, 31)),
    );
    expect(dead).toEqual({ phase: "candidate", support: 0, quietTurns: 0 });
    expect(isWikiTermCandidateEvictable(dead, false)).toBe(true);
    expect(isWikiTermCandidateEvictable(dead, true)).toBe(false);
  });

  it("lets an observed term at quiet turn 31 rise immediately without decay", () => {
    const replay = replayWikiTermLearning(
      [{
        canonicalId: "Matter",
        phase: "candidate",
        support: 1,
        quietTurns: 31,
      }],
      [{ environment: "human-admission", observedCanonicalIds: ["Matter"] }],
    );
    expect(replay.candidates).toEqual([{
      canonicalId: "Matter",
      phase: "collected",
      support: 2,
      quietTurns: 0,
    }]);
  });

  it("does not advance term quiet time in generated or protected material", () => {
    const replay = replayWikiTermLearning(
      [{ canonicalId: "Matter", phase: "collected", support: 2, quietTurns: 31 }],
      [
        { environment: "generated-output", observedCanonicalIds: [] },
        { environment: "protected-text", observedCanonicalIds: [] },
      ],
    );
    expect(replay.candidates).toEqual([
      { canonicalId: "Matter", phase: "collected", support: 2, quietTurns: 31 },
    ]);
  });

  it("normalizes term phases before zero-step and non-human replay", () => {
    const replay = replayWikiTermLearning([
      { canonicalId: "dead", phase: "collected", support: 0, quietTurns: 0 },
      { canonicalId: "ready", phase: "candidate", support: 2, quietTurns: 0 },
    ], [{ environment: "generated-output", observedCanonicalIds: [] }]);

    expect(replay.candidates).toEqual([
      { canonicalId: "dead", phase: "candidate", support: 0, quietTurns: 0 },
      { canonicalId: "ready", phase: "collected", support: 2, quietTurns: 0 },
    ]);
  });

  it("uses bounded producer-specific integer evidence", () => {
    expect(WIKI_ALIAS_SCORE_POLICY).toEqual({
      activationScore: 8,
      retentionScore: 5,
      activationMargin: 4,
      retentionMargin: 3,
    });
    expect(scoreWikiTermEvidence(term("candidate", 2))).toBe(2);
    expect(scoreWikiAliasCandidate(alias("exact", "en-exact-homophone-v1", 3)))
      .toBe(9);
    expect(scoreWikiAliasCandidate(alias("near", "zh-final-pair-v1", 4)))
      .toBe(8);
    expect(scoreWikiAliasCandidate(alias("legacy", "legacy-v1", 255))).toBe(0);

    const saturated = observeWikiAliasCandidate(alias(
      "exact",
      "en-exact-homophone-v1",
      MAX_WIKI_LEARNING_COUNT,
      "candidate",
      31,
    ));
    expect(saturated).toMatchObject({
      support: MAX_WIKI_LEARNING_COUNT,
      quietTurns: 0,
    });
  });

  it("activates exact evidence on the third independent vote", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("exact", "en-exact-homophone-v1", 2),
    ], qualified("en-exact-homophone-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("exact", "en-exact-homophone-v1", 3),
    ], qualified("en-exact-homophone-v1")))).toEqual(["exact"]);
  });

  it("activates restricted near evidence on the fourth independent vote", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("near", "zh-final-pair-v1", 3),
    ], qualified("zh-final-pair-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("near", "zh-final-pair-v1", 4),
    ], qualified("zh-final-pair-v1")))).toEqual(["near"]);
  });

  it("lets exact and near observations at quiet turn 31 activate without decay", () => {
    const exact = replayWikiAliasLearning(
      [alias("exact", "en-exact-homophone-v1", 2, "candidate", 31)],
      [{ environment: "human-admission", observedCandidateIds: ["exact"] }],
      qualified("en-exact-homophone-v1"),
    );
    expect(exact.candidates).toEqual([
      alias("exact", "en-exact-homophone-v1", 3, "active", 0),
    ]);

    const near = replayWikiAliasLearning(
      [alias("near", "zh-final-pair-v1", 3, "candidate", 31)],
      [{ environment: "human-admission", observedCandidateIds: ["near"] }],
      qualified("zh-final-pair-v1"),
    );
    expect(near.candidates).toEqual([
      alias("near", "zh-final-pair-v1", 4, "active", 0),
    ]);
  });

  it("treats competitors as immediate counter-evidence", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "en-exact-homophone-v1", 3),
      alias("runner-up", "en-exact-homophone-v1", 2),
    ], qualified("en-exact-homophone-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "en-exact-homophone-v1", 3),
      alias("runner-up", "en-exact-homophone-v1", 1),
    ], qualified("en-exact-homophone-v1")))).toEqual(["leader"]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "zh-final-pair-v1", 4),
      alias("runner-up", "zh-final-pair-v1", 3),
    ], qualified("zh-final-pair-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "zh-final-pair-v1", 4),
      alias("runner-up", "zh-final-pair-v1", 2),
    ], qualified("zh-final-pair-v1")))).toEqual(["leader"]);
  });

  it("ages each unobserved alias independently after 32 human turns", () => {
    expect(advanceWikiAliasQuietTurn(
      alias("exact", "en-exact-homophone-v1", 3, "active", 30),
    )).toEqual(alias("exact", "en-exact-homophone-v1", 3, "active", 31));
    expect(advanceWikiAliasQuietTurn(
      alias("exact", "en-exact-homophone-v1", 3, "active", 31),
    )).toEqual(alias("exact", "en-exact-homophone-v1", 1, "active", 0));

    const replay = replayWikiAliasLearning(
      [
        alias("observed", "en-exact-homophone-v1", 2, "candidate", 31),
        alias("quiet", "en-exact-homophone-v1", 2, "candidate", 31),
      ],
      [{ environment: "human-admission", observedCandidateIds: ["observed"] }],
      qualified("en-exact-homophone-v1"),
    );
    expect(replay.candidates).toEqual([
      alias("observed", "en-exact-homophone-v1", 3, "active", 0),
      alias("quiet", "en-exact-homophone-v1", 1, "candidate", 0),
    ]);
  });

  it("resolves release qualification before a zero-step replay is returned", () => {
    const replay = replayWikiAliasLearning(
      [alias(
        "unqualified",
        "en-exact-homophone-v1",
        MAX_WIKI_LEARNING_COUNT,
        "active",
      )],
      [],
      qualified(),
    );
    expect(activeIds(replay.candidates)).toEqual([]);
    expect(Object.isFrozen(replay.candidates[0])).toBe(true);
  });

  it("fails closed on multiple active initial candidates", () => {
    const resolved = resolveWikiAliasCompetition([
      alias("first", "en-exact-homophone-v1", 10, "active"),
      alias("second", "en-exact-homophone-v1", 1, "active"),
    ], qualified("en-exact-homophone-v1"));
    expect(activeIds(resolved)).toEqual([]);

    const replay = replayWikiAliasLearning([
      alias("first", "en-exact-homophone-v1", 10, "active"),
      alias("second", "en-exact-homophone-v1", 1, "active"),
    ], [], qualified("en-exact-homophone-v1"));
    expect(activeIds(replay.candidates)).toEqual([]);
  });

  it("freezes producer identity and clones every resolved candidate", () => {
    const source = alias("stable", "en-exact-homophone-v1", 3);
    const resolved = resolveWikiAliasCompetition(
      [source],
      qualified("en-exact-homophone-v1"),
    );
    expect(resolved[0]).not.toBe(source);
    expect(Object.isFrozen(resolved[0])).toBe(true);

    const changedProducer = resolveWikiAliasCompetition([
      alias("stable", "en-exact-homophone-v1", 20, "active"),
      alias("stable", "zh-exact-homophone-v1", 20),
    ], qualified("en-exact-homophone-v1", "zh-exact-homophone-v1"));
    expect(activeIds(changedProducer)).toEqual([]);

    const replay = replayWikiAliasLearning(changedProducer, [{
      environment: "human-admission",
      observedCandidateIds: ["stable"],
    }], qualified("en-exact-homophone-v1", "zh-exact-homophone-v1"));
    expect(replay.receipts[0]).toMatchObject({
      admittedObservationCount: 0,
      ignoredObservationCount: 1,
      activeCandidateId: null,
    });
    expect(replay.candidates.map((candidate) => candidate.quietTurns))
      .toEqual([1, 1]);
  });

  it("bounds capacity and makes zero-support candidates evictable", () => {
    expect(decideWikiSoftCandidateAdmission(false, 4, 5)).toBe("insert");
    expect(decideWikiSoftCandidateAdmission(true, 5, 5)).toBe("update");
    expect(decideWikiSoftCandidateAdmission(false, 5, 5)).toBe("drop");
    expect(decideWikiSoftCandidateAdmission(true, 6, 5)).toBe("drop");
    expect(() => decideWikiSoftCandidateAdmission(
      false,
      0,
      MAX_WIKI_LEARNING_CANDIDATES + 1,
    )).toThrow(RangeError);

    const agedAlias = ageWikiAliasCandidate(alias(
      "near",
      "zh-final-pair-v1",
      1,
    ));
    expect(isWikiAliasCandidateEvictable(agedAlias)).toBe(true);
    expect(ageWikiTermEvidence(term("candidate", 1))).toEqual(
      term("candidate", 0),
    );
  });

  it("does not add or age alias evidence in protected and generated material", () => {
    const replay = replayWikiAliasLearning(
      [alias("expected", "en-exact-homophone-v1", 2, "candidate", 31)],
      [
        { environment: "generated-output", observedCandidateIds: ["expected"] },
        { environment: "protected-text", observedCandidateIds: ["expected"] },
        { environment: "human-admission", observedCandidateIds: ["expected"] },
      ],
      qualified("en-exact-homophone-v1"),
    );

    expect(replay.receipts).toEqual([
      {
        environment: "generated-output",
        admittedObservationCount: 0,
        ignoredObservationCount: 1,
        activeCandidateId: null,
      },
      {
        environment: "protected-text",
        admittedObservationCount: 0,
        ignoredObservationCount: 1,
        activeCandidateId: null,
      },
      {
        environment: "human-admission",
        admittedObservationCount: 1,
        ignoredObservationCount: 0,
        activeCandidateId: "expected",
      },
    ]);
    expect(replay.candidates).toEqual([
      alias("expected", "en-exact-homophone-v1", 3, "active", 0),
    ]);
  });

  it("rejects out-of-range quiet turns", () => {
    expect(() => scoreWikiTermEvidence(term("candidate", 1, 32)))
      .toThrow(RangeError);
    expect(() => scoreWikiAliasCandidate(
      alias("bad", "en-exact-homophone-v1", 1, "candidate", -1),
    )).toThrow(RangeError);
  });

  it("evaluates replay outcomes with safety ahead of recall and latency", () => {
    let candidate = alias("expected", "en-exact-homophone-v1", 0);
    const cases: WikiLearningCorpusCase[] = [];
    let previousPhase = candidate.phase;
    for (let turn = 1; turn <= 3; turn += 1) {
      candidate = observeWikiAliasCandidate(candidate);
      candidate = resolveWikiAliasCompetition(
        [candidate],
        qualified("en-exact-homophone-v1"),
      )[0];
      const transitions = candidate.phase === previousPhase ? 0 : 1;
      previousPhase = candidate.phase;
      cases.push({
        caseId: `activation-${turn}`,
        expectedActionId: "expected",
        appliedActionId: candidate.phase === "active" ? candidate.candidateId : null,
        activationLatencyTurns: candidate.phase === "active" ? turn : 0,
        phaseTransitions: transitions,
      });
    }

    const calibrated = evaluateWikiLearningCorpus("activation-corpus-v1", cases);
    expect(calibrated).toMatchObject({
      caseCount: 3,
      correctApplications: 1,
      falseApplications: 0,
      missedApplications: 2,
      activationLatencyTurns: 3,
      phaseTransitions: 1,
      score: [0, 0, -2, 1, -3, 0, -1],
    });

    const reckless = evaluateWikiLearningCorpus("activation-corpus-v1", [
      ...cases,
      {
        caseId: "negative-1",
        expectedActionId: null,
        appliedActionId: "wrong",
        protectedOrGenerated: true,
      },
    ]);
    expect(() => compareWikiLearningCorpusEvaluations(calibrated, reckless))
      .toThrow(TypeError);

    const safer = evaluateWikiLearningCorpus("activation-corpus-v1", cases.map((item) => ({
      ...item,
      appliedActionId: item.expectedActionId,
    })));
    expect(compareWikiLearningCorpusEvaluations(safer, calibrated)).toBe(1);

    const relabelled = evaluateWikiLearningCorpus("activation-corpus-v1", cases.map(
      (item, index) => index === 0
        ? { ...item, expectedActionId: "different-expected-action" }
        : item,
    ));
    expect(() => compareWikiLearningCorpusEvaluations(calibrated, relabelled))
      .toThrow(TypeError);
  });

  it("counts a protected matching action as unsafe and never correct", () => {
    const evaluation = evaluateWikiLearningCorpus("protected-corpus-v1", [{
      caseId: "protected-1",
      expectedActionId: "same",
      appliedActionId: "same",
      protectedOrGenerated: true,
      demotionLatencyTurns: 2,
    }]);

    expect(evaluation).toMatchObject({
      correctApplications: 0,
      falseApplications: 1,
      protectedOrGeneratedApplications: 1,
      demotionLatencyTurns: 2,
      score: [-1, -1, 0, 0, 0, -2, 0],
    });
  });

  it("bounds every evaluation metric before accumulation", () => {
    expect(() => evaluateWikiLearningCorpus("bounded-corpus-v1", [{
      caseId: "bounded-1",
      expectedActionId: null,
      appliedActionId: null,
      activationLatencyTurns: 4_097,
    }])).toThrow(RangeError);
  });

  it("settles each occurrence once and reports denominated interaction outcomes", () => {
    const evaluation = evaluateWikiLearningInteractions([
      {
        occurrenceId: "explicit-accept",
        environment: "human-material",
        expectedDisposition: "accepted",
        terminalOutcome: "explicit-confirm",
        attribution: "exact-occurrence",
        decisionLatencyTurns: 2,
      },
      {
        occurrenceId: "explicit-reject",
        environment: "generated-output",
        expectedDisposition: "rejected",
        terminalOutcome: "explicit-replace",
        attribution: "exact-occurrence",
        decisionLatencyTurns: 1,
      },
      interaction("survived", "accepted", "survived-horizon"),
      interaction("censored", "unknown", "censored"),
    ]);

    expect(evaluation).toEqual({
      outcomeCount: 4,
      explicitAcceptances: 1,
      explicitRejections: 1,
      survivedHorizons: 1,
      censoredOutcomes: 1,
      eligibleCensoredOutcomes: 1,
      unsafeOutcomes: 0,
      unattributedOutcomes: 0,
      generatedExcludedOutcomes: 0,
      implicitExposureCount: 2,
      falseImplicitPositives: 0,
      incorrectExplicitDecisions: 0,
      decisionLatencyTurns: 3,
      explicitRejectRate: { numerator: 1, denominator: 2 },
      censorRate: { numerator: 1, denominator: 2 },
    });
  });

  it("separates unsafe attribution, generated exclusion, and false implicit approval", () => {
    const evaluation = evaluateWikiLearningInteractions([
      {
        ...interaction("unattributed", "rejected", "survived-horizon"),
        attribution: "unattributed",
      },
      {
        ...interaction("protected", "unknown", "survived-horizon"),
        environment: "protected-text",
      },
      {
        ...interaction("generated", "accepted", "survived-horizon"),
        environment: "generated-output",
      },
      interaction("false-positive", "rejected", "survived-horizon"),
      {
        ...interaction("generated-censor", "unknown", "censored"),
        environment: "generated-output",
      },
      {
        ...interaction("unattributed-censor", "unknown", "censored"),
        attribution: "unattributed",
      },
    ]);

    expect(evaluation).toMatchObject({
      unsafeOutcomes: 2,
      unattributedOutcomes: 2,
      generatedExcludedOutcomes: 2,
      falseImplicitPositives: 1,
      survivedHorizons: 1,
      censoredOutcomes: 2,
      eligibleCensoredOutcomes: 0,
      implicitExposureCount: 1,
      censorRate: { numerator: 0, denominator: 1 },
    });
  });

  it("rejects duplicate occurrence settlement and latency on implicit outcomes", () => {
    expect(() => evaluateWikiLearningInteractions([{
      ...interaction("implicit-latency", "accepted", "survived-horizon"),
      decisionLatencyTurns: 1,
    }])).toThrow(TypeError);
    const duplicated = interaction("same", "unknown", "censored");
    expect(() => evaluateWikiLearningInteractions([duplicated, duplicated]))
      .toThrow(TypeError);
  });
});

function interaction(
  occurrenceId: string,
  expectedDisposition: WikiLearningInteractionCase["expectedDisposition"],
  terminalOutcome: WikiLearningInteractionCase["terminalOutcome"],
): WikiLearningInteractionCase {
  return {
    occurrenceId,
    environment: "human-material",
    expectedDisposition,
    terminalOutcome,
    attribution: "exact-occurrence",
  };
}

function term(
  phase: WikiTermEvidence["phase"],
  support: number,
  quietTurns = 0,
): WikiTermEvidence {
  return { phase, support, quietTurns };
}

function alias(
  candidateId: string,
  producer: WikiAliasCandidate["producer"],
  support: number,
  phase: WikiAliasCandidate["phase"] = "candidate",
  quietTurns = 0,
): WikiAliasCandidate {
  return { candidateId, producer, support, phase, quietTurns };
}

function activeIds(candidates: readonly WikiAliasCandidate[]): readonly string[] {
  return candidates
    .filter((candidate) => candidate.phase === "active")
    .map((candidate) => candidate.candidateId);
}

function qualified(
  ...producers: WikiAliasEvidenceProducer[]
): WikiAliasReleaseQualification {
  return new Set(producers);
}
