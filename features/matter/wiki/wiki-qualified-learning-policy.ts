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
  policyVersion: 5;
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
  policyVersion: 5,
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
  policySourceDigest: "sha256:0f6578bccb4aab2b01c209880ef449e110c0a4e457f26921c600fa438f1eda17",
  corpus: Object.freeze({
    corpusVersion: "wiki-learning-policy-v5-corpus/1",
    corpusDigest: "sha256:753bf1e2b05cb7efb7c4253ffa3b562e44b8b71e7d35e9250427a2326667ba68",
    scenarioCount: 21,
  }),
  resultDigest: "sha256:c92f297933a2fbb7a67f7b8477558e1096ade435e3fbd19a7fef91632817b127",
  producerQualificationDigest: "sha256:2bb99dfe637e615aba61e7a20c9023a4b330dc39eba2fb38a7c4a236df9692ca",
}) satisfies WikiQualifiedLearningPolicyRelease;
