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
    "2.0.0",
    "sha256:560a2c801c955aeb198be7008234937edf8ad70a67ccc92db49de9c1a28bbf95",
    "ascii-latin",
    "1.0.0",
    "sha256:64ab8d4ad926cba5ba19adc8fc85c0f17bc62d0c12d0e85b332aaa6d2c075ef6",
    "latin-internal-edit-corpus/1",
    "sha256:f39c3a26c367529435661be3d59cacbd1c274c1e6e43a3f8b44aba0d122d71fa",
  ),
  release(
    "locale-segment-v1",
    "1.0.0",
    "sha256:98e92e7d7405d9fb1d525e065e2f1eefd785c5f7a3c81893740a103c1edd3338",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "locale-segment-v1-corpus/1",
    "sha256:bd579c419fdf2ae0dac29cac241c8697e2b72e593b54e7c2c35dc85bdcfb6e58",
  ),
  release(
    "shape-specific-v1",
    "1.0.0",
    "sha256:98e92e7d7405d9fb1d525e065e2f1eefd785c5f7a3c81893740a103c1edd3338",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "shape-specific-v1-corpus/1",
    "sha256:9078407fedc06de5e4712ba5ba7390d6bba0a80c14c6aec53002fef95f760993",
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
