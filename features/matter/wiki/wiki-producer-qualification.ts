/**
 * Offline release qualification for deterministic Wiki producers.
 *
 * The manifest owns the labelled corpus. A receipt may report only producer
 * output and measurements, so it cannot supply its own expected answers. Raw
 * producer and resource bytes are hashed here before any release is qualified.
 * This module does not compile aliases, inspect user material, or grant runtime
 * authority by itself.
 */

import type { MatterLocale } from "../config/locales";
import { isMatterLocale } from "../config/locales";
import { isWellFormedUnicodeText } from "../tree/unicode-text";

export const WIKI_PRODUCER_QUALIFICATION_VERSION = 2 as const;
export const MAX_WIKI_PRODUCER_CORPUS_CASES = 4_096;
export const MAX_WIKI_PRODUCER_RELEASE_CANDIDATES = 16;
export const MAX_WIKI_PRODUCER_ARTIFACT_BYTES = 1 * 1024 * 1024;
export const MAX_WIKI_PRODUCER_RESOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_WIKI_PRODUCER_COMBINED_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const WIKI_PRODUCER_QUALIFICATION_CAPACITY_ENTRIES = 5_000;
export const MIN_WIKI_PRODUCER_QUALIFICATION_LOOKUP_SAMPLES = 1_000;
export const MAX_WIKI_PRODUCER_QUALIFICATION_COMPILE_MICROS = 250_000;
export const MAX_WIKI_PRODUCER_QUALIFICATION_LOOKUP_P95_MICROS = 1_000;

export const WIKI_PRODUCER_IDS = Object.freeze([
  "latin-internal-edit-v2",
  "en-exact-homophone-v1",
  "zh-exact-homophone-v1",
  "zh-final-pair-v1",
] as const);

export type WikiQualifiableProducerId = (typeof WIKI_PRODUCER_IDS)[number];

export const WIKI_PRODUCER_FUNCTIONAL_CATEGORIES = Object.freeze([
  "positive",
  "adversarial",
  "ambiguity",
  "locale-isolation",
  "protected",
  "generated",
] as const);

export type WikiProducerFunctionalCategory =
  (typeof WIKI_PRODUCER_FUNCTIONAL_CATEGORIES)[number];

export type WikiProducerCorpusCategory =
  | WikiProducerFunctionalCategory
  | "capacity-performance";

export type WikiProducerIdentity = Readonly<{
  producerId: WikiQualifiableProducerId;
  producerVersion: string;
  producerDigest: string;
  resourceId: string;
  resourceVersion: string;
  resourceDigest: string;
}>;

export type WikiProducerCorpusIdentity = Readonly<{
  corpusVersion: string;
  corpusDigest: string;
}>;

export type WikiProducerExpectedCase = Readonly<{
  caseId: string;
  category: WikiProducerFunctionalCategory;
  input: Readonly<{
    locale: MatterLocale;
    channel: "spoken" | "written";
    boundary: "literal" | "word";
    observedForm: string;
    candidateCanonicals: readonly string[];
    environment: "human-material" | "protected-text" | "generated-output";
  }>;
  expectedActionId: string | null;
}>;

export type WikiProducerQualificationManifest = Readonly<{
  qualificationVersion: typeof WIKI_PRODUCER_QUALIFICATION_VERSION;
  identity: WikiProducerIdentity;
  corpus: WikiProducerCorpusIdentity;
  cases: readonly WikiProducerExpectedCase[];
  performanceBudget: Readonly<{
    minimumCapacityEntries: number;
    minimumLookupSamples: number;
    maximumCompileMicros: number;
    maximumLookupP95Micros: number;
  }>;
}>;

export type WikiProducerCaseOutput = Readonly<{
  caseId: string;
  appliedActionId: string | null;
}>;

export type WikiProducerPerformanceReceipt = Readonly<{
  attemptedEntryCount: number;
  compiledEntryCount: number;
  overflowCount: number;
  compileMicros: number;
  lookupSampleCount: number;
  lookupP95Micros: number;
}>;

export type WikiProducerCorpusRun = Readonly<{
  qualificationVersion: typeof WIKI_PRODUCER_QUALIFICATION_VERSION;
  identity: WikiProducerIdentity;
  corpus: WikiProducerCorpusIdentity;
  outputs: readonly WikiProducerCaseOutput[];
  performance: WikiProducerPerformanceReceipt;
}>;

export type WikiProducerArtifacts = Readonly<{
  producerBytes: Uint8Array;
  resourceBytes: Uint8Array;
}>;

export type WikiProducerQualificationReason =
  | "invalid-manifest"
  | "missing-receipt"
  | "invalid-receipt"
  | "missing-artifacts"
  | "artifact-size-exceeded"
  | "identity-mismatch"
  | "corpus-mismatch"
  | "producer-digest-mismatch"
  | "resource-digest-mismatch"
  | "corpus-digest-mismatch"
  | "incomplete-receipt"
  | "unexpected-output"
  | "missing-category"
  | "false-application"
  | "missed-application"
  | "ambiguity-violation"
  | "locale-isolation-violation"
  | "protected-application"
  | "generated-application"
  | "capacity-underflow"
  | "capacity-overflow"
  | "compile-budget-exceeded"
  | "lookup-sample-underflow"
  | "lookup-budget-exceeded"
  | "duplicate-producer"
  | "candidate-overflow";

export type WikiProducerQualificationMetrics = Readonly<{
  caseCount: number;
  correctApplications: number;
  falseApplications: number;
  missedApplications: number;
  ambiguityViolations: number;
  localeIsolationViolations: number;
  unsafeApplications: number;
  protectedApplications: number;
  generatedApplications: number;
  caseCounts: Readonly<Record<WikiProducerCorpusCategory, number>>;
}>;

export type WikiProducerQualificationDecision = Readonly<{
  producerId: WikiQualifiableProducerId | null;
  qualified: boolean;
  reasons: readonly WikiProducerQualificationReason[];
  metrics: WikiProducerQualificationMetrics | null;
}>;

export type WikiProducerReleaseCandidate = Readonly<{
  manifest: unknown;
  receipt?: unknown;
  artifacts?: unknown;
}>;

/** Full frozen identity retained for a later audited runtime bridge. */
export type WikiQualifiedProducerRelease = Readonly<{
  qualificationVersion: typeof WIKI_PRODUCER_QUALIFICATION_VERSION;
  identity: WikiProducerIdentity;
  corpus: WikiProducerCorpusIdentity;
}>;

export type WikiProducerReleaseQualification = Readonly<{
  qualifiedProducers: readonly WikiQualifiedProducerRelease[];
  decisions: readonly WikiProducerQualificationDecision[];
}>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const MAX_BOUNDED_METRIC = 1_000_000_000;

/** Hashes exact bytes supplied by a controlled qualification harness. */
export async function digestWikiProducerArtifact(bytes: Uint8Array): Promise<string> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError("qualification artifacts must contain bytes");
  }
  if (bytes.byteLength > MAX_WIKI_PRODUCER_RESOURCE_BYTES) {
    throw new RangeError("qualification artifact exceeds the hashing ceiling");
  }
  const snapshot = new Uint8Array(bytes.byteLength);
  snapshot.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", snapshot);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

/** Corpus identity is the digest of sorted, strictly parsed expected cases. */
export async function digestWikiProducerCorpus(
  casesValue: unknown,
): Promise<string | null> {
  const cases = parseExpectedCases(casesValue);
  if (cases === null) return null;
  const canonical = JSON.stringify(cases.map((item) => ({
    caseId: item.caseId,
    category: item.category,
    input: {
      locale: item.input.locale,
      channel: item.input.channel,
      boundary: item.input.boundary,
      observedForm: item.input.observedForm,
      candidateCanonicals: item.input.candidateCanonicals,
      environment: item.input.environment,
    },
    expectedActionId: item.expectedActionId,
  })));
  return digestWikiProducerArtifact(new TextEncoder().encode(canonical));
}

/**
 * Evaluates one pinned producer/resource pair against a manifest-owned corpus.
 * Malformed or mismatched input returns NO-GO instead of partially accepting.
 */
export async function qualifyWikiProducer(
  manifestValue: unknown,
  receiptValue: unknown,
  artifactsValue: unknown,
): Promise<WikiProducerQualificationDecision> {
  const manifest = parseManifest(manifestValue);
  if (manifest === null) return decision(null, ["invalid-manifest"], null);
  if (receiptValue === undefined || receiptValue === null) {
    return decision(manifest.identity.producerId, ["missing-receipt"], null);
  }
  const receipt = parseReceipt(receiptValue);
  if (receipt === null) {
    return decision(manifest.identity.producerId, ["invalid-receipt"], null);
  }
  const artifacts = parseArtifacts(artifactsValue);
  if (artifacts.status === "invalid") {
    return decision(manifest.identity.producerId, ["missing-artifacts"], null);
  }
  if (artifacts.status === "oversized") {
    return decision(manifest.identity.producerId, ["artifact-size-exceeded"], null);
  }

  const reasons: WikiProducerQualificationReason[] = [];
  if (!sameIdentity(manifest.identity, receipt.identity)) {
    reasons.push("identity-mismatch");
  }
  if (!sameCorpus(manifest.corpus, receipt.corpus)) {
    reasons.push("corpus-mismatch");
  }

  const [producerDigest, resourceDigest, corpusDigest] = await Promise.all([
    digestWikiProducerArtifact(artifacts.value.producerBytes),
    digestWikiProducerArtifact(artifacts.value.resourceBytes),
    digestWikiProducerCorpus(manifest.cases),
  ]);
  if (producerDigest !== manifest.identity.producerDigest) {
    reasons.push("producer-digest-mismatch");
  }
  if (resourceDigest !== manifest.identity.resourceDigest) {
    reasons.push("resource-digest-mismatch");
  }
  if (corpusDigest !== manifest.corpus.corpusDigest) {
    reasons.push("corpus-digest-mismatch");
  }

  const metrics = evaluateRun(manifest, receipt, reasons);
  return decision(manifest.identity.producerId, reasons, metrics);
}

/**
 * Returns complete identities only for unique, fully passing candidates.
 * The result is still offline evidence; no runtime bridge consumes it today.
 */
export async function qualifyWikiProducerReleases(
  candidates: readonly WikiProducerReleaseCandidate[],
): Promise<WikiProducerReleaseQualification> {
  if (!Array.isArray(candidates)) return emptyReleaseQualification();
  if (candidates.length > MAX_WIKI_PRODUCER_RELEASE_CANDIDATES) {
    return Object.freeze({
      qualifiedProducers: Object.freeze([]),
      decisions: Object.freeze([decision(null, ["candidate-overflow"], null)]),
    });
  }

  const parsedManifests = candidates.map((candidate) => parseManifest(candidate?.manifest));
  const decisions = await Promise.all(candidates.map((candidate) =>
    qualifyWikiProducer(candidate?.manifest, candidate?.receipt, candidate?.artifacts)
  ));
  const counts = new Map<string, number>();
  for (const item of decisions) {
    if (item.producerId !== null) {
      counts.set(item.producerId, (counts.get(item.producerId) ?? 0) + 1);
    }
  }
  const finalDecisions = decisions.map((item) => {
    if (item.producerId === null || counts.get(item.producerId) === 1) return item;
    return decision(item.producerId, [...item.reasons, "duplicate-producer"], item.metrics);
  });
  const qualifiedProducers = finalDecisions.flatMap((item, index) => {
    const manifest = parsedManifests[index];
    if (!item.qualified || manifest === null) return [];
    return [Object.freeze({
      qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
      identity: manifest.identity,
      corpus: manifest.corpus,
    })];
  }).sort((left, right) => compareText(
    left.identity.producerId,
    right.identity.producerId,
  ));
  return Object.freeze({
    qualifiedProducers: Object.freeze(qualifiedProducers),
    decisions: Object.freeze(finalDecisions),
  });
}

function evaluateRun(
  manifest: WikiProducerQualificationManifest,
  receipt: WikiProducerCorpusRun,
  reasons: WikiProducerQualificationReason[],
): WikiProducerQualificationMetrics {
  const counts = emptyCaseCounts();
  let correctApplications = 0;
  let falseApplications = 0;
  let missedApplications = 0;
  let ambiguityViolations = 0;
  let localeIsolationViolations = 0;
  let protectedApplications = 0;
  let generatedApplications = 0;

  const expectedById = new Map(manifest.cases.map((item) => [item.caseId, item]));
  const outputById = new Map(receipt.outputs.map((item) => [item.caseId, item]));
  if (receipt.outputs.some((item) => !expectedById.has(item.caseId))) {
    addReason(reasons, "unexpected-output");
  }
  if (manifest.cases.some((item) => !outputById.has(item.caseId))) {
    addReason(reasons, "incomplete-receipt");
  }

  for (const expectedCase of manifest.cases) {
    counts[expectedCase.category] += 1;
    const applied = outputById.get(expectedCase.caseId)?.appliedActionId ?? null;
    const expected = expectedCase.expectedActionId;
    if (expected !== null && applied === expected) correctApplications += 1;
    if (expected !== null && applied === null) missedApplications += 1;
    if (applied !== null && applied !== expected) falseApplications += 1;
    if (expectedCase.category === "ambiguity" && applied !== null) {
      ambiguityViolations += 1;
    }
    if (expectedCase.category === "locale-isolation" && applied !== null) {
      localeIsolationViolations += 1;
    }
    if (expectedCase.category === "protected" && applied !== null) {
      protectedApplications += 1;
    }
    if (expectedCase.category === "generated" && applied !== null) {
      generatedApplications += 1;
    }
  }
  counts["capacity-performance"] = 1;

  for (const category of WIKI_PRODUCER_FUNCTIONAL_CATEGORIES) {
    if (counts[category] === 0) addReason(reasons, "missing-category");
  }
  if (falseApplications > 0) addReason(reasons, "false-application");
  if (missedApplications > 0) addReason(reasons, "missed-application");
  if (ambiguityViolations > 0) addReason(reasons, "ambiguity-violation");
  if (localeIsolationViolations > 0) addReason(reasons, "locale-isolation-violation");
  if (protectedApplications > 0) addReason(reasons, "protected-application");
  if (generatedApplications > 0) addReason(reasons, "generated-application");

  const performance = receipt.performance;
  const budget = manifest.performanceBudget;
  if (performance.attemptedEntryCount < budget.minimumCapacityEntries) {
    addReason(reasons, "capacity-underflow");
  }
  if (performance.compiledEntryCount !== performance.attemptedEntryCount ||
      performance.overflowCount > 0) {
    addReason(reasons, "capacity-overflow");
  }
  if (performance.compileMicros > budget.maximumCompileMicros) {
    addReason(reasons, "compile-budget-exceeded");
  }
  if (performance.lookupSampleCount < budget.minimumLookupSamples) {
    addReason(reasons, "lookup-sample-underflow");
  }
  if (performance.lookupP95Micros > budget.maximumLookupP95Micros) {
    addReason(reasons, "lookup-budget-exceeded");
  }

  return Object.freeze({
    caseCount: manifest.cases.length + 1,
    correctApplications,
    falseApplications,
    missedApplications,
    ambiguityViolations,
    localeIsolationViolations,
    unsafeApplications: protectedApplications + generatedApplications,
    protectedApplications,
    generatedApplications,
    caseCounts: Object.freeze({ ...counts }),
  });
}

function parseManifest(value: unknown): WikiProducerQualificationManifest | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "qualificationVersion", "identity", "corpus", "cases", "performanceBudget",
  ]) || value.qualificationVersion !== WIKI_PRODUCER_QUALIFICATION_VERSION) return null;
  const identity = parseIdentity(value.identity);
  const corpus = parseCorpusIdentity(value.corpus);
  const cases = parseExpectedCases(value.cases);
  const performanceBudget = parsePerformanceBudget(value.performanceBudget);
  if (identity === null || corpus === null || cases === null ||
      performanceBudget === null) return null;
  return Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    cases,
    performanceBudget,
  });
}

function parseExpectedCases(value: unknown): readonly WikiProducerExpectedCase[] | null {
  if (!Array.isArray(value) || value.length === 0 ||
      value.length > MAX_WIKI_PRODUCER_CORPUS_CASES) return null;
  const result: WikiProducerExpectedCase[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, [
      "caseId", "category", "input", "expectedActionId",
    ]) || !isCaseId(candidate.caseId) ||
        !WIKI_PRODUCER_FUNCTIONAL_CATEGORIES.includes(
          candidate.category as WikiProducerFunctionalCategory,
        ) || !isExpectedInput(candidate.input) ||
        !isNullableActionId(candidate.expectedActionId) ||
        ids.has(candidate.caseId)) return null;
    if ((candidate.category === "positive") !==
        (candidate.expectedActionId !== null)) return null;
    if ((candidate.category === "protected") !==
        (candidate.input.environment === "protected-text") ||
        (candidate.category === "generated") !==
        (candidate.input.environment === "generated-output") ||
        (candidate.category !== "protected" && candidate.category !== "generated" &&
          candidate.input.environment !== "human-material")) return null;
    ids.add(candidate.caseId);
    result.push(Object.freeze({
      caseId: candidate.caseId,
      category: candidate.category as WikiProducerFunctionalCategory,
      input: Object.freeze({
        locale: candidate.input.locale,
        channel: candidate.input.channel,
        boundary: candidate.input.boundary,
        observedForm: candidate.input.observedForm,
        candidateCanonicals: Object.freeze([...candidate.input.candidateCanonicals]),
        environment: candidate.input.environment,
      }),
      expectedActionId: candidate.expectedActionId,
    }));
  }
  result.sort((left, right) => compareText(left.caseId, right.caseId));
  return Object.freeze(result);
}

function parseReceipt(value: unknown): WikiProducerCorpusRun | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "qualificationVersion", "identity", "corpus", "outputs", "performance",
  ]) || value.qualificationVersion !== WIKI_PRODUCER_QUALIFICATION_VERSION) return null;
  const identity = parseIdentity(value.identity);
  const corpus = parseCorpusIdentity(value.corpus);
  const outputs = parseOutputs(value.outputs);
  const performance = parsePerformanceReceipt(value.performance);
  if (identity === null || corpus === null || outputs === null || performance === null) {
    return null;
  }
  return Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    outputs,
    performance,
  });
}

function parseOutputs(value: unknown): readonly WikiProducerCaseOutput[] | null {
  if (!Array.isArray(value) || value.length > MAX_WIKI_PRODUCER_CORPUS_CASES) return null;
  const result: WikiProducerCaseOutput[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["caseId", "appliedActionId"]) ||
        !isCaseId(candidate.caseId) || !isNullableActionId(candidate.appliedActionId) ||
        ids.has(candidate.caseId)) return null;
    ids.add(candidate.caseId);
    result.push(Object.freeze({
      caseId: candidate.caseId,
      appliedActionId: candidate.appliedActionId,
    }));
  }
  return Object.freeze(result);
}

function parsePerformanceReceipt(value: unknown): WikiProducerPerformanceReceipt | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "attemptedEntryCount", "compiledEntryCount", "overflowCount", "compileMicros",
    "lookupSampleCount", "lookupP95Micros",
  ]) || !isBoundedMetric(value.attemptedEntryCount) ||
      !isBoundedMetric(value.compiledEntryCount) || !isBoundedMetric(value.overflowCount) ||
      !isBoundedMetric(value.compileMicros) || !isBoundedMetric(value.lookupSampleCount) ||
      !isBoundedMetric(value.lookupP95Micros)) return null;
  return Object.freeze({
    attemptedEntryCount: value.attemptedEntryCount,
    compiledEntryCount: value.compiledEntryCount,
    overflowCount: value.overflowCount,
    compileMicros: value.compileMicros,
    lookupSampleCount: value.lookupSampleCount,
    lookupP95Micros: value.lookupP95Micros,
  });
}

type WikiProducerArtifactsParse =
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "oversized" }>
  | Readonly<{ status: "ok"; value: WikiProducerArtifacts }>;

function parseArtifacts(value: unknown): WikiProducerArtifactsParse {
  if (!isRecord(value) || !hasOnlyKeys(value, ["producerBytes", "resourceBytes"]) ||
      !(value.producerBytes instanceof Uint8Array) ||
      !(value.resourceBytes instanceof Uint8Array) ||
      value.producerBytes.byteLength === 0 || value.resourceBytes.byteLength === 0) {
    return Object.freeze({ status: "invalid" });
  }
  if (value.producerBytes.byteLength > MAX_WIKI_PRODUCER_ARTIFACT_BYTES ||
      value.resourceBytes.byteLength > MAX_WIKI_PRODUCER_RESOURCE_BYTES ||
      value.producerBytes.byteLength + value.resourceBytes.byteLength >
        MAX_WIKI_PRODUCER_COMBINED_ARTIFACT_BYTES) {
    return Object.freeze({ status: "oversized" });
  }
  return Object.freeze({
    status: "ok",
    value: Object.freeze({
      producerBytes: value.producerBytes,
      resourceBytes: value.resourceBytes,
    }),
  });
}

function parseIdentity(value: unknown): WikiProducerIdentity | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "producerId", "producerVersion", "producerDigest", "resourceId", "resourceVersion",
    "resourceDigest",
  ]) || !isProducerId(value.producerId) || !isVersion(value.producerVersion) ||
      !isDigest(value.producerDigest) || !isVersion(value.resourceId) ||
      !isVersion(value.resourceVersion) || !isDigest(value.resourceDigest)) return null;
  return Object.freeze({
    producerId: value.producerId,
    producerVersion: value.producerVersion,
    producerDigest: value.producerDigest,
    resourceId: value.resourceId,
    resourceVersion: value.resourceVersion,
    resourceDigest: value.resourceDigest,
  });
}

function parseCorpusIdentity(value: unknown): WikiProducerCorpusIdentity | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["corpusVersion", "corpusDigest"]) ||
      !isVersion(value.corpusVersion) || !isDigest(value.corpusDigest)) return null;
  return Object.freeze({
    corpusVersion: value.corpusVersion,
    corpusDigest: value.corpusDigest,
  });
}

function parsePerformanceBudget(
  value: unknown,
): WikiProducerQualificationManifest["performanceBudget"] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "minimumCapacityEntries", "minimumLookupSamples", "maximumCompileMicros",
    "maximumLookupP95Micros",
  ]) || !isPositiveMetric(value.minimumCapacityEntries) ||
      !isPositiveMetric(value.minimumLookupSamples) ||
      !isPositiveMetric(value.maximumCompileMicros) ||
      !isPositiveMetric(value.maximumLookupP95Micros) ||
      value.minimumCapacityEntries < WIKI_PRODUCER_QUALIFICATION_CAPACITY_ENTRIES ||
      value.minimumLookupSamples < MIN_WIKI_PRODUCER_QUALIFICATION_LOOKUP_SAMPLES ||
      value.maximumCompileMicros > MAX_WIKI_PRODUCER_QUALIFICATION_COMPILE_MICROS ||
      value.maximumLookupP95Micros >
        MAX_WIKI_PRODUCER_QUALIFICATION_LOOKUP_P95_MICROS) return null;
  return Object.freeze({
    minimumCapacityEntries: value.minimumCapacityEntries,
    minimumLookupSamples: value.minimumLookupSamples,
    maximumCompileMicros: value.maximumCompileMicros,
    maximumLookupP95Micros: value.maximumLookupP95Micros,
  });
}

function decision(
  producerId: WikiQualifiableProducerId | null,
  reasons: readonly WikiProducerQualificationReason[],
  metrics: WikiProducerQualificationMetrics | null,
): WikiProducerQualificationDecision {
  const frozenReasons = Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    producerId,
    qualified: frozenReasons.length === 0,
    reasons: frozenReasons,
    metrics,
  });
}

function emptyReleaseQualification(): WikiProducerReleaseQualification {
  return Object.freeze({
    qualifiedProducers: Object.freeze([]),
    decisions: Object.freeze([]),
  });
}

function sameIdentity(left: WikiProducerIdentity, right: WikiProducerIdentity): boolean {
  return left.producerId === right.producerId &&
    left.producerVersion === right.producerVersion &&
    left.producerDigest === right.producerDigest &&
    left.resourceId === right.resourceId &&
    left.resourceVersion === right.resourceVersion &&
    left.resourceDigest === right.resourceDigest;
}

function sameCorpus(
  left: WikiProducerCorpusIdentity,
  right: WikiProducerCorpusIdentity,
): boolean {
  return left.corpusVersion === right.corpusVersion &&
    left.corpusDigest === right.corpusDigest;
}

function emptyCaseCounts(): Record<WikiProducerCorpusCategory, number> {
  return {
    positive: 0,
    adversarial: 0,
    ambiguity: 0,
    "locale-isolation": 0,
    protected: 0,
    generated: 0,
    "capacity-performance": 0,
  };
}

function addReason(
  reasons: WikiProducerQualificationReason[],
  reason: WikiProducerQualificationReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isProducerId(value: unknown): value is WikiQualifiableProducerId {
  return typeof value === "string" &&
    WIKI_PRODUCER_IDS.includes(value as WikiQualifiableProducerId);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function isCaseId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isNullableActionId(value: unknown): value is string | null {
  return value === null || isCaseId(value);
}

function isExpectedInput(value: unknown): value is WikiProducerExpectedCase["input"] {
  return isRecord(value) && hasOnlyKeys(value, [
    "locale", "channel", "boundary", "observedForm", "candidateCanonicals", "environment",
  ]) && typeof value.locale === "string" && isMatterLocale(value.locale) &&
    (value.channel === "spoken" || value.channel === "written") &&
    (value.boundary === "literal" || value.boundary === "word") &&
    isBoundedText(value.observedForm) && Array.isArray(value.candidateCanonicals) &&
    value.candidateCanonicals.length > 0 && value.candidateCanonicals.length <= 8 &&
    value.candidateCanonicals.every(isBoundedText) &&
    new Set(value.candidateCanonicals).size === value.candidateCanonicals.length &&
    (value.environment === "human-material" || value.environment === "protected-text" ||
      value.environment === "generated-output");
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    isWellFormedUnicodeText(value) && [...value].length <= 128;
}

function isBoundedMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_BOUNDED_METRIC;
}

function isPositiveMetric(value: unknown): value is number {
  return isBoundedMetric(value) && value > 0;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
