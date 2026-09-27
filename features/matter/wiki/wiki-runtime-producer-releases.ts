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
    "sha256:00432d582420e0e6280dd8298ec11a2b58348a7e1bdcfe8511f47f9d688dfc6e",
    "ascii-latin",
    "1.0.0",
    "sha256:64ab8d4ad926cba5ba19adc8fc85c0f17bc62d0c12d0e85b332aaa6d2c075ef6",
    "latin-internal-edit-corpus/1",
    "sha256:f39c3a26c367529435661be3d59cacbd1c274c1e6e43a3f8b44aba0d122d71fa",
  ),
  release(
    "locale-segment-v1",
    "1.0.0",
    "sha256:ce8838b5630b30cd02c49cd29b820c22337cafe1bfbffbad8975e6e425c9d754",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "locale-segment-v1-corpus/1",
    "sha256:bd579c419fdf2ae0dac29cac241c8697e2b72e593b54e7c2c35dc85bdcfb6e58",
  ),
  release(
    "shape-specific-v1",
    "1.0.0",
    "sha256:ce8838b5630b30cd02c49cd29b820c22337cafe1bfbffbad8975e6e425c9d754",
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
