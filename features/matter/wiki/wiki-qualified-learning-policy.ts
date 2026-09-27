import type {
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  WIKI_ALIAS_SCORE_POLICY,
  WIKI_TERM_PRODUCER_WEIGHTS,
  WIKI_TERM_SCORE_POLICY,
} from "./wiki-learning-policy";

export type WikiQualifiedLearningPolicyRelease = Readonly<{
  qualificationVersion: 1;
  policyVersion: 3;
  scoringVersion: 3;
  policyConstants: Readonly<{
    maximumQuietTurns: number;
    aliasScorePolicy: typeof WIKI_ALIAS_SCORE_POLICY;
    termScorePolicy: typeof WIKI_TERM_SCORE_POLICY;
    aliasProducerWeights: typeof WIKI_ALIAS_PRODUCER_WEIGHTS;
    termProducerWeights: typeof WIKI_TERM_PRODUCER_WEIGHTS;
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
  qualificationVersion: 1,
  policyVersion: 3,
  scoringVersion: 3,
  policyConstants: Object.freeze({
    maximumQuietTurns: 31,
    aliasScorePolicy: Object.freeze({
      activationScore: 8,
      retentionScore: 5,
      activationMargin: 4,
      retentionMargin: 3,
    }),
    termScorePolicy: Object.freeze({
      collectionSupport: 2,
      retentionSupport: 1,
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
  }),
  policySourceDigest: "sha256:0a6ac4068d09bcdea7966eabfa26961b27c939cfbf87934e76a7433b3d499cae",
  corpus: Object.freeze({
    corpusVersion: "wiki-learning-policy-v3-corpus/1",
    corpusDigest: "sha256:1966beb0b5336edbe83c81bc3c7955d870dc0325b35460edcdafac988e9e08ab",
    scenarioCount: 6,
  }),
  resultDigest: "sha256:7dc268d3382041b97044ed021bb5fa9a7d160636cb4cb9f736604419f49584c7",
  producerQualificationDigest:
    "sha256:149281dc7dde4c33cc9dda8366566a2876b6ae43e14e09c10a82bd3d45cf462a",
}) satisfies WikiQualifiedLearningPolicyRelease;
