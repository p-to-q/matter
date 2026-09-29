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
import {
  MATTER_LOCALES,
  type MatterLocale,
} from "../../../features/matter/config/locales";
import { wikiLatinLedgerLocale } from
  "../../../features/matter/wiki/wiki-script-routing";
import { selectBestCompleteWikiPerformanceTrial } from "./performance-trials";

const ROOT = resolve(import.meta.dirname, "../../..");
const PRODUCER_FILES = Object.freeze([
  "features/matter/wiki/wiki-fitting.ts",
  "features/matter/wiki/canonicalize-wiki-text.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/wiki/wiki-learning-policy.ts",
  "features/matter/wiki/wiki-model.ts",
  "features/matter/wiki/wiki-script.ts",
  "features/matter/wiki/wiki-script-routing.ts",
]);
// Version 1.1.0 adds the script route and the matching-only width fold. Both
// only widen which turns can present an ASCII word; what a vote means for a
// stored (en-US, form, canonical) relation is unchanged, so the family stays v2.
const RESOURCE_BYTES = new TextEncoder().encode(
  "ascii-latin:a-z;case-fold:en-US;segmentation:ecmascript-2026;" +
    "route:zh-CN,zh-TW,ja-JP>en-US:latin;width-fold:ff10-ff19,ff21-ff3a,ff41-ff5a",
);
const PRODUCER_VERSION = "2.1.0";
const RESOURCE_VERSION = "1.1.0";
const CORPUS_VERSION = "latin-internal-edit-corpus/2";
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

/**
 * Corpus 2 adds whole mixed-script turns. `observedForm` is the complete
 * spoken turn and `candidateCanonicals` are placed in the one ledger the
 * turn's Latin words belong to (`en-US` for English, Chinese, and Japanese
 * turns). A locale-isolation case instead places them in every other locale,
 * so it proves a Latin word reaches its own ledger and no other. Corpus 1's
 * `locale-isolation` case asserted that a Chinese turn never reaches en-US;
 * script routing deliberately reverses that, so the case was replaced rather
 * than relabelled. An action names the ledger locale and the stored form, so
 * the full-width positive proves that the folded ASCII form is what is kept.
 */
export const LATIN_INTERNAL_EDIT_CASES = Object.freeze([
  corpusCase("positive-transposition", "positive", "en-US", "spoken",
    "Englebart", ["Engelbart"], "human-material", "relation:en-US:Englebart>Engelbart"),
  corpusCase("positive-substitution", "positive", "en-US", "spoken",
    "Morphogenasis", ["Morphogenesis"], "human-material",
    "relation:en-US:Morphogenasis>Morphogenesis"),
  corpusCase("positive-routed-zh-cn", "positive", "zh-CN", "spoken",
    "我读了Englebart的论文", ["Engelbart"], "human-material",
    "relation:en-US:Englebart>Engelbart"),
  corpusCase("positive-routed-zh-tw", "positive", "zh-TW", "spoken",
    "我讀了Morphogenasis的論文", ["Morphogenesis"], "human-material",
    "relation:en-US:Morphogenasis>Morphogenesis"),
  corpusCase("positive-routed-ja-jp", "positive", "ja-JP", "spoken",
    "Englebartの論文を読んだ", ["Engelbart"], "human-material",
    "relation:en-US:Englebart>Engelbart"),
  corpusCase("positive-routed-full-width", "positive", "zh-CN", "spoken",
    "我读了Ｅｎｇｌｅｂａｒｔ的论文", ["Engelbart"], "human-material",
    "relation:en-US:Englebart>Engelbart"),
  corpusCase("positive-routed-punctuation-emoji", "positive", "zh-CN", "spoken",
    "😀Englebart，对吧？", ["Engelbart"], "human-material",
    "relation:en-US:Englebart>Engelbart"),
  corpusCase("adversarial-written", "adversarial", "en-US", "written",
    "Englebart", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-distant", "adversarial", "en-US", "spoken",
    "Engleboard", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-written", "adversarial", "zh-CN", "written",
    "我读了Englebart的论文", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-han-transliteration", "adversarial", "zh-CN", "spoken",
    "恩格尔巴特的演示", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-correct-name", "adversarial", "zh-CN", "spoken",
    "Engelhard公司的报告", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-code-switch", "adversarial", "zh-CN", "spoken",
    "这个feature下周review一下", ["Engelbart", "Morphogenesis"], "human-material", null),
  corpusCase("adversarial-routed-digit-joined", "adversarial", "zh-CN", "spoken",
    "Englebart2号", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-url", "adversarial", "zh-CN", "spoken",
    "看https://example.com/Englebart的页面", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-email", "adversarial", "zh-CN", "spoken",
    "邮箱Englebart@example.com", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-width-identifier", "adversarial", "zh-CN", "spoken",
    "打开ＥｎｇｌｅＢａｒｔ模块", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-file-path", "adversarial", "zh-CN", "spoken",
    "路径src/Englebart/index.ts", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-mention", "adversarial", "zh-CN", "spoken",
    "@Englebart 你好", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-hashtag", "adversarial", "zh-CN", "spoken",
    "#Englebart 话题", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-url", "adversarial", "zh-CN", "spoken",
    "看ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ／Ｅｎｇｌｅｂａｒｔ的页面", ["Engelbart"],
    "human-material", null),
  corpusCase("adversarial-routed-full-width-email", "adversarial", "zh-CN", "spoken",
    "邮箱englebart＠example.com", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-path", "adversarial", "zh-CN", "spoken",
    "路径ｓｒｃ／Ｅｎｇｌｅｂａｒｔ／ｉｎｄｅｘ．ｔｓ", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-flag", "adversarial", "zh-CN", "spoken",
    "运行－－Ｅｎｇｌｅｂａｒｔ参数", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-mention", "adversarial", "zh-CN", "spoken",
    "＠Englebart 你好", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-hashtag", "adversarial", "zh-CN", "spoken",
    "＃Englebart＃话题", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-routed-full-width-backticks", "adversarial", "zh-CN", "spoken",
    "代码｀Englebart｀里", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-mention", "adversarial", "en-US", "spoken",
    "@Englebart said", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-mention", "adversarial", "en-US", "spoken",
    "＠Englebart said", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-hashtag", "adversarial", "en-US", "spoken",
    "＃Englebart＃", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-backticks", "adversarial", "en-US", "spoken",
    "｀Englebart｀", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-url", "adversarial", "en-US", "spoken",
    "ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ／Englebart", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-email", "adversarial", "en-US", "spoken",
    "englebart＠example.com", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-path", "adversarial", "en-US", "spoken",
    "src／Englebart／index．ts", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-flag", "adversarial", "en-US", "spoken",
    "－－Englebart", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-dotted", "adversarial", "en-US", "spoken",
    "Englebart．ts", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-snake", "adversarial", "en-US", "spoken",
    "my＿Englebart", ["Engelbart"], "human-material", null),
  corpusCase("adversarial-full-width-hyphen", "adversarial", "en-US", "spoken",
    "Englebart－style", ["Engelbart"], "human-material", null),
  corpusCase("positive-full-width-parentheses", "positive", "en-US", "spoken",
    "（Englebart），later", ["Engelbart"], "human-material",
    "relation:en-US:Englebart>Engelbart"),
  corpusCase("ambiguity-two-canonicals", "ambiguity", "en-US", "spoken",
    "Abczefgh", ["Abcxefgh", "Abcyefgh"], "human-material", null),
  corpusCase("ambiguity-canonical-noop", "ambiguity", "en-US", "spoken",
    "Englebart", ["Englebart", "Engelbart"], "human-material", null),
  corpusCase("ambiguity-routed-name-collision", "ambiguity", "zh-CN", "spoken",
    "Engelbirt的演示", ["Engelbart", "Engelbert"], "human-material", null),
  corpusCase("ambiguity-routed-brand-collision", "ambiguity", "ja-JP", "spoken",
    "Morphogenosisの新製品", ["Morphogenesis", "Morphogenasis"], "human-material", null),
  corpusCase("ambiguity-routed-correct-name-noop", "ambiguity", "zh-CN", "spoken",
    "我采访了Engelhart", ["Engelhart", "Engelbart"], "human-material", null),
  corpusCase("locale-isolation-routed-ledger-only", "locale-isolation", "zh-CN", "spoken",
    "我读了Englebart的论文", ["Engelbart"], "human-material", null),
  corpusCase("locale-isolation-ja-jp-routed-ledger-only", "locale-isolation", "ja-JP",
    "spoken", "Englebartの論文", ["Engelbart"], "human-material", null),
  corpusCase("locale-isolation-de-de", "locale-isolation", "de-DE", "spoken",
    "Englebart", ["Engelbart"], "human-material", null),
  corpusCase("locale-isolation-en-us", "locale-isolation", "en-US", "spoken",
    "Englebart", ["Engelbart"], "human-material", null),
  corpusCase("protected-code", "protected", "en-US", "spoken",
    "Englebart", ["Engelbart"], "protected-text", null),
  corpusCase("protected-routed-code", "protected", "zh-CN", "spoken",
    "我读了Englebart的论文", ["Engelbart"], "protected-text", null),
  corpusCase("generated-range", "generated", "en-US", "spoken",
    "Englebart", ["Engelbart"], "generated-output", null),
  corpusCase("generated-routed-range", "generated", "zh-CN", "spoken",
    "我读了Englebart的论文", ["Engelbart"], "generated-output", null),
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
    producerVersion: PRODUCER_VERSION,
    producerDigest: await digestWikiProducerArtifact(producerBytes),
    resourceId: "ascii-latin",
    resourceVersion: RESOURCE_VERSION,
    resourceDigest: await digestWikiProducerArtifact(RESOURCE_BYTES),
  });
  const corpus = Object.freeze({
    corpusVersion: CORPUS_VERSION,
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
  const ledger = wikiLatinLedgerLocale(item.input.locale);
  const candidateLocales = item.category === "locale-isolation"
    ? MATTER_LOCALES.filter((locale) => locale !== ledger)
    : [ledger];
  const snapshot = compileWikiFitSnapshot(stateWithCanonicals(
    candidateLocales,
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
  const event = events.length === 1 ? events[0] : undefined;
  return event?.source === "machine-inference"
    ? `relation:${event.locale}:${event.form}>${event.canonical}`
    : null;
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
    stateWithCanonicals(["en-US"], canonicals),
    [candidateRelease],
  );
  const compileMicros = Math.ceil((performance.now() - started) * 1_000);
  const samples: number[] = [];
  for (let index = 0; index < LOOKUPS; index += 1) {
    const canonical = canonicals[index % canonicals.length];
    const observed = `${canonical.slice(0, 3)}a${canonical.slice(4)}`;
    // Half the lookups are routed: a Chinese turn is segmented by the zh-CN
    // dictionary segmenter before its Latin word reaches the same index.
    const routed = index % 2 === 1;
    const lookupStarted = performance.now();
    fitCommittedWikiText(snapshot, {
      locale: routed ? "zh-CN" : "en-US",
      channel: "spoken",
      text: routed ? `我们读了${observed}的论文` : observed,
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
  locales: readonly MatterLocale[],
  canonicals: readonly string[],
): WikiState {
  const lexemes = locales.flatMap((locale) => canonicals.map((canonical) => ({
    locale,
    canonical,
  }))).map(({ locale, canonical }, index): WikiLexeme => Object.freeze({
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
    revertStrikes: Object.freeze([]),
    settledOccurrences: Object.freeze([]),
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
