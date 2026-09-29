import type { WikiQualifiedProducerRelease } from "./wiki-producer-qualification";
import {
  isWikiAliasEvidenceProducer,
  isWikiTermEvidenceProducer,
  type WikiAliasEvidenceProducer,
  type WikiTermEvidenceProducer,
} from "./wiki-learning-policy";

/**
 * Product release authority is deliberately separate from the offline
 * qualification inventory. Browser code must never import the larger corpus
 * manifest merely to select this smaller allow-list.
 */
export const MATTER_WIKI_RUNTIME_PRODUCER_RELEASES = Object.freeze([
  release(
    "latin-internal-edit-v2",
    "2.1.0",
    "sha256:7608fea5365a5f444a4ea4a7e7bf5a4172d33eea8141a66e1a1fd3875e587c48",
    "ascii-latin",
    "1.1.0",
    "sha256:f1458bb8b68170075c98f299b1edcb889245239bdd4984a623bf91908b36969d",
    "latin-internal-edit-corpus/2",
    "sha256:885ec07b174eedd79449f58c4ab81e27b320937a7a33e83300b952cb76ce696e",
  ),
  release(
    "locale-segment-v1",
    "1.1.0",
    "sha256:73378c1c75022569891d94dec7c58b48c0f9bf69fbc49535ee955dd87b39e877",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "locale-segment-v1-corpus/2",
    "sha256:6ef96cb24c9057e680155f210f5bf7ac52d07f3d7e776ada4b11c1bbd9e9f5da",
  ),
  release(
    "shape-specific-v1",
    "1.1.0",
    "sha256:73378c1c75022569891d94dec7c58b48c0f9bf69fbc49535ee955dd87b39e877",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "shape-specific-v1-corpus/2",
    "sha256:130e5f7e0e413292c169391b02ccfe840806891641ec7776e5483a8e80000251",
  ),
]) satisfies readonly WikiQualifiedProducerRelease[];

export const MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS = Object.freeze(
  MATTER_WIKI_RUNTIME_PRODUCER_RELEASES.flatMap((release) =>
    isWikiAliasEvidenceProducer(release.identity.producerId)
      ? [release.identity.producerId]
      : []),
) satisfies readonly WikiAliasEvidenceProducer[];

export const MATTER_WIKI_RUNTIME_TERM_PRODUCERS = Object.freeze(
  MATTER_WIKI_RUNTIME_PRODUCER_RELEASES.flatMap((release) =>
    isWikiTermEvidenceProducer(release.identity.producerId)
      ? [release.identity.producerId]
      : []),
) satisfies readonly WikiTermEvidenceProducer[];

function release(
  producerId: WikiQualifiedProducerRelease["identity"]["producerId"],
  producerVersion: string,
  producerDigest: string,
  resourceId: string,
  resourceVersion: string,
  resourceDigest: string,
  corpusVersion: string,
  corpusDigest: string,
): WikiQualifiedProducerRelease {
  return Object.freeze({
    qualificationVersion: 2,
    identity: Object.freeze({
      producerId,
      producerVersion,
      producerDigest,
      resourceId,
      resourceVersion,
      resourceDigest,
    }),
    corpus: Object.freeze({ corpusVersion, corpusDigest }),
  });
}
