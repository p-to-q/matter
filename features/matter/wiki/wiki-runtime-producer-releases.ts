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
    "2.2.0",
    "sha256:d652b1edabd6f254313edbbf22db0b918a244193a99a757cb79a56378b2e6b15",
    "ascii-latin",
    "1.2.0",
    "sha256:f294e081d89131d77d2df4e27decbd82c5f97c79572f0aee17ab8d7ef673b45f",
    "latin-internal-edit-corpus/3",
    "sha256:afe09fa47794c3d57f93bbe100c4cae3985ab26ddd876b0d292822440cddd445",
  ),
  release(
    "locale-segment-v1",
    "1.2.0",
    "sha256:6dff08409e85cacff8c091422c638f9fcc36e916753b30d2034b285e2c542b08",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "locale-segment-v1-corpus/3",
    "sha256:3fe353ff80e184259c8142f8ef8f6008991b07394b090b7636b8b20a4073ebdb",
  ),
  release(
    "shape-specific-v1",
    "1.2.0",
    "sha256:6dff08409e85cacff8c091422c638f9fcc36e916753b30d2034b285e2c542b08",
    "ecmascript-intl-segmenter-conformance",
    "fixture/2",
    "sha256:3d8c9c792f4e8346a66603fac32c5c1a048b455da1e24fd169c306c2cd30263c",
    "shape-specific-v1-corpus/3",
    "sha256:023fe09124f93967f6ebb138dd62b2159deca8f1bbb1b7189e2ffc1b6f1d17fb",
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
