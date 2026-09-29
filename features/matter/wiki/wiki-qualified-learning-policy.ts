import type {
  WIKI_ALIAS_PRODUCER_PRECEDENCE,
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_OCCURRENCE_OUTCOME_POLICY,
  WIKI_TERM_PRODUCER_PRECEDENCE,
  WIKI_TERM_PRODUCER_WEIGHTS,
  WIKI_TERM_SCORE_POLICY,
} from "./wiki-learning-policy";

export type WikiQualifiedLearningPolicyRelease = Readonly<{
  qualificationVersion: 2;
  policyVersion: 4;
  scoringVersion: 4;
  policyConstants: Readonly<{
    unitsPerObservation: number;
    maximumUnits: number;
    maximumQuietTurns: number;
    aliasScorePolicy: typeof WIKI_ALIAS_SCORE_POLICY;
    termScorePolicy: typeof WIKI_TERM_SCORE_POLICY;
    aliasProducerWeights: typeof WIKI_ALIAS_PRODUCER_WEIGHTS;
    termProducerWeights: typeof WIKI_TERM_PRODUCER_WEIGHTS;
    producerPrecedenceVersion: number;
    aliasProducerPrecedence: typeof WIKI_ALIAS_PRODUCER_PRECEDENCE;
    termProducerPrecedence: typeof WIKI_TERM_PRODUCER_PRECEDENCE;
    occurrenceOutcomePolicy: typeof WIKI_OCCURRENCE_OUTCOME_POLICY;
  }>;
  policySourceDigest: string;
  corpus: Readonly<{
    corpusVersion: string;
    corpusDigest: string;
    scenarioCount: number;
  }>;
  resultDigest: string;
  producerQualificationDigest: string;
}>;

/** Compact receipt from the replayed policy corpus. Runtime does not consume
 * its labelled scenarios, source files, or intermediate evidence. */
export const MATTER_WIKI_QUALIFIED_LEARNING_POLICY = Object.freeze({
  qualificationVersion: 2,
  policyVersion: 4,
  scoringVersion: 4,
  policyConstants: Object.freeze({
    unitsPerObservation: 4,
    maximumUnits: 1_020,
    maximumQuietTurns: 31,
    aliasScorePolicy: Object.freeze({
      activationScore: 32,
      retentionScore: 20,
      activationMargin: 16,
      retentionMargin: 12,
    }),
    termScorePolicy: Object.freeze({
      collectionSupport: 8,
      retentionSupport: 4,
    }),
    aliasProducerWeights: Object.freeze({
      "legacy-v1": 0,
      "latin-internal-edit-v2": 2,
      "en-metaphone-v1": 2,
      "en-exact-homophone-v1": 3,
      "zh-exact-homophone-v1": 3,
      "zh-final-pair-v1": 2,
    }),
    termProducerWeights: Object.freeze({
      "shape-specific-v1": 2,
      "locale-segment-v1": 1,
    }),
    producerPrecedenceVersion: 1,
    aliasProducerPrecedence: Object.freeze({
      "en-exact-homophone-v1": Object.freeze({ rank: 1, claimsCollectionSource: false }),
      "zh-exact-homophone-v1": Object.freeze({ rank: 2, claimsCollectionSource: false }),
      "latin-internal-edit-v2": Object.freeze({ rank: 3, claimsCollectionSource: true }),
      "zh-final-pair-v1": Object.freeze({ rank: 4, claimsCollectionSource: false }),
      "en-metaphone-v1": Object.freeze({ rank: 5, claimsCollectionSource: false }),
      "legacy-v1": Object.freeze({ rank: 6, claimsCollectionSource: false }),
    }),
    termProducerPrecedence: Object.freeze({
      "shape-specific-v1": 1,
      "locale-segment-v1": 2,
      "legacy-term-v1": 3,
    }),
    occurrenceOutcomePolicy: Object.freeze({
      implicitAcceptanceUnits: 4,
      inspectedKeepUnits: 8,
      maximumKeptUnits: 24,
      keptHalfLifeTurns: 32,
      revertStrikeMemoryTurns: 128,
      countGeneratedImplicitAcceptance: true,
      furtherHumanAdmissionsToSettle: 2,
      foregroundDwellMillisecondsToSettle: 60_000,
    }),
  }),
  policySourceDigest: "sha256:2771f14d08c11bf4f531cdd17da9e1c74788a71004bb60a1f8c22f04538b24b2",
  corpus: Object.freeze({
    corpusVersion: "wiki-learning-policy-v4-corpus/1",
    corpusDigest: "sha256:44e73d0c9703d0080755b69389a4dcf009edc2575a6252e21606225b6eb53681",
    scenarioCount: 17,
  }),
  resultDigest: "sha256:99f1f2cdddbe358844e1251298a4145dfef8dca950048d056d2e7d7cad3f2af7",
  producerQualificationDigest: "sha256:c84ef0780c77eda26404b943b99fe0eb7b1d5f9a05ad7278afe71c2a4438fff3",
}) satisfies WikiQualifiedLearningPolicyRelease;
