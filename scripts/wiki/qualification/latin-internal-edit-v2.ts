import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  compileWikiFitSnapshot,
  fitCommittedWikiText,
} from "../../../features/matter/wiki/wiki-fitting";
import {
  WIKI_PRODUCER_QUALIFICATION_VERSION,
  digestWikiProducerArtifact,
  digestWikiProducerCorpus,
  qualifyWikiProducerReleases,
  type WikiProducerArtifacts,
  type WikiProducerCorpusRun,
  type WikiProducerExpectedCase,
  type WikiProducerQualificationManifest,
  type WikiQualifiedProducerRelease,
} from "../../../features/matter/wiki/wiki-producer-qualification";
import {
  WIKI_FITTING_VERSION,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiLexeme,
  type WikiState,
} from "../../../features/matter/wiki/wiki-model";
import type { MatterLocale } from "../../../features/matter/config/locales";
import { selectBestCompleteWikiPerformanceTrial } from "./performance-trials";

const ROOT = resolve(import.meta.dirname, "../../..");
const PRODUCER_FILES = Object.freeze([
  "features/matter/wiki/wiki-fitting.ts",
  "features/matter/wiki/canonicalize-wiki-text.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/wiki/wiki-learning-policy.ts",
  "features/matter/wiki/wiki-model.ts",
]);
const RESOURCE_BYTES = new TextEncoder().encode(
  "ascii-latin:a-z;case-fold:en-US;segmentation:ecmascript-2026",
);
const CAPACITY = 512;
const LOOKUPS = 1_000;
const PERFORMANCE_TRIALS = 3;
const PERFORMANCE_BUDGET = Object.freeze({
  maximumCompileMicros: 750_000,
  maximumLookupP95Micros: 3_000,
});
const QUALIFIED_PERFORMANCE_RECEIPT = Object.freeze({
  attemptedEntryCount: CAPACITY,
  compiledEntryCount: CAPACITY,
  overflowCount: 0,
  compileMicros: 87_432,
  lookupSampleCount: LOOKUPS,
  lookupP95Micros: 253,
});

export const LATIN_INTERNAL_EDIT_CASES = Object.freeze([
  corpusCase("positive-transposition", "positive", "en-US", "spoken",
    "Englebart", ["Engelbart"], "human-material", "canonical:Engelbart"),
  corpusCase("positive-substitution", "positive", "en-US", "spoken",
    "Morphogenasis", ["Morphogenesis"], "human-material", "canonical:Morphogenesis"),
  corpusCase("adversarial-written", "adversarial", "en-US", "written",
    "Englebart", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-distant", "adversarial", "en-US", "spoken",
    "Engleboard", ["Engelbart"], "human-material", null),
  corpusCase("ambiguity-two-canonicals", "ambiguity", "en-US", "spoken",
    "Abczefgh", ["Abcxefgh", "Abcyefgh"], "human-material", null),
  corpusCase("ambiguity-canonical-noop", "ambiguity", "en-US", "spoken",
    "Englebart", ["Englebart", "Engelbart"], "human-material", null),
  corpusCase("locale-isolation", "locale-isolation", "zh-CN", "spoken",
    "Englebart", ["Engelbart"], "human-material", null),
  corpusCase("protected-code", "protected", "en-US", "spoken",
    "Englebart", ["Engelbart"], "protected-text", null),
  corpusCase("generated-range", "generated", "en-US", "spoken",
    "Englebart", ["Engelbart"], "generated-output", null),
]) satisfies readonly WikiProducerExpectedCase[];

export async function runLatinInternalEditQualification(
  measureLivePerformance = false,
) {
  const producerBytes = await readProducerBytes();
  const artifacts: WikiProducerArtifacts = Object.freeze({
    producerBytes,
    resourceBytes: RESOURCE_BYTES,
  });
  const corpusDigest = await digestWikiProducerCorpus(LATIN_INTERNAL_EDIT_CASES);
  if (corpusDigest === null) throw new Error("The Latin fitting corpus is invalid.");
  const identity = Object.freeze({
    producerId: "latin-internal-edit-v2" as const,
    producerVersion: "2.0.0",
    producerDigest: await digestWikiProducerArtifact(producerBytes),
    resourceId: "ascii-latin",
    resourceVersion: "1.0.0",
    resourceDigest: await digestWikiProducerArtifact(RESOURCE_BYTES),
  });
  const corpus = Object.freeze({
    corpusVersion: "latin-internal-edit-corpus/1",
    corpusDigest,
  });
  const candidateRelease: WikiQualifiedProducerRelease = Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
  });
  const manifest: WikiProducerQualificationManifest = Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    cases: LATIN_INTERNAL_EDIT_CASES,
    performanceBudget: Object.freeze({
      minimumCapacityEntries: CAPACITY,
      minimumLookupSamples: LOOKUPS,
      ...PERFORMANCE_BUDGET,
    }),
  });
  const receipt: WikiProducerCorpusRun = Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    outputs: Object.freeze(LATIN_INTERNAL_EDIT_CASES.map((item) => Object.freeze({
      caseId: item.caseId,
      appliedActionId: runCase(item, candidateRelease),
    }))),
    performance: measureLivePerformance
      ? await measurePerformance(candidateRelease)
      : QUALIFIED_PERFORMANCE_RECEIPT,
  });
  const qualification = await qualifyWikiProducerReleases([
    Object.freeze({ manifest, receipt, artifacts }),
  ]);
  return Object.freeze({ manifest, receipt, artifacts, qualification });
}

function runCase(
  item: WikiProducerExpectedCase,
  candidateRelease: WikiQualifiedProducerRelease,
): string | null {
  const candidateLocale = item.category === "locale-isolation"
    ? "en-US"
    : item.input.locale;
  const snapshot = compileWikiFitSnapshot(stateWithCanonicals(
    candidateLocale,
    item.input.candidateCanonicals,
  ), [candidateRelease]);
  const text = item.input.environment === "protected-text"
    ? `\`${item.input.observedForm}\``
    : item.input.environment === "generated-output"
      ? `${item.input.observedForm} source`
      : item.input.observedForm;
  const events = fitCommittedWikiText(snapshot, {
    locale: item.input.locale,
    channel: item.input.channel,
    text,
    ...(item.input.environment === "generated-output"
      ? { eligibleRanges: [{ start: item.input.observedForm.length + 1, end: text.length }] }
      : {}),
  }, new Set(["latin-internal-edit-v2"]));
  return events.length === 1 ? `canonical:${events[0].canonical}` : null;
}

async function measurePerformance(
  candidateRelease: WikiQualifiedProducerRelease,
): Promise<WikiProducerCorpusRun["performance"]> {
  const trials = Array.from(
    { length: PERFORMANCE_TRIALS },
    () => measurePerformanceTrial(candidateRelease),
  );
  return selectBestCompleteWikiPerformanceTrial(trials, PERFORMANCE_BUDGET);
}

function measurePerformanceTrial(
  candidateRelease: WikiQualifiedProducerRelease,
): WikiProducerCorpusRun["performance"] {
  const canonicals = Array.from({ length: CAPACITY }, (_, index) => capacityWord(index));
  const started = performance.now();
  const snapshot = compileWikiFitSnapshot(
    stateWithCanonicals("en-US", canonicals),
    [candidateRelease],
  );
  const compileMicros = Math.ceil((performance.now() - started) * 1_000);
  const samples: number[] = [];
  for (let index = 0; index < LOOKUPS; index += 1) {
    const canonical = canonicals[index % canonicals.length];
    const observed = `${canonical.slice(0, 3)}a${canonical.slice(4)}`;
    const lookupStarted = performance.now();
    fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: observed,
    }, new Set(["latin-internal-edit-v2"]));
    samples.push((performance.now() - lookupStarted) * 1_000);
  }
  samples.sort((left, right) => left - right);
  return Object.freeze({
    attemptedEntryCount: CAPACITY,
    compiledEntryCount: snapshot.stats.eligibleLexemeCount,
    overflowCount: Object.values(snapshot.buckets["en-US"])
      .filter((bucket) => bucket.overflow).length,
    compileMicros,
    lookupSampleCount: LOOKUPS,
    lookupP95Micros: Math.ceil(samples[Math.floor(samples.length * 0.95)] ?? 0),
  });
}

function stateWithCanonicals(
  locale: MatterLocale,
  canonicals: readonly string[],
): WikiState {
  const lexemes = canonicals.map((canonical, index): WikiLexeme => Object.freeze({
    id: index + 1,
    locale,
    canonical,
    scope: "both",
    provenance: "human-confirmed",
    confirmedAtRevision: 1,
  }));
  return Object.freeze({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: 1,
    nextLexemeId: lexemes.length + 1,
    automaticLearningSaturated: false,
    lexemes: Object.freeze(lexemes),
    termEvidence: Object.freeze([]),
    aliasEvidence: Object.freeze([]),
    authorities: Object.freeze([]),
    aliasTombstones: Object.freeze([]),
    lexemeTombstones: Object.freeze([]),
  });
}

function capacityWord(index: number): string {
  const prefix = letters(Math.floor(index / (26 * 26)), 2);
  const suffix = letters(index % (26 * 26), 2);
  return `${prefix}core${suffix}`;
}

function letters(value: number, count: number): string {
  let remaining = value;
  let result = "";
  for (let index = 0; index < count; index += 1) {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

export async function readProducerBytes(): Promise<Uint8Array> {
  const chunks = await Promise.all(PRODUCER_FILES.map(async (file) => {
    const bytes = await readFile(resolve(ROOT, file));
    return new TextEncoder().encode(`${file}\n${bytes.toString("utf8")}\n`);
  }));
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function corpusCase(
  caseId: string,
  category: WikiProducerExpectedCase["category"],
  locale: MatterLocale,
  channel: WikiProducerExpectedCase["input"]["channel"],
  observedForm: string,
  candidateCanonicals: readonly string[],
  environment: WikiProducerExpectedCase["input"]["environment"],
  expectedActionId: string | null,
): WikiProducerExpectedCase {
  return Object.freeze({
    caseId,
    category,
    input: Object.freeze({
      locale,
      channel,
      boundary: "word",
      observedForm,
      candidateCanonicals: Object.freeze(candidateCanonicals),
      environment,
    }),
    expectedActionId,
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runLatinInternalEditQualification(true);
  process.stdout.write(`${JSON.stringify({
    release: result.qualification.qualifiedProducers[0] ?? null,
    decision: result.qualification.decisions[0] ?? null,
    performance: result.receipt.performance,
  }, null, 2)}\n`);
}
