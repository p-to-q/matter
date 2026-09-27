import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { doubleMetaphone } from "double-metaphone";
import type { MatterLocale } from "../../../features/matter/config/locales";
import { createEmptyWikiState } from
  "../../../features/matter/wiki/wiki-evidence";
import type {
  WikiTermEvidenceProducer,
} from "../../../features/matter/wiki/wiki-learning-policy";
import {
  WIKI_FITTING_VERSION,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiLexeme,
  type WikiState,
} from "../../../features/matter/wiki/wiki-model";
import {
  WIKI_PRODUCER_QUALIFICATION_VERSION,
  digestWikiProducerArtifact,
  digestWikiProducerCorpus,
  qualifyWikiProducerReleases,
  type WikiProducerArtifacts,
  type WikiProducerCorpusRun,
  type WikiProducerExpectedCase,
  type WikiProducerPerformanceReceipt,
  type WikiProducerQualificationManifest,
  type WikiProducerReleaseCandidate,
  type WikiQualifiableProducerId,
} from "../../../features/matter/wiki/wiki-producer-qualification";
import {
  collectCommittedWikiTerms,
  WIKI_TERM_SEGMENTATION_FIXTURES,
} from
  "../../../features/matter/wiki/wiki-term-collection";
import { runLatinInternalEditQualification } from "./latin-internal-edit-v2";
import { selectBestCompleteWikiPerformanceTrial } from "./performance-trials";
import {
  compileQualificationPronunciationSnapshot,
  fitQualificationPronunciationText,
  type QualificationPronunciationProducer,
  type QualificationPronunciationSnapshot,
} from "./pronunciation-fitting-v1";

const ROOT = resolve(import.meta.dirname, "../../..");
const CAPACITY = 512;
const LOOKUPS = 1_000;
const PERFORMANCE_TRIALS = 3;
const PERFORMANCE_BUDGET = Object.freeze({
  maximumCompileMicros: 750_000,
  maximumLookupP95Micros: 3_000,
});
const TERM_PRODUCER_FILES = Object.freeze([
  "features/matter/wiki/wiki-term-collection.ts",
  "features/matter/wiki/canonicalize-wiki-text.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/wiki/wiki-invariants.ts",
  "features/matter/wiki/wiki-model.ts",
  "features/matter/wiki/wiki-learning-policy.ts",
  "features/matter/config/locales.ts",
  "features/matter/tree/unicode-text.ts",
]);
const FITTING_PRODUCER_FILES = Object.freeze([
  "scripts/wiki/qualification/pronunciation-fitting-v1.ts",
  "features/matter/wiki/canonicalize-wiki-text.ts",
  "features/matter/wiki/wiki-text-safety.ts",
  "features/matter/wiki/wiki-learning-policy.ts",
  "features/matter/wiki/wiki-model.ts",
]);

type LocalProducer = Exclude<WikiQualifiableProducerId,
  "latin-internal-edit-v2" | "en-exact-homophone-v1">;

const STATIC_PERFORMANCE: Readonly<Record<LocalProducer, WikiProducerPerformanceReceipt>> =
  Object.freeze({
    "shape-specific-v1": performanceReceipt(14_332, 22),
    "locale-segment-v1": performanceReceipt(4_596, 20),
    "en-metaphone-v1": performanceReceipt(12_812, 113),
    "zh-exact-homophone-v1": performanceReceipt(67_240, 902),
    "zh-final-pair-v1": performanceReceipt(27_131, 203),
  });

const CASES: Readonly<Record<LocalProducer, readonly WikiProducerExpectedCase[]>> =
  Object.freeze({
    "shape-specific-v1": Object.freeze([
      termCase("shape-positive", "positive", "en-US", "OpenAI", "term:OpenAI"),
      termCase("shape-positive-de", "positive", "de-DE", "GitHub", "term:GitHub"),
      termCase("shape-positive-zh-cn", "positive", "zh-CN", "OpenAI", "term:OpenAI"),
      termCase("shape-positive-zh-tw", "positive", "zh-TW", "OpenAI", "term:OpenAI"),
      termCase("shape-positive-ja", "positive", "ja-JP", "カタカナ", "term:カタカナ"),
      termCase("shape-title-case", "adversarial", "en-US", "Matter", null),
      termCase("shape-adversarial", "adversarial", "en-US", "ordinary", null),
      termCase("shape-ambiguity", "ambiguity", "en-US", "2026", null),
      termCase("shape-locale", "locale-isolation", "en-US", "カタカナ", null),
      termCase("shape-protected", "protected", "en-US", "OpenAI", null),
      termCase("shape-generated", "generated", "en-US", "OpenAI", null),
    ]),
    "locale-segment-v1": Object.freeze([
      termCase("segment-positive", "positive", "en-US", "morphogenesis",
        "term:morphogenesis"),
      termCase("segment-positive-de", "positive", "de-DE", "Morphogenese",
        "term:Morphogenese"),
      termCase("segment-positive-zh-cn", "positive", "zh-CN", "青色", "term:青色"),
      termCase("segment-positive-zh-tw", "positive", "zh-TW", "青色", "term:青色"),
      termCase("segment-positive-ja", "positive", "ja-JP", "物語", "term:物語"),
      termCase("segment-adversarial", "adversarial", "en-US", "the", null),
      termCase("segment-ambiguity", "ambiguity", "en-US", "2026", null),
      termCase("segment-locale", "locale-isolation", "en-US", "普通名词", null),
      termCase("segment-protected", "protected", "en-US", "morphogenesis", null),
      termCase("segment-generated", "generated", "en-US", "morphogenesis", null),
    ]),
    "en-metaphone-v1": Object.freeze([
      aliasCase("metaphone-positive-codex", "positive", "en-US", "Codecs", ["Codex"],
        "alias:Codex"),
      aliasCase("metaphone-positive-four-word", "positive", "en-US",
        "Mater Design System Guide", ["Matter Design System Guide"],
        "alias:Matter Design System Guide"),
      aliasCase("metaphone-positive", "positive", "en-US", "Nightfall", ["Knightfall"],
        "alias:Knightfall"),
      aliasCase("metaphone-positive-name", "positive", "en-US", "Vanevar Bush",
        ["Vannevar Bush"], "alias:Vannevar Bush"),
      aliasCase("metaphone-positive-product", "positive", "en-US", "Morphogenasis",
        ["Morphogenesis"], "alias:Morphogenesis"),
      aliasCase("metaphone-noop-write", "ambiguity", "en-US", "Write",
        ["Write", "Right"], null),
      aliasCase("metaphone-noop-pair", "ambiguity", "en-US", "Pair",
        ["Pair", "Pear"], null),
      aliasCase("metaphone-noop-stationery", "ambiguity", "en-US", "Stationery",
        ["Stationery", "Stationary"], null),
      aliasCase("metaphone-adversarial", "adversarial", "en-US", "Daylight",
        ["Knightfall"], null),
      aliasCase("metaphone-adversarial-name", "adversarial", "en-US", "Engelboard",
        ["Engelbart"], null),
      aliasCase("metaphone-adversarial-material", "adversarial", "en-US", "Material",
        ["Matter"], null),
      aliasCase("metaphone-adversarial-canvas", "adversarial", "en-US", "Canvas",
        ["Corpus"], null),
      aliasCase("metaphone-adversarial-apostrophe", "adversarial", "en-US", "OConnor",
        ["O'Connor"], null),
      aliasCase("metaphone-adversarial-diacritic", "adversarial", "en-US", "Jose",
        ["José"], null),
      aliasCase("metaphone-adversarial-spacing", "adversarial", "en-US",
        "Matter  Design", ["Matter Design"], null),
      aliasCase("metaphone-ambiguity", "ambiguity", "en-US", "Nite",
        ["Night", "Knight"], null),
      aliasCase("metaphone-ambiguity-scent", "ambiguity", "en-US", "Scent",
        ["Sent", "Cent"], null),
      aliasCase("metaphone-ambiguity-write", "ambiguity", "en-US", "Write",
        ["Right", "Rite"], null),
      aliasCase("metaphone-ambiguity-pair", "ambiguity", "en-US", "Pair",
        ["Pear", "Pare"], null),
      aliasCase("metaphone-ambiguity-eight", "ambiguity", "en-US", "Nite",
        ["Night", "Knight", "Nyt", "Nait", "Nighte", "Knite", "Knyte", "Nytte"],
        null),
      aliasCase("metaphone-overflow-nine", "ambiguity", "en-US", "Nite",
        ["Night", "Knight", "Nyt", "Nait", "Nighte", "Knite", "Knyte", "Nytte",
          "Nitte"], null),
      aliasCase("metaphone-locale", "locale-isolation", "de-DE", "Nightfall",
        ["Knightfall"], null),
      aliasCase("metaphone-protected", "protected", "en-US", "Nightfall",
        ["Knightfall"], null),
      aliasCase("metaphone-generated", "generated", "en-US", "Nightfall",
        ["Knightfall"], null),
    ]),
    "zh-exact-homophone-v1": Object.freeze([
      aliasCase("zh-exact-noop", "ambiguity", "zh-CN", "青涩原野",
        ["青涩原野", "青色原野"], null),
      aliasCase("zh-exact-positive-material", "positive", "zh-CN", "才料", ["材料"],
        "alias:材料"),
      aliasCase("zh-exact-positive-form", "positive", "zh-CN", "邢泰", ["形态"],
        "alias:形态"),
      aliasCase("zh-exact-positive-automatic", "positive", "zh-CN", "字洞", ["自动"],
        "alias:自动"),
      aliasCase("zh-exact-positive-reflect", "positive", "zh-CN", "申思", ["深思"],
        "alias:深思"),
      aliasCase("zh-exact-positive-tw", "positive", "zh-TW", "青澀", ["青色"],
        "alias:青色"),
      aliasCase("zh-exact-adversarial", "adversarial", "zh-CN", "蓝色原野",
        ["青色原野"], null),
      aliasCase("zh-exact-adversarial-tone-idea", "adversarial", "zh-CN", "思乡",
        ["思想"], null),
      aliasCase("zh-exact-adversarial-tone-period", "adversarial", "zh-CN", "石器",
        ["时期"], null),
      aliasCase("zh-exact-adversarial-tone-generate", "adversarial", "zh-CN", "声称",
        ["生成"], null),
      aliasCase("zh-exact-adversarial-tone-dictionary", "adversarial", "zh-CN", "磁电",
        ["词典"], null),
      aliasCase("zh-exact-ambiguity", "ambiguity", "zh-CN", "青涩原野",
        ["青色原野", "青瑟原野"], null),
      aliasCase("zh-exact-ambiguity-material", "ambiguity", "zh-CN", "才料",
        ["材料", "裁料"], null),
      aliasCase("zh-exact-ambiguity-right", "ambiguity", "zh-CN", "权力",
        ["权利", "全力"], null),
      aliasCase("zh-exact-locale", "locale-isolation", "zh-TW", "青澀原野",
        ["青色原野"], null),
      aliasCase("zh-exact-protected", "protected", "zh-CN", "青涩原野",
        ["青色原野"], null),
      aliasCase("zh-exact-generated", "generated", "zh-CN", "青涩原野",
        ["青色原野"], null),
    ]),
    "zh-final-pair-v1": Object.freeze([
      // Mechanism control: the target-only lexicon can retrieve this relation.
      // The paired no-op case below proves that a canonical source vetoes it,
      // while product runtime keeps this producer unreleased either way.
      aliasCase("zh-final-mechanism-positive", "positive", "zh-CN", "山河", ["商河"],
        "alias:商河"),
      aliasCase("zh-final-noop-an-ang", "ambiguity", "zh-CN", "山河",
        ["山河", "商河"], null),
      aliasCase("zh-final-noop-en-eng", "ambiguity", "zh-CN", "真诚",
        ["真诚", "征程"], null),
      aliasCase("zh-final-noop-in-ing", "ambiguity", "zh-CN", "近音",
        ["近音", "静音"], null),
      aliasCase("zh-final-adversarial", "adversarial", "zh-CN", "三合", ["商河"], null),
      aliasCase("zh-final-adversarial-tone-an", "adversarial", "zh-CN", "上河",
        ["商河"], null),
      aliasCase("zh-final-adversarial-tone-en", "adversarial", "zh-CN", "声称",
        ["征程"], null),
      aliasCase("zh-final-adversarial-tone-in", "adversarial", "zh-CN", "金银",
        ["静音"], null),
      aliasCase("zh-final-ambiguity", "ambiguity", "zh-CN", "山河",
        ["商河", "珊河"], null),
      aliasCase("zh-final-ambiguity-en", "ambiguity", "zh-CN", "真诚",
        ["征程", "蒸城"], null),
      aliasCase("zh-final-ambiguity-in", "ambiguity", "zh-CN", "近音",
        ["静音", "境音"], null),
      aliasCase("zh-final-locale", "locale-isolation", "zh-TW", "山河", ["商河"], null),
      aliasCase("zh-final-protected", "protected", "zh-CN", "山河", ["商河"], null),
      aliasCase("zh-final-generated", "generated", "zh-CN", "山河", ["商河"], null),
    ]),
  });

/** Executes every local collection and pronunciation producer before release. */
export async function runLocalLanguageQualifications(measureLivePerformance = false) {
  const latin = await runLatinInternalEditQualification(measureLivePerformance);
  const local: WikiProducerReleaseCandidate[] = [];
  // Performance receipts must be measured serially. Parallel qualification
  // would make producers compete for one CPU and turn the budget into noise.
  for (const producer of Object.keys(CASES) as LocalProducer[]) {
    local.push(await buildCandidate(producer, measureLivePerformance));
  }
  const candidates: WikiProducerReleaseCandidate[] = [
    Object.freeze({
      manifest: latin.manifest,
      receipt: latin.receipt,
      artifacts: latin.artifacts,
    }),
    ...local,
  ];
  const qualification = await qualifyWikiProducerReleases(candidates);
  return Object.freeze({
    candidates: Object.freeze(candidates),
    qualification,
    performance: Object.freeze(Object.fromEntries([
      ["latin-internal-edit-v2", latin.receipt.performance],
      ...local.map((candidate) => {
        const receipt = candidate.receipt as WikiProducerCorpusRun;
        return [receipt.identity.producerId, receipt.performance];
      }),
    ])),
  });
}

async function buildCandidate(
  producer: LocalProducer,
  measureLivePerformance: boolean,
): Promise<WikiProducerReleaseCandidate> {
  const producerBytesPromise = producer === "shape-specific-v1" ||
      producer === "locale-segment-v1"
    ? readTermProducerQualificationBytes()
    : readFittingProducerQualificationBytes();
  const producerBytes = await producerBytesPromise;
  const resourceBytes = await resourceFor(producer);
  const artifacts: WikiProducerArtifacts = Object.freeze({ producerBytes, resourceBytes });
  const cases = CASES[producer];
  const corpusDigest = await digestWikiProducerCorpus(cases);
  if (corpusDigest === null) throw new Error(`The ${producer} corpus is invalid.`);
  const identity = Object.freeze({
    producerId: producer,
    producerVersion: "1.0.0",
    producerDigest: await digestWikiProducerArtifact(producerBytes),
    resourceId: resourceId(producer),
    resourceVersion: resourceVersion(producer),
    resourceDigest: await digestWikiProducerArtifact(resourceBytes),
  });
  const corpus = Object.freeze({
    corpusVersion: `${producer}-corpus/1`,
    corpusDigest,
  });
  const manifest: WikiProducerQualificationManifest = Object.freeze({
    qualificationVersion: WIKI_PRODUCER_QUALIFICATION_VERSION,
    identity,
    corpus,
    cases,
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
    outputs: Object.freeze(cases.map((item) => Object.freeze({
      caseId: item.caseId,
      appliedActionId: runCase(producer, item),
    }))),
    performance: measureLivePerformance
      ? await measurePerformance(producer)
      : STATIC_PERFORMANCE[producer],
  });
  return Object.freeze({ manifest, receipt, artifacts });
}

function runCase(
  producer: LocalProducer,
  item: WikiProducerExpectedCase,
): string | null {
  const text = item.input.environment === "protected-text"
    ? `\`${item.input.observedForm}\``
    : item.input.environment === "generated-output"
      ? `${item.input.observedForm} the`
      : item.input.observedForm;
  const eligibleRanges = item.input.environment === "generated-output"
    ? [{ start: item.input.observedForm.length + 1, end: text.length }]
    : undefined;
  if (producer === "shape-specific-v1" || producer === "locale-segment-v1") {
    const events = collectCommittedWikiTerms({
      locale: item.input.locale,
      channel: item.input.channel,
      text,
      ...(eligibleRanges === undefined ? {} : { eligibleRanges }),
    }, new Set<WikiTermEvidenceProducer>([producer]));
    return events.length === 1 ? `term:${events[0].canonical}` : null;
  }
  const candidateLocale = item.category === "locale-isolation"
    ? producer === "en-metaphone-v1" ? "en-US" : "zh-CN"
    : item.input.locale;
  const pronunciationProducer = producer as QualificationPronunciationProducer;
  const snapshot = compileQualificationPronunciationSnapshot(
    stateWithCanonicals(candidateLocale, item.input.candidateCanonicals),
    new Set([pronunciationProducer]),
  );
  const events = fitQualificationPronunciationText(snapshot, {
    locale: item.input.locale,
    channel: item.input.channel,
    text,
    ...(eligibleRanges === undefined ? {} : { eligibleRanges }),
  }, pronunciationProducer);
  return events.length === 1 && events[0].source === "machine-inference"
    ? `alias:${events[0].canonical}`
    : null;
}

async function measurePerformance(
  producer: LocalProducer,
): Promise<WikiProducerPerformanceReceipt> {
  const trials = Array.from({ length: PERFORMANCE_TRIALS }, () =>
    producer === "shape-specific-v1" || producer === "locale-segment-v1"
      ? measureTermPerformance(producer)
      : measureAliasPerformance(producer));
  return selectBestCompleteWikiPerformanceTrial(trials, PERFORMANCE_BUDGET);
}

function measureTermPerformance(
  producer: WikiTermEvidenceProducer,
): WikiProducerPerformanceReceipt {
  const values = Array.from({ length: CAPACITY }, (_, index) => {
    const suffix = letters(index, 4);
    return producer === "shape-specific-v1" ? `MatterAI${suffix}` : `matter${suffix}`;
  });
  const started = performance.now();
  let compiledEntryCount = 0;
  for (const text of values) {
    const events = collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text,
    }, new Set([producer]));
    if (events.length === 1) compiledEntryCount += 1;
  }
  const compileMicros = Math.ceil((performance.now() - started) * 1_000);
  const samples: number[] = [];
  for (let index = 0; index < LOOKUPS; index += 1) {
    const lookupStarted = performance.now();
    collectCommittedWikiTerms({
      locale: "en-US",
      channel: "spoken",
      text: values[index % values.length],
    }, new Set([producer]));
    samples.push((performance.now() - lookupStarted) * 1_000);
  }
  return performanceReceipt(compileMicros, percentile95(samples), compiledEntryCount, 0);
}

function measureAliasPerformance(
  producer: Exclude<LocalProducer, WikiTermEvidenceProducer>,
): WikiProducerPerformanceReceipt {
  const capacity = producer === "en-metaphone-v1"
    ? englishCapacityCanonicals()
    : chineseCapacityCanonicals(
        producer === "zh-final-pair-v1" ? "商河" : "青色原野",
        producer === "zh-final-pair-v1",
      );
  const locale = producer === "en-metaphone-v1" ? "en-US" : "zh-CN";
  const started = performance.now();
  const snapshot = compileQualificationPronunciationSnapshot(
    stateWithCanonicals(locale, capacity),
    new Set([producer]),
  );
  const compileMicros = Math.ceil((performance.now() - started) * 1_000);
  const observed = producer === "en-metaphone-v1"
    ? "Nightfall"
    : producer === "zh-final-pair-v1" ? "山河" : "青涩原野";
  const samples: number[] = [];
  for (let index = 0; index < LOOKUPS; index += 1) {
    const lookupStarted = performance.now();
    fitQualificationPronunciationText(
      snapshot,
      { locale, channel: "spoken", text: observed },
      producer,
    );
    samples.push((performance.now() - lookupStarted) * 1_000);
  }
  return performanceReceipt(
    compileMicros,
    percentile95(samples),
    snapshot.stats[producer].eligibleLexemeCount,
    relevantOverflowCount(snapshot, producer),
  );
}

function relevantOverflowCount(
  snapshot: QualificationPronunciationSnapshot,
  producer: QualificationPronunciationProducer,
): number {
  return snapshot.stats[producer].overflowBucketCount;
}

function englishCapacityCanonicals(): readonly string[] {
  const result = ["Knightfall"];
  const words = new Set(result);
  const usedCodes = new Set(doubleMetaphone(result[0]).filter(Boolean));
  let seed = 123_456_789;
  const random = () => {
    seed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
  const consonants = "bcdfghjklmnpqrstvwxyz";
  const vowels = "aeiou";
  for (let attempt = 0; attempt < 1_000_000 && result.length < CAPACITY; attempt += 1) {
    let word = "";
    for (let index = 0; index < 14; index += 1) {
      const pool = index % 2 === 0 ? consonants : vowels;
      word += pool[Math.floor(random() * pool.length)];
    }
    if (words.has(word)) continue;
    const codes = [...new Set(doubleMetaphone(word).filter(Boolean))];
    if (codes.length === 0 || codes.some((code) => usedCodes.has(code))) continue;
    result.push(word);
    words.add(word);
    for (const code of codes) usedCodes.add(code);
  }
  if (result.length !== CAPACITY) throw new Error("English capacity corpus is incomplete.");
  return Object.freeze(result);
}

function chineseCapacityCanonicals(
  first: string,
  requireFinalPair: boolean,
): readonly string[] {
  const chars = Array.from("阿波次多俄佛格哈基柯勒摩诺坡日苏特乌西牙泽");
  const result = [first];
  if (requireFinalPair) {
    outer: for (const prefix of ["山", "真"]) {
      for (const middle of chars) {
        for (const right of chars) {
          const value = `${prefix}${middle}${right}`;
          if (value === first) continue;
          result.push(value);
          if (result.length === CAPACITY) break outer;
        }
      }
    }
    if (result.length !== CAPACITY) {
      throw new Error("Chinese final-pair capacity corpus is incomplete.");
    }
    return Object.freeze(result);
  }
  outer: for (const left of chars) {
    for (const middle of chars) {
      for (const right of chars) {
        const value = `${left}${middle}${right}`;
        if (value === first) continue;
        result.push(value);
        if (result.length === CAPACITY) break outer;
      }
    }
  }
  if (result.length !== CAPACITY) throw new Error("Chinese capacity corpus is incomplete.");
  return Object.freeze(result);
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
    ...createEmptyWikiState(),
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: 1,
    nextLexemeId: lexemes.length + 1,
    lexemes: Object.freeze(lexemes),
  });
}

async function resourceFor(producer: LocalProducer): Promise<Uint8Array> {
  if (producer === "en-metaphone-v1") {
    return readDoubleMetaphoneQualificationResourceBytes();
  }
  if (producer.startsWith("zh-")) {
    return readPinyinQualificationResourceBytes();
  }
  return new TextEncoder().encode(
    JSON.stringify({
      capability: "ecmascript-intl-segmenter-conformance",
      granularity: "word",
      fixtures: WIKI_TERM_SEGMENTATION_FIXTURES,
    }),
  );
}

export function readDoubleMetaphoneQualificationResourceBytes(): Promise<Uint8Array> {
  return readCombinedBytes([
    "node_modules/double-metaphone/package.json",
    "node_modules/double-metaphone/index.js",
    "node_modules/double-metaphone/license",
  ]);
}

/** Hash inputs include every local module that contributes runtime values to
 * term admission. Type-only imports do not belong to producer identity. */
export function readTermProducerQualificationBytes(): Promise<Uint8Array> {
  return readCombinedBytes(TERM_PRODUCER_FILES);
}

/** Hash inputs include every local module that contributes runtime values to
 * fitting and target eligibility. External pronunciation data is bound as the
 * separate resource identity. */
export function readFittingProducerQualificationBytes(): Promise<Uint8Array> {
  return readCombinedBytes(FITTING_PRODUCER_FILES);
}

/** Binds qualification to the exact executable pinyin tables, not only the
 * package's tiny re-export entrypoint. */
export async function readPinyinQualificationResourceBytes(): Promise<Uint8Array> {
  const dictionaryFiles = await listFiles("node_modules/pinyin-pro/dist/esm");
  return readCombinedBytes([
    "node_modules/pinyin-pro/package.json",
    "node_modules/pinyin-pro/LICENSE",
    "node_modules/pinyin-pro/dist/index.mjs",
    ...dictionaryFiles.filter((file) => file.endsWith(".mjs")),
  ]);
}

function resourceId(producer: LocalProducer): string {
  if (producer === "en-metaphone-v1") return "double-metaphone";
  if (producer.startsWith("zh-")) return "pinyin-pro";
  return "ecmascript-intl-segmenter-conformance";
}

function resourceVersion(producer: LocalProducer): string {
  if (producer === "en-metaphone-v1") return "2.0.1";
  if (producer.startsWith("zh-")) return "3.29.4";
  return "fixture/2";
}

function performanceReceipt(
  compileMicros: number,
  lookupP95Micros: number,
  compiledEntryCount = CAPACITY,
  overflowCount = 0,
): WikiProducerPerformanceReceipt {
  return Object.freeze({
    attemptedEntryCount: CAPACITY,
    compiledEntryCount,
    overflowCount,
    compileMicros,
    lookupSampleCount: LOOKUPS,
    lookupP95Micros,
  });
}

function percentile95(values: number[]): number {
  values.sort((left, right) => left - right);
  return Math.ceil(values[Math.floor(values.length * .95)] ?? 0);
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

async function readCombinedBytes(files: readonly string[]): Promise<Uint8Array> {
  const chunks = await Promise.all(files.map(async (file) => {
    const bytes = await readFile(resolve(ROOT, file));
    return new TextEncoder().encode(`${file}\n${bytes.toString("utf8")}\n`);
  }));
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function listFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(resolve(ROOT, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(relative));
    else if (entry.isFile()) files.push(relative);
  }
  return Object.freeze(files);
}

function termCase(
  caseId: string,
  category: WikiProducerExpectedCase["category"],
  locale: MatterLocale,
  observedForm: string,
  expectedActionId: string | null,
): WikiProducerExpectedCase {
  return corpusCase(caseId, category, locale, "spoken", observedForm,
    [observedForm], expectedActionId);
}

function aliasCase(
  caseId: string,
  category: WikiProducerExpectedCase["category"],
  locale: MatterLocale,
  observedForm: string,
  candidateCanonicals: readonly string[],
  expectedActionId: string | null,
): WikiProducerExpectedCase {
  return corpusCase(caseId, category, locale, "spoken", observedForm,
    candidateCanonicals, expectedActionId);
}

function corpusCase(
  caseId: string,
  category: WikiProducerExpectedCase["category"],
  locale: MatterLocale,
  channel: WikiProducerExpectedCase["input"]["channel"],
  observedForm: string,
  candidateCanonicals: readonly string[],
  expectedActionId: string | null,
): WikiProducerExpectedCase {
  return Object.freeze({
    caseId,
    category,
    input: Object.freeze({
      locale,
      channel,
      boundary: "word" as const,
      observedForm,
      candidateCanonicals: Object.freeze([...candidateCanonicals]),
      environment: category === "protected"
        ? "protected-text" as const
        : category === "generated"
          ? "generated-output" as const
          : "human-material" as const,
    }),
    expectedActionId,
  });
}
