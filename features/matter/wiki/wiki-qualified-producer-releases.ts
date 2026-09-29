import type { WikiQualifiedProducerRelease } from "./wiki-producer-qualification";
import { MATTER_WIKI_RUNTIME_PRODUCER_RELEASES } from
  "./wiki-runtime-producer-releases";

/**
 * Compact outputs of controlled qualification harnesses. The product allow-list
 * below may select complete identities, never labelled corpora, receipts, or
 * raw artifacts.
 */
export const MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES = Object.freeze([
  release(
    "en-metaphone-v1",
    "1.0.0",
    "sha256:af5e5216680e19c8b0a3575e96ed2395586a50baf30dc7f02c221e2dbb76a31f",
    "double-metaphone",
    "2.0.1",
    "sha256:0dfe1529b4c74bff8a38d6b09f1dc8331bc7bbe4636e43ef4a0855ef9cba68d8",
    "en-metaphone-v1-corpus/1",
    "sha256:1a36ebc615963abb68f10e094740d6efb575e93c2e79092ca85640cac91d7274",
  ),
  ...MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
  release(
    "zh-exact-homophone-v1",
    "1.0.0",
    "sha256:af5e5216680e19c8b0a3575e96ed2395586a50baf30dc7f02c221e2dbb76a31f",
    "pinyin-pro",
    "3.29.4",
    "sha256:96770aa9c9a004de28199725b41e9f17cd64fc221b5189fbb0b7c85f6620543b",
    "zh-exact-homophone-v1-corpus/1",
    "sha256:026480a9e96d82cd35632b692e29344bfe23bbd04635ca1f10d0a60447fe2f2b",
  ),
  release(
    "zh-final-pair-v1",
    "1.0.0",
    "sha256:af5e5216680e19c8b0a3575e96ed2395586a50baf30dc7f02c221e2dbb76a31f",
    "pinyin-pro",
    "3.29.4",
    "sha256:96770aa9c9a004de28199725b41e9f17cd64fc221b5189fbb0b7c85f6620543b",
    "zh-final-pair-v1-corpus/1",
    "sha256:bea7d9e994c92313d82a34a97c88f2a91f9ec11ff3b3d64b693ad2860ff60245",
  ),
]) satisfies readonly WikiQualifiedProducerRelease[];

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
