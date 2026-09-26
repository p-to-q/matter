import { describe, expect, it } from "vitest";
import {
  MAX_WIKI_PRODUCER_ARTIFACT_BYTES,
  MAX_WIKI_PRODUCER_COMBINED_ARTIFACT_BYTES,
  MAX_WIKI_PRODUCER_RELEASE_CANDIDATES,
  MAX_WIKI_PRODUCER_RESOURCE_BYTES,
  WIKI_PRODUCER_QUALIFICATION_VERSION,
  digestWikiProducerArtifact,
  digestWikiProducerCorpus,
  qualifyWikiProducer,
  qualifyWikiProducerReleases,
  type WikiProducerArtifacts,
  type WikiProducerCorpusRun,
  type WikiProducerExpectedCase,
  type WikiProducerQualificationManifest,
  type WikiQualifiableProducerId,
} from "./wiki-producer-qualification";

const PRODUCER_BYTES = new TextEncoder().encode("deterministic-producer-v1");
const RESOURCE_BYTES = new TextEncoder().encode("pinned-pronunciation-resource-v1");

describe("Wiki producer qualification", () => {
  it("qualifies pinned artifacts against a manifest-owned complete corpus", async () => {
    const value = await fixture();
    const result = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      value.artifacts,
    );

    expect(result).toEqual({
      producerId: "en-exact-homophone-v1",
      qualified: true,
      reasons: [],
      metrics: {
        caseCount: 7,
        correctApplications: 1,
        falseApplications: 0,
        missedApplications: 0,
        ambiguityViolations: 0,
        localeIsolationViolations: 0,
        unsafeApplications: 0,
        protectedApplications: 0,
        generatedApplications: 0,
        caseCounts: {
          positive: 1,
          adversarial: 1,
          ambiguity: 1,
          "locale-isolation": 1,
          protected: 1,
          generated: 1,
          "capacity-performance": 1,
        },
      },
    });
  });

  it("keeps the release set empty without a receipt or raw artifacts", async () => {
    const value = await fixture();
    const absent = await qualifyWikiProducerReleases([{
      manifest: value.manifest,
      artifacts: value.artifacts,
    }]);
    expect(absent.qualifiedProducers).toEqual([]);
    expect(absent.decisions[0]).toMatchObject({
      qualified: false,
      reasons: ["missing-receipt"],
    });

    const noArtifacts = await qualifyWikiProducer(value.manifest, value.receipt, undefined);
    expect(noArtifacts.reasons).toEqual(["missing-artifacts"]);
  });

  it("rejects oversized artifacts before cloning or hashing them", async () => {
    const value = await fixture();
    const oversizedProducer = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      {
        ...value.artifacts,
        producerBytes: new Uint8Array(MAX_WIKI_PRODUCER_ARTIFACT_BYTES + 1),
      },
    );
    expect(oversizedProducer.reasons).toEqual(["artifact-size-exceeded"]);

    const oversizedResource = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      {
        ...value.artifacts,
        resourceBytes: new Uint8Array(MAX_WIKI_PRODUCER_RESOURCE_BYTES + 1),
      },
    );
    expect(oversizedResource.reasons).toEqual(["artifact-size-exceeded"]);

    const combinedOverflow = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      {
        producerBytes: new Uint8Array(MAX_WIKI_PRODUCER_ARTIFACT_BYTES),
        resourceBytes: new Uint8Array(
          MAX_WIKI_PRODUCER_COMBINED_ARTIFACT_BYTES -
          MAX_WIKI_PRODUCER_ARTIFACT_BYTES + 1,
        ),
      },
    );
    expect(combinedOverflow.reasons).toEqual(["artifact-size-exceeded"]);
  });

  it("recomputes producer, resource, and manifest-corpus digests", async () => {
    const value = await fixture();
    const wrongProducer = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      { ...value.artifacts, producerBytes: new TextEncoder().encode("changed-producer") },
    );
    expect(wrongProducer.reasons).toContain("producer-digest-mismatch");

    const wrongResource = await qualifyWikiProducer(
      value.manifest,
      value.receipt,
      { ...value.artifacts, resourceBytes: new TextEncoder().encode("changed-resource") },
    );
    expect(wrongResource.reasons).toContain("resource-digest-mismatch");

    const changedCases = value.manifest.cases.map((item) =>
      item.category === "positive" ? { ...item, expectedActionId: "different-action" } : item
    );
    const wrongCorpus = await qualifyWikiProducer(
      { ...value.manifest, cases: changedCases },
      value.receipt,
      value.artifacts,
    );
    expect(wrongCorpus.reasons).toContain("corpus-digest-mismatch");

    const changedInput = value.manifest.cases.map((item) =>
      item.category === "positive"
        ? { ...item, input: { ...item.input, observedForm: "different-input" } }
        : item
    );
    const inputMismatch = await qualifyWikiProducer(
      { ...value.manifest, cases: changedInput },
      value.receipt,
      value.artifacts,
    );
    expect(inputMismatch.reasons).toContain("corpus-digest-mismatch");
  });

  it("canonicalizes strict input key order before hashing the corpus", async () => {
    const value = await fixture();
    const reordered = value.manifest.cases.map((item) => ({
      expectedActionId: item.expectedActionId,
      input: {
        environment: item.input.environment,
        candidateCanonicals: item.input.candidateCanonicals,
        observedForm: item.input.observedForm,
        boundary: item.input.boundary,
        channel: item.input.channel,
        locale: item.input.locale,
      },
      category: item.category,
      caseId: item.caseId,
    }));

    expect(await digestWikiProducerCorpus(reordered))
      .toBe(value.manifest.corpus.corpusDigest);
  });

  it("binds outputs to the producer and corpus identities", async () => {
    const value = await fixture();
    const identityMismatch = await qualifyWikiProducer(value.manifest, {
      ...value.receipt,
      identity: { ...value.receipt.identity, resourceVersion: "2026.10" },
    }, value.artifacts);
    expect(identityMismatch.reasons).toContain("identity-mismatch");

    const corpusMismatch = await qualifyWikiProducer(value.manifest, {
      ...value.receipt,
      corpus: { ...value.receipt.corpus, corpusVersion: "wiki-producer-corpus/2" },
    }, value.artifacts);
    expect(corpusMismatch.reasons).toContain("corpus-mismatch");
  });

  it("fails closed for false, ambiguous, cross-locale, protected, and generated output", async () => {
    const value = await fixture();
    const outputs = value.receipt.outputs.map((item) => {
      const expected = value.manifest.cases.find((entry) => entry.caseId === item.caseId);
      return expected?.category === "positive"
        ? item
        : { ...item, appliedActionId: "unexpected-action" };
    });
    const result = await qualifyWikiProducer(
      value.manifest,
      { ...value.receipt, outputs },
      value.artifacts,
    );

    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual([
      "false-application",
      "ambiguity-violation",
      "locale-isolation-violation",
      "protected-application",
      "generated-application",
    ]);
    expect(result.metrics).toMatchObject({
      falseApplications: 5,
      ambiguityViolations: 1,
      localeIsolationViolations: 1,
      unsafeApplications: 2,
    });
  });

  it("requires every frozen output and rejects unexpected output ids", async () => {
    const value = await fixture();
    const missing = await qualifyWikiProducer(
      value.manifest,
      { ...value.receipt, outputs: value.receipt.outputs.slice(1) },
      value.artifacts,
    );
    expect(missing.reasons).toContain("incomplete-receipt");
    expect(missing.reasons).toContain("missed-application");

    const extra = await qualifyWikiProducer(
      value.manifest,
      {
        ...value.receipt,
        outputs: [...value.receipt.outputs, {
          caseId: "not-in-frozen-corpus",
          appliedActionId: null,
        }],
      },
      value.artifacts,
    );
    expect(extra.reasons).toContain("unexpected-output");
  });

  it("holds capacity and performance evidence to the pinned manifest budget", async () => {
    const value = await fixture();
    const result = await qualifyWikiProducer(value.manifest, {
      ...value.receipt,
      performance: {
        attemptedEntryCount: 4_999,
        compiledEntryCount: 4_998,
        overflowCount: 1,
        compileMicros: 250_001,
        lookupSampleCount: 999,
        lookupP95Micros: 1_001,
      },
    }, value.artifacts);

    expect(result.reasons).toEqual([
      "capacity-underflow",
      "capacity-overflow",
      "compile-budget-exceeded",
      "lookup-sample-underflow",
      "lookup-budget-exceeded",
    ]);
  });

  it("rejects malformed, unknown, duplicate, and oversized contracts whole", async () => {
    const value = await fixture();
    expect((await qualifyWikiProducer(
      { ...value.manifest, extra: true },
      value.receipt,
      value.artifacts,
    )).reasons).toEqual(["invalid-manifest"]);
    expect((await qualifyWikiProducer({
      ...value.manifest,
      identity: { ...value.manifest.identity, producerId: "unknown-producer" },
    }, value.receipt, value.artifacts)).reasons).toEqual(["invalid-manifest"]);
    expect((await qualifyWikiProducer(value.manifest, {
      ...value.receipt,
      outputs: [...value.receipt.outputs, value.receipt.outputs[0]],
    }, value.artifacts)).reasons).toEqual(["invalid-receipt"]);

    const overflow = await qualifyWikiProducerReleases(Array.from(
      { length: MAX_WIKI_PRODUCER_RELEASE_CANDIDATES + 1 },
      () => ({
        manifest: value.manifest,
        receipt: value.receipt,
        artifacts: value.artifacts,
      }),
    ));
    expect(overflow).toEqual({
      qualifiedProducers: [],
      decisions: [{
        producerId: null,
        qualified: false,
        reasons: ["candidate-overflow"],
        metrics: null,
      }],
    });
  });

  it("fails duplicate ids closed and preserves full identity for unique releases", async () => {
    const first = await fixture();
    const other = await fixture("zh-exact-homophone-v1");
    const result = await qualifyWikiProducerReleases([first, other, first]);

    expect(result.qualifiedProducers).toEqual([{
      qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
      identity: other.manifest.identity,
      corpus: other.manifest.corpus,
    }]);
    expect(result.decisions.map((item) => item.reasons)).toEqual([
      ["duplicate-producer"],
      [],
      ["duplicate-producer"],
    ]);
  });
});

async function fixture(
  producerId: WikiQualifiableProducerId = "en-exact-homophone-v1",
): Promise<Readonly<{
  manifest: WikiProducerQualificationManifest;
  receipt: WikiProducerCorpusRun;
  artifacts: WikiProducerArtifacts;
}>> {
  const cases: readonly WikiProducerExpectedCase[] = [
    expected("positive", "canonical-action"),
    expected("adversarial", null),
    expected("ambiguity", null),
    expected("locale-isolation", null),
    expected("protected", null),
    expected("generated", null),
  ];
  const corpusDigest = await digestWikiProducerCorpus(cases);
  if (corpusDigest === null) throw new Error("fixture corpus is invalid");
  const identity = {
    producerId,
    producerVersion: "1.0.0",
    producerDigest: await digestWikiProducerArtifact(PRODUCER_BYTES),
    resourceId: "pronunciation-resource",
    resourceVersion: "2026.09",
    resourceDigest: await digestWikiProducerArtifact(RESOURCE_BYTES),
  } as const;
  const corpus = {
    corpusVersion: "wiki-producer-corpus/1",
    corpusDigest,
  } as const;
  const manifest: WikiProducerQualificationManifest = {
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    cases,
    performanceBudget: {
      minimumCapacityEntries: 5_000,
      minimumLookupSamples: 1_000,
      maximumCompileMicros: 250_000,
      maximumLookupP95Micros: 1_000,
    },
  };
  const receipt: WikiProducerCorpusRun = {
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    outputs: cases.map((item) => ({
      caseId: item.caseId,
      appliedActionId: item.expectedActionId,
    })),
    performance: {
      attemptedEntryCount: 5_000,
      compiledEntryCount: 5_000,
      overflowCount: 0,
      compileMicros: 250_000,
      lookupSampleCount: 1_000,
      lookupP95Micros: 1_000,
    },
  };
  return Object.freeze({
    manifest,
    receipt,
    artifacts: Object.freeze({
      producerBytes: PRODUCER_BYTES,
      resourceBytes: RESOURCE_BYTES,
    }),
  });
}

function expected(
  category: WikiProducerExpectedCase["category"],
  expectedActionId: string | null,
): WikiProducerExpectedCase {
  const environment = category === "protected"
    ? "protected-text" as const
    : category === "generated"
      ? "generated-output" as const
      : "human-material" as const;
  return {
    caseId: `${category}-1`,
    category,
    input: {
      locale: category === "locale-isolation" ? "zh-CN" : "en-US",
      channel: "spoken",
      boundary: "word",
      observedForm: `${category}-form`,
      candidateCanonicals: category === "ambiguity" ? ["Alpha", "Alfa"] : ["Codex"],
      environment,
    },
    expectedActionId,
  };
}
