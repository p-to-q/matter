import { describe, expect, it } from "vitest";
import {
  MAX_WIKI_KEPT_QUIET_TURNS,
  MAX_WIKI_LEARNING_CANDIDATES,
  MAX_WIKI_LEARNING_UNITS,
  MAX_WIKI_REVERT_STRIKE_QUIET_TURNS,
  WIKI_ALIAS_PRODUCER_PRECEDENCE,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_LEARNING_POLICY_VERSION,
  WIKI_OCCURRENCE_OUTCOME_POLICY,
  WIKI_TERM_SCORE_POLICY,
  advanceWikiAliasQuietTurn,
  advanceWikiKeptQuietTurn,
  advanceWikiRevertStrikeTurn,
  advanceWikiTermQuietTurn,
  ageWikiAliasCandidate,
  ageWikiTermEvidence,
  compareWikiAliasProducerPrecedence,
  compareWikiLearningCorpusEvaluations,
  compareWikiTermProducerPrecedence,
  decideWikiOccurrenceEffect,
  decideWikiSoftCandidateAdmission,
  evaluateWikiLearningCorpus,
  evaluateWikiLearningInteractions,
  hasWikiKeptSettlementSinceTurn,
  isWikiAliasCandidateEvictable,
  isWikiKeptEvidence,
  isWikiTermCandidateEvictable,
  observeWikiAliasCandidate,
  observeWikiTermEvidence,
  reconcileWikiTermEvidence,
  replayWikiAliasLearning,
  replayWikiTermLearning,
  resolveWikiAliasCompetition,
  scoreWikiAliasCandidate,
  scoreWikiAliasRetention,
  scoreWikiTermEvidence,
  settleWikiImplicitOccurrence,
  settleWikiKeptEvidence,
  wikiAliasProducerClaimsCollectionSource,
  type WikiAliasCandidate,
  type WikiAliasEvidenceProducer,
  type WikiAliasReleaseQualification,
  type WikiImplicitSettlementFacts,
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

  it("stores one observation as four quarter-units that fade across three half-lives", () => {
    let evidence = observeWikiTermEvidence(term("candidate", 0));
    expect(evidence).toEqual({ phase: "candidate", support: 4, quietTurns: 0 });
    const supports: number[] = [];
    for (let turn = 0; turn < 96; turn += 1) {
      evidence = advanceWikiTermQuietTurn(evidence);
      if (evidence.quietTurns === 0) supports.push(evidence.support);
    }
    expect(supports).toEqual([2, 1, 0]);
    expect(WIKI_TERM_SCORE_POLICY).toEqual({ collectionSupport: 8, retentionSupport: 4 });
  });

  it("ages each unobserved term independently after 32 human turns", () => {
    expect(advanceWikiTermQuietTurn(term("collected", 8, 30))).toEqual({
      phase: "collected",
      support: 8,
      quietTurns: 31,
    });
    const aged = reconcileWikiTermEvidence(
      advanceWikiTermQuietTurn(term("collected", 8, 31)),
    );
    expect(aged).toEqual({ phase: "collected", support: 4, quietTurns: 0 });

    const lapsed = reconcileWikiTermEvidence(
      advanceWikiTermQuietTurn(term("collected", 4, 31)),
    );
    expect(lapsed).toEqual({ phase: "candidate", support: 2, quietTurns: 0 });
    expect(isWikiTermCandidateEvictable(lapsed, false)).toBe(false);

    const dead = reconcileWikiTermEvidence(ageWikiTermEvidence(term("candidate", 1)));
    expect(dead).toEqual({ phase: "candidate", support: 0, quietTurns: 0 });
    expect(isWikiTermCandidateEvictable(dead, false)).toBe(true);
    expect(isWikiTermCandidateEvictable(dead, true)).toBe(false);
  });

  it("lets an observed term at quiet turn 31 rise immediately without decay", () => {
    const replay = replayWikiTermLearning(
      [{
        canonicalId: "Matter",
        phase: "candidate",
        support: 4,
        quietTurns: 31,
      }],
      [{ environment: "human-admission", observedCanonicalIds: ["Matter"] }],
    );
    expect(replay.candidates).toEqual([{
      canonicalId: "Matter",
      phase: "collected",
      support: 8,
      quietTurns: 0,
    }]);
  });

  it("lets a faded remnant still count toward recollection", () => {
    const replay = replayWikiTermLearning(
      [{ canonicalId: "Matter", phase: "candidate", support: 2, quietTurns: 5 }],
      [
        { environment: "human-admission", observedCanonicalIds: ["Matter"] },
        { environment: "human-admission", observedCanonicalIds: ["Matter"] },
      ],
    );
    expect(replay.receipts.map((receipt) => receipt.collectedCanonicalIds))
      .toEqual([[], ["Matter"]]);
    expect(replay.candidates).toEqual([
      { canonicalId: "Matter", phase: "collected", support: 10, quietTurns: 0 },
    ]);
  });

  it("does not advance term quiet time in generated or protected material", () => {
    const replay = replayWikiTermLearning(
      [{ canonicalId: "Matter", phase: "collected", support: 8, quietTurns: 31 }],
      [
        { environment: "generated-output", observedCanonicalIds: [] },
        { environment: "protected-text", observedCanonicalIds: [] },
      ],
    );
    expect(replay.candidates).toEqual([
      { canonicalId: "Matter", phase: "collected", support: 8, quietTurns: 31 },
    ]);
  });

  it("normalizes term phases before zero-step and non-human replay", () => {
    const replay = replayWikiTermLearning([
      { canonicalId: "dead", phase: "collected", support: 3, quietTurns: 0 },
      { canonicalId: "ready", phase: "candidate", support: 8, quietTurns: 0 },
    ], [{ environment: "generated-output", observedCanonicalIds: [] }]);

    expect(replay.candidates).toEqual([
      { canonicalId: "dead", phase: "candidate", support: 3, quietTurns: 0 },
      { canonicalId: "ready", phase: "collected", support: 8, quietTurns: 0 },
    ]);
  });

  it("uses bounded producer-specific integer evidence in quarter-units", () => {
    expect(WIKI_ALIAS_SCORE_POLICY).toEqual({
      activationScore: 32,
      retentionScore: 20,
      activationMargin: 16,
      retentionMargin: 12,
    });
    expect(scoreWikiTermEvidence(term("candidate", 4))).toBe(4);
    expect(scoreWikiAliasCandidate(alias("exact", "en-exact-homophone-v1", 12)))
      .toBe(36);
    expect(scoreWikiAliasCandidate(alias("near", "zh-final-pair-v1", 16)))
      .toBe(32);
    expect(scoreWikiAliasCandidate(alias("legacy", "legacy-v1", 1_020))).toBe(0);

    const saturated = observeWikiAliasCandidate(alias(
      "exact",
      "en-exact-homophone-v1",
      MAX_WIKI_LEARNING_UNITS,
      "candidate",
      31,
    ));
    expect(saturated).toMatchObject({
      support: MAX_WIKI_LEARNING_UNITS,
      quietTurns: 0,
    });
    expect(MAX_WIKI_LEARNING_UNITS).toBe(1_020);
  });

  it("activates exact evidence on the third independent vote", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("exact", "en-exact-homophone-v1", 8),
    ], qualified("en-exact-homophone-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("exact", "en-exact-homophone-v1", 12),
    ], qualified("en-exact-homophone-v1")))).toEqual(["exact"]);
  });

  it("activates restricted near evidence on the fourth independent vote", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("near", "zh-final-pair-v1", 12),
    ], qualified("zh-final-pair-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("near", "zh-final-pair-v1", 16),
    ], qualified("zh-final-pair-v1")))).toEqual(["near"]);
  });

  it("lets exact and near observations at quiet turn 31 activate without decay", () => {
    const exact = replayWikiAliasLearning(
      [alias("exact", "en-exact-homophone-v1", 8, "candidate", 31)],
      [{ environment: "human-admission", observedCandidateIds: ["exact"] }],
      qualified("en-exact-homophone-v1"),
    );
    expect(exact.candidates).toEqual([
      alias("exact", "en-exact-homophone-v1", 12, "active", 0),
    ]);

    const near = replayWikiAliasLearning(
      [alias("near", "zh-final-pair-v1", 12, "candidate", 31)],
      [{ environment: "human-admission", observedCandidateIds: ["near"] }],
      qualified("zh-final-pair-v1"),
    );
    expect(near.candidates).toEqual([
      alias("near", "zh-final-pair-v1", 16, "active", 0),
    ]);
  });

  it("treats competitors as immediate counter-evidence", () => {
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "en-exact-homophone-v1", 12),
      alias("runner-up", "en-exact-homophone-v1", 8),
    ], qualified("en-exact-homophone-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "en-exact-homophone-v1", 12),
      alias("runner-up", "en-exact-homophone-v1", 4),
    ], qualified("en-exact-homophone-v1")))).toEqual(["leader"]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "zh-final-pair-v1", 16),
      alias("runner-up", "zh-final-pair-v1", 12),
    ], qualified("zh-final-pair-v1")))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("leader", "zh-final-pair-v1", 16),
      alias("runner-up", "zh-final-pair-v1", 8),
    ], qualified("zh-final-pair-v1")))).toEqual(["leader"]);
  });

  it("ages each unobserved alias independently after 32 human turns", () => {
    expect(advanceWikiAliasQuietTurn(
      alias("exact", "en-exact-homophone-v1", 12, "active", 30),
    )).toEqual(alias("exact", "en-exact-homophone-v1", 12, "active", 31));
    expect(advanceWikiAliasQuietTurn(
      alias("exact", "en-exact-homophone-v1", 12, "active", 31),
    )).toEqual(alias("exact", "en-exact-homophone-v1", 6, "active", 0));

    const replay = replayWikiAliasLearning(
      [
        alias("observed", "en-exact-homophone-v1", 8, "candidate", 31),
        alias("quiet", "en-exact-homophone-v1", 8, "candidate", 31),
      ],
      [{ environment: "human-admission", observedCandidateIds: ["observed"] }],
      qualified("en-exact-homophone-v1"),
    );
    expect(replay.candidates).toEqual([
      alias("observed", "en-exact-homophone-v1", 12, "active", 0),
      alias("quiet", "en-exact-homophone-v1", 4, "candidate", 0),
    ]);
  });

  it("resolves release qualification before a zero-step replay is returned", () => {
    const replay = replayWikiAliasLearning(
      [alias(
        "unqualified",
        "en-exact-homophone-v1",
        MAX_WIKI_LEARNING_UNITS,
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
      alias("first", "en-exact-homophone-v1", 40, "active"),
      alias("second", "en-exact-homophone-v1", 4, "active"),
    ], qualified("en-exact-homophone-v1"));
    expect(activeIds(resolved)).toEqual([]);

    const replay = replayWikiAliasLearning([
      alias("first", "en-exact-homophone-v1", 40, "active"),
      alias("second", "en-exact-homophone-v1", 4, "active"),
    ], [], qualified("en-exact-homophone-v1"));
    expect(activeIds(replay.candidates)).toEqual([]);
  });

  it("freezes producer identity and clones every resolved candidate", () => {
    const source = alias("stable", "en-exact-homophone-v1", 12);
    const resolved = resolveWikiAliasCompetition(
      [source],
      qualified("en-exact-homophone-v1"),
    );
    expect(resolved[0]).not.toBe(source);
    expect(Object.isFrozen(resolved[0])).toBe(true);

    const changedProducer = resolveWikiAliasCompetition([
      alias("stable", "en-exact-homophone-v1", 80, "active"),
      alias("stable", "zh-exact-homophone-v1", 80),
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

  it("orders tied competitors by explicit precedence rather than names", () => {
    const tied = [
      alias("zzz", "en-metaphone-v1", 40),
      alias("aaa", "latin-internal-edit-v2", 40),
    ];
    const qualification = qualified("en-metaphone-v1", "latin-internal-edit-v2");
    expect(activeIds(resolveWikiAliasCompetition(tied, qualification))).toEqual([]);
    expect(compareWikiAliasProducerPrecedence("latin-internal-edit-v2", "en-metaphone-v1"))
      .toBeLessThan(0);
    expect(compareWikiAliasProducerPrecedence("en-exact-homophone-v1", "latin-internal-edit-v2"))
      .toBeLessThan(0);
    expect(compareWikiTermProducerPrecedence("shape-specific-v1", "locale-segment-v1"))
      .toBeLessThan(0);
    expect(new Set(Object.values(WIKI_ALIAS_PRODUCER_PRECEDENCE)
      .map((entry) => entry.rank)).size).toBe(6);
    expect((Object.keys(WIKI_ALIAS_PRODUCER_PRECEDENCE) as WikiAliasEvidenceProducer[])
      .filter(wikiAliasProducerClaimsCollectionSource)).toEqual(["latin-internal-edit-v2"]);
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
      [alias("expected", "en-exact-homophone-v1", 8, "candidate", 31)],
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
      alias("expected", "en-exact-homophone-v1", 12, "active", 0),
    ]);
  });

  it("rejects out-of-range quiet turns and kept evidence", () => {
    expect(() => scoreWikiTermEvidence(term("candidate", 1, 32)))
      .toThrow(RangeError);
    expect(() => scoreWikiAliasCandidate(
      alias("bad", "en-exact-homophone-v1", 1, "candidate", -1),
    )).toThrow(RangeError);
    expect(() => scoreWikiAliasCandidate({
      ...alias("bad", "en-exact-homophone-v1", 4),
      kept: 25,
    })).toThrow(RangeError);
    expect(isWikiKeptEvidence({ kept: 0, keptQuietTurns: 3 })).toBe(false);
    expect(isWikiKeptEvidence({ kept: 24, keptQuietTurns: 40 })).toBe(false);
    expect(isWikiKeptEvidence({ kept: 12, keptQuietTurns: 40 })).toBe(true);
    expect(isWikiKeptEvidence({ kept: 1, keptQuietTurns: MAX_WIKI_KEPT_QUIET_TURNS }))
      .toBe(true);
    expect(isWikiKeptEvidence({ kept: 1, keptQuietTurns: MAX_WIKI_KEPT_QUIET_TURNS + 1 }))
      .toBe(false);
  });

  it("settles kept evidence at most once per comparable turn and halves it every 32", () => {
    const empty = { kept: 0, keptQuietTurns: 0 };
    expect(hasWikiKeptSettlementSinceTurn(empty)).toBe(false);
    let kept = settleWikiKeptEvidence(empty, 4);
    expect(kept).toEqual({ kept: 4, keptQuietTurns: 0 });
    expect(hasWikiKeptSettlementSinceTurn(kept)).toBe(true);
    kept = advanceWikiKeptQuietTurn(kept);
    expect(hasWikiKeptSettlementSinceTurn(kept)).toBe(false);
    kept = settleWikiKeptEvidence(kept, 8);
    kept = settleWikiKeptEvidence(kept, 8);
    kept = settleWikiKeptEvidence(kept, 8);
    expect(kept).toEqual({
      kept: WIKI_OCCURRENCE_OUTCOME_POLICY.maximumKeptUnits,
      keptQuietTurns: 0,
    });
    const halvings: number[] = [];
    for (let turn = 1; turn <= MAX_WIKI_KEPT_QUIET_TURNS + 1; turn += 1) {
      const before = kept.kept;
      kept = advanceWikiKeptQuietTurn(kept);
      expect(isWikiKeptEvidence(kept)).toBe(true);
      // Aging never lands on the settled marker while kept evidence remains.
      expect(hasWikiKeptSettlementSinceTurn(kept)).toBe(false);
      if (kept.kept !== before) halvings.push(turn);
    }
    expect(halvings).toEqual([32, 64, 96, 128, 160]);
    expect(kept).toEqual(empty);
  });

  it("remembers one revert strike for 128 comparable turns", () => {
    let quietTurns: number | null = 0;
    let turns = 0;
    while (quietTurns !== null) {
      quietTurns = advanceWikiRevertStrikeTurn(quietTurns);
      turns += 1;
    }
    expect(turns).toBe(WIKI_OCCURRENCE_OUTCOME_POLICY.revertStrikeMemoryTurns);
    expect(() => advanceWikiRevertStrikeTurn(MAX_WIKI_REVERT_STRIKE_QUIET_TURNS + 1))
      .toThrow(RangeError);
  });

  it("lets informed acceptance retain and defend a rule but never activate one", () => {
    const qualification = qualified("zh-final-pair-v1");
    const decayed = { ...alias("near", "zh-final-pair-v1", 8, "active"), kept: 12 };
    expect(scoreWikiAliasRetention(decayed)).toBe(28);
    expect(activeIds(resolveWikiAliasCompetition([decayed], qualification)))
      .toEqual(["near"]);
    expect(activeIds(resolveWikiAliasCompetition([
      { ...decayed, kept: 0 },
    ], qualification))).toEqual([]);

    const inactive = { ...alias("near", "zh-final-pair-v1", 12), kept: 24 };
    expect(activeIds(resolveWikiAliasCompetition([inactive], qualification)))
      .toEqual([]);

    const incumbent = { ...alias("used", "zh-final-pair-v1", 16, "active"), kept: 24 };
    const challenger = alias("challenger", "zh-final-pair-v1", 12);
    expect(activeIds(resolveWikiAliasCompetition(
      [incumbent, challenger],
      qualification,
    ))).toEqual(["used"]);
    expect(activeIds(resolveWikiAliasCompetition(
      [{ ...incumbent, kept: 0 }, challenger],
      qualification,
    ))).toEqual([]);
  });

  it("ranks and measures activation on producer evidence alone", () => {
    const qualification = qualified("en-exact-homophone-v1", "en-metaphone-v1");
    // A: exact 3 x 12 = 36 clears the floor; B: metaphone 2 x 12 = 24.
    const exact = alias("A", "en-exact-homophone-v1", 12);
    const metaphone = alias("B", "en-metaphone-v1", 12);
    expect(activeIds(resolveWikiAliasCompetition([exact, metaphone], qualification)))
      .toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      { ...exact, kept: 24 },
      metaphone,
    ], qualification))).toEqual([]);

    // Kept evidence cannot pick a winner between two floor-clearing candidates.
    const exactOnly = qualified("en-exact-homophone-v1");
    expect(activeIds(resolveWikiAliasCompetition([
      { ...alias("A", "en-exact-homophone-v1", 12), kept: 24 },
      alias("B", "en-exact-homophone-v1", 16),
    ], exactOnly))).toEqual([]);
    expect(activeIds(resolveWikiAliasCompetition([
      alias("A", "en-exact-homophone-v1", 12),
      alias("B", "en-exact-homophone-v1", 28),
    ], exactOnly))).toEqual(["B"]);
  });

  it("never re-activates a demoted relation through settlements", () => {
    const qualification = qualified("en-metaphone-v1");
    const demoted = resolveWikiAliasCompetition([
      alias("used", "en-metaphone-v1", 16, "active"),
      alias("challenger", "en-metaphone-v1", 12),
    ], qualification);
    expect(activeIds(demoted)).toEqual([]);
    const settled = demoted.map((candidate) => candidate.candidateId === "used"
      ? { ...candidate, ...settleWikiKeptEvidence(candidate, 16) }
      : candidate);
    expect(activeIds(resolveWikiAliasCompetition(settled, qualification))).toEqual([]);
  });

  it("settles implicit acceptance only when the change was informed", () => {
    expect(settleWikiImplicitOccurrence(facts({}))).toBe("pending");
    expect(settleWikiImplicitOccurrence(facts({ furtherHumanAdmissions: 1 })))
      .toBe("pending");
    expect(settleWikiImplicitOccurrence(facts({ furtherHumanAdmissions: 2 })))
      .toBe("accepted-implicit");
    expect(settleWikiImplicitOccurrence(facts({ foregroundDwellMilliseconds: 59_999 })))
      .toBe("pending");
    expect(settleWikiImplicitOccurrence(facts({ foregroundDwellMilliseconds: 60_000 })))
      .toBe("accepted-implicit");
    expect(settleWikiImplicitOccurrence(facts({ copiedOrExported: true })))
      .toBe("accepted-implicit");
    expect(settleWikiImplicitOccurrence(facts({ pageExit: true })))
      .toBe("accepted-implicit");

    expect(settleWikiImplicitOccurrence(facts({
      perceived: false,
      furtherHumanAdmissions: 9,
      foregroundDwellMilliseconds: 600_000,
      copiedOrExported: true,
    }))).toBe("pending");
    expect(settleWikiImplicitOccurrence(facts({ perceived: false, pageExit: true })))
      .toBe("censored");
    expect(settleWikiImplicitOccurrence(facts({
      addressIntact: false,
      furtherHumanAdmissions: 2,
    }))).toBe("censored");
    expect(() => settleWikiImplicitOccurrence(facts({ furtherHumanAdmissions: -1 })))
      .toThrow(RangeError);
  });

  it("maps every outcome to one effect and keeps confirmed authority outside scoring", () => {
    expect(decideWikiOccurrenceEffect("accepted-implicit", "provisional", "human-admission"))
      .toEqual({ kind: "kept", units: 4, implicit: true });
    expect(decideWikiOccurrenceEffect("accepted-implicit", "provisional", "generated"))
      .toEqual({ kind: "kept", units: 4, implicit: true });
    expect(decideWikiOccurrenceEffect("inspected-kept", "provisional", "generated"))
      .toEqual({ kind: "kept", units: 8, implicit: false });
    expect(decideWikiOccurrenceEffect("reverted", "provisional", "human-admission"))
      .toEqual({ kind: "strike" });
    expect(decideWikiOccurrenceEffect("explicit-confirm", "provisional", "generated"))
      .toEqual({ kind: "confirm" });
    expect(decideWikiOccurrenceEffect("explicit-reject", "confirmed", "human-admission"))
      .toEqual({ kind: "reject" });
    expect(decideWikiOccurrenceEffect("explicit-replace", "confirmed", "generated"))
      .toEqual({ kind: "replace" });
    for (const outcome of ["accepted-implicit", "inspected-kept", "reverted"] as const) {
      expect(decideWikiOccurrenceEffect(outcome, "confirmed", "human-admission"))
        .toEqual({ kind: "neutral" });
    }
    expect(decideWikiOccurrenceEffect("censored", "provisional", "human-admission"))
      .toEqual({ kind: "neutral" });
    expect(() => decideWikiOccurrenceEffect(
      "survived-horizon" as never,
      "provisional",
      "human-admission",
    )).toThrow(TypeError);
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
      interaction("reverted", "rejected", "reverted"),
      interaction("inspected", "accepted", "inspected-kept"),
      interaction("accepted", "accepted", "accepted-implicit"),
      interaction("censored", "unknown", "censored"),
    ]);

    expect(evaluation).toEqual({
      outcomeCount: 6,
      explicitAcceptances: 1,
      inspectedAcceptances: 1,
      explicitRejections: 2,
      implicitAcceptances: 1,
      censoredOutcomes: 1,
      eligibleCensoredOutcomes: 1,
      unsafeOutcomes: 0,
      unattributedOutcomes: 0,
      generatedExcludedOutcomes: 0,
      implicitExposureCount: 2,
      falseImplicitPositives: 0,
      incorrectExplicitDecisions: 0,
      decisionLatencyTurns: 3,
      explicitRejectRate: { numerator: 2, denominator: 4 },
      censorRate: { numerator: 1, denominator: 2 },
    });
  });

  it("counts informed generated acceptance by policy and separates unsafe attribution", () => {
    const outcomes: WikiLearningInteractionCase[] = [
      {
        ...interaction("unattributed", "rejected", "accepted-implicit"),
        attribution: "unattributed",
      },
      {
        ...interaction("protected", "unknown", "accepted-implicit"),
        environment: "protected-text",
      },
      {
        ...interaction("generated", "accepted", "accepted-implicit"),
        environment: "generated-output",
      },
      interaction("false-positive", "rejected", "accepted-implicit"),
      {
        ...interaction("generated-censor", "unknown", "censored"),
        environment: "generated-output",
      },
      {
        ...interaction("unattributed-censor", "unknown", "censored"),
        attribution: "unattributed",
      },
    ];

    expect(evaluateWikiLearningInteractions(outcomes)).toMatchObject({
      unsafeOutcomes: 2,
      unattributedOutcomes: 2,
      generatedExcludedOutcomes: 0,
      falseImplicitPositives: 1,
      implicitAcceptances: 2,
      censoredOutcomes: 2,
      eligibleCensoredOutcomes: 1,
      implicitExposureCount: 3,
      censorRate: { numerator: 1, denominator: 3 },
    });
    expect(evaluateWikiLearningInteractions(outcomes, {
      countGeneratedImplicitAcceptance: false,
    })).toMatchObject({
      generatedExcludedOutcomes: 2,
      implicitAcceptances: 1,
      censoredOutcomes: 2,
      eligibleCensoredOutcomes: 0,
      implicitExposureCount: 1,
    });
  });

  it("rejects duplicate occurrence settlement and latency on implicit outcomes", () => {
    expect(() => evaluateWikiLearningInteractions([{
      ...interaction("implicit-latency", "accepted", "accepted-implicit"),
      decisionLatencyTurns: 1,
    }])).toThrow(TypeError);
    expect(() => evaluateWikiLearningInteractions([
      interaction("legacy", "accepted", "survived-horizon" as never),
    ])).toThrow(TypeError);
    const duplicated = interaction("same", "unknown", "censored");
    expect(() => evaluateWikiLearningInteractions([duplicated, duplicated]))
      .toThrow(TypeError);
  });
});

function facts(overrides: Partial<WikiImplicitSettlementFacts>): WikiImplicitSettlementFacts {
  return {
    perceived: true,
    addressIntact: true,
    furtherHumanAdmissions: 0,
    foregroundDwellMilliseconds: 0,
    copiedOrExported: false,
    pageExit: false,
    ...overrides,
  };
}

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
  return { candidateId, producer, support, phase, quietTurns, kept: 0, keptQuietTurns: 0 };
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
