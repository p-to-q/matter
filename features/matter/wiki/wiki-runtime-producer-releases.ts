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
    "sha256:e2adb8f57e042865fac81fbe52e545e1ce661c3259934c9b4d23c8d126db7020",
    "ascii-latin",
    "1.1.0",
    "sha256:f1458bb8b68170075c98f299b1edcb889245239bdd4984a623bf91908b36969d",
    "latin-internal-edit-corpus/2",
    "sha256:74f35bbfa6443a0a66ebf56d361abc73d0e8cd1be67a9378ccd32f3562e0ac63",
  ),
  release(
    "locale-segment-v1",
    "1.1.0",
    "sha256:43b30e34557f271b83afcc184e82414b37e5f533029c80b0a088124cfd24d600",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "locale-segment-v1-corpus/2",
    "sha256:6d5e2106ff08648c59307e48d26e3bf6f154b5ef631663c9da2eaaca11059e39",
  ),
  release(
    "shape-specific-v1",
    "1.1.0",
    "sha256:43b30e34557f271b83afcc184e82414b37e5f533029c80b0a088124cfd24d600",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "shape-specific-v1-corpus/2",
    "sha256:8770e0992e48bcf85b7a336107272ea709fef36697200fcfc58b653372727327",
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
