import { doubleMetaphone } from "double-metaphone";
import { pinyin, polyphonic } from "pinyin-pro";
import type { MatterLocale } from "../../../features/matter/config/locales";
import {
  findProtectedWikiSpans,
  isWikiRangeEligible,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
} from "../../../features/matter/wiki/canonicalize-wiki-text";
import type { WikiAdmissionObservation } from
  "../../../features/matter/wiki/wiki-admission";
import type { WikiAliasEvidenceProducer } from
  "../../../features/matter/wiki/wiki-learning-policy";
import {
  MAX_WIKI_FITTING_TARGETS,
  MAX_WIKI_OBSERVATIONS_PER_LEDGER,
  type WikiLexeme,
  type WikiObserveEvidenceEvent,
  type WikiState,
} from "../../../features/matter/wiki/wiki-model";

const MIN_ENGLISH_PHONETIC_GRAPHEMES = 3;
const MAX_FIT_GRAPHEMES = 48;
const MAX_FIT_BUCKET_SIZE = 8;
const LATIN_PHRASE = /^[A-Za-z]+(?:[ -][A-Za-z]+){0,3}$/u;
const HAN_WORD = /^\p{Script=Han}+$/u;
const WORD_SEGMENTERS = new Map<MatterLocale, Intl.Segmenter>();

export type QualificationPronunciationProducer = Extract<
  WikiAliasEvidenceProducer,
  "en-metaphone-v1" | "zh-exact-homophone-v1" | "zh-final-pair-v1"
>;

type PronunciationLexeme = Readonly<{
  locale: MatterLocale;
  canonical: string;
  folded: string;
}>;

type PronunciationBucket = Readonly<{
  overflow: boolean;
  lexemes: readonly PronunciationLexeme[];
}>;

type ProducerIndex = Readonly<Record<MatterLocale, Readonly<Record<
  string,
  PronunciationBucket
>>>>;

export type QualificationPronunciationSnapshot = Readonly<{
  producers: readonly QualificationPronunciationProducer[];
  indexes: Readonly<Record<QualificationPronunciationProducer, ProducerIndex>>;
  stats: Readonly<Record<QualificationPronunciationProducer, Readonly<{
    eligibleLexemeCount: number;
    bucketCount: number;
    overflowBucketCount: number;
  }>>>;
}>;

export type QualificationPronunciationResult = Readonly<{
  status: "ok" | "censored";
  events: readonly WikiObserveEvidenceEvent[];
}>;

/**
 * Builds qualification-only pronunciation indexes from an explicit producer
 * set. This module is outside the product runtime so its pinned dictionaries
 * can be measured without becoming downloadable application code.
 */
export function compileQualificationPronunciationSnapshot(
  state: WikiState,
  producers: ReadonlySet<QualificationPronunciationProducer>,
): QualificationPronunciationSnapshot {
  const orderedProducers = Object.freeze([...producers].sort(compareText));
  const mutable = Object.fromEntries(PRONUNCIATION_PRODUCERS.map((producer) => [
    producer,
    localeMaps(),
  ])) as Record<QualificationPronunciationProducer, ReturnType<typeof localeMaps>>;
  const eligible = Object.fromEntries(PRONUNCIATION_PRODUCERS.map((producer) => [
    producer,
    0,
  ])) as Record<QualificationPronunciationProducer, number>;

  const rankedLexemes = [...state.lexemes].sort((left, right) =>
    (right.confirmedAtRevision ?? 0) - (left.confirmedAtRevision ?? 0) ||
    right.id - left.id);
  for (const lexeme of rankedLexemes) {
    if (lexeme.scope === "written") continue;
    const candidate = toPronunciationLexeme(lexeme);
    if (candidate === null) continue;
    for (const producer of orderedProducers) {
      if (eligible[producer] >= MAX_WIKI_FITTING_TARGETS) continue;
      const keys = producerKeys(producer, candidate.locale, candidate.canonical);
      if (keys === null || keys.length === 0) continue;
      for (const key of keys) addBucket(mutable[producer][candidate.locale], key, candidate);
      eligible[producer] += 1;
    }
  }

  const indexes = {} as Record<QualificationPronunciationProducer, ProducerIndex>;
  const stats = {} as Record<
    QualificationPronunciationProducer,
    QualificationPronunciationSnapshot["stats"][QualificationPronunciationProducer]
  >;
  for (const producer of PRONUNCIATION_PRODUCERS) {
    let bucketCount = 0;
    let overflowBucketCount = 0;
    indexes[producer] = freezeLocaleBuckets(mutable[producer], () => {
      bucketCount += 1;
    }, () => {
      overflowBucketCount += 1;
    });
    stats[producer] = Object.freeze({
      eligibleLexemeCount: eligible[producer],
      bucketCount,
      overflowBucketCount,
    });
  }
  return Object.freeze({
    producers: orderedProducers,
    indexes: Object.freeze(indexes),
    stats: Object.freeze(stats),
  });
}

export function fitQualificationPronunciationText(
  snapshot: QualificationPronunciationSnapshot,
  request: WikiAdmissionObservation,
  producer: QualificationPronunciationProducer,
): readonly WikiObserveEvidenceEvent[] {
  return fitQualificationPronunciationTextResult(snapshot, request, producer).events;
}

export function fitQualificationPronunciationTextResult(
  snapshot: QualificationPronunciationSnapshot,
  request: WikiAdmissionObservation,
  producer: QualificationPronunciationProducer,
): QualificationPronunciationResult {
  if (!snapshot.producers.includes(producer) || request.channel !== "spoken" ||
      request.text.length === 0) {
    return Object.freeze({ status: "censored", events: Object.freeze([]) });
  }
  const eligibleRanges = normalizeWikiEligibleRanges(
    request.eligibleRanges,
    request.text.length,
  );
  if (eligibleRanges === null) {
    return Object.freeze({ status: "censored", events: Object.freeze([]) });
  }
  const protectedSpans = findProtectedWikiSpans(request.text);
  const words = [...wordSegmenter(request.locale).segment(request.text)].flatMap((segment) => {
    if (!segment.isWordLike) return [];
    const start = segment.index;
    const end = start + segment.segment.length;
    if (!isWikiRangeEligible(start, end, eligibleRanges, 0) ||
        wikiRangeOverlapsProtected(start, end, protectedSpans, 0)) return [];
    return [Object.freeze({ start, end })];
  });
  const events = new Map<string, WikiObserveEvidenceEvent>();
  for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
    for (let endIndex = startIndex; endIndex < Math.min(words.length, startIndex + 4);
      endIndex += 1) {
      const first = words[startIndex];
      const last = words[endIndex];
      const previous = words[endIndex - 1];
      if (endIndex > startIndex && previous !== undefined &&
          !/^\s*$/u.test(request.text.slice(previous.end, last.start))) break;
      const form = request.text.slice(first.start, last.end).normalize("NFC");
      const keys = producerKeys(producer, request.locale, form);
      if (keys === null) continue;
      const candidate = uniqueCandidate(
        snapshot.indexes[producer][request.locale],
        keys,
        form,
        request.locale,
      );
      if (candidate === null ||
          (producer === "en-metaphone-v1" &&
            !isPlausibleEnglishPhoneticRelation(form, candidate.canonical))) continue;
      const event: WikiObserveEvidenceEvent = Object.freeze({
        type: "observe-evidence",
        locale: request.locale,
        channel: "spoken",
        boundary: "word",
        form,
        canonical: candidate.canonical,
        source: "machine-inference",
        producer,
      });
      events.set(JSON.stringify([request.locale, form, candidate.canonical]), event);
      if (events.size > MAX_WIKI_OBSERVATIONS_PER_LEDGER) {
        return Object.freeze({ status: "censored", events: Object.freeze([]) });
      }
    }
  }
  return Object.freeze({
    status: "ok",
    events: Object.freeze([...events.values()].sort(compareEvent)),
  });
}

const PRONUNCIATION_PRODUCERS = Object.freeze([
  "en-metaphone-v1",
  "zh-exact-homophone-v1",
  "zh-final-pair-v1",
] as const satisfies readonly QualificationPronunciationProducer[]);

function producerKeys(
  producer: QualificationPronunciationProducer,
  locale: MatterLocale,
  value: string,
): readonly string[] | null {
  if (producer === "en-metaphone-v1") {
    return locale === "en-US" ? englishPronunciationKeys(value) : null;
  }
  if ((locale !== "zh-CN" && locale !== "zh-TW") || !HAN_WORD.test(value) ||
      (producer === "zh-final-pair-v1" && locale !== "zh-CN")) return null;
  const keys = chinesePronunciationKeys(value, locale);
  if (keys === null) return null;
  return producer === "zh-final-pair-v1" ? keys.near : keys.exact;
}

function englishPronunciationKeys(value: string): readonly string[] | null {
  if (!LATIN_PHRASE.test(value)) return null;
  const folded = value.toLocaleLowerCase("en-US");
  if (folded.length < MIN_ENGLISH_PHONETIC_GRAPHEMES ||
      folded.length > MAX_FIT_GRAPHEMES) return null;
  const wordCodes = folded.split(/[ -]/u).map((word) =>
    [...new Set(doubleMetaphone(word).filter((code) => code.length > 0))]);
  if (wordCodes.some((codes) => codes.length === 0)) return null;
  let phrases: string[] = [""];
  for (const codes of wordCodes) {
    phrases = phrases.flatMap((phrase) => codes.map((code) =>
      phrase.length === 0 ? code : `${phrase}|${code}`));
    if (phrases.length > 16) return null;
  }
  return Object.freeze([...new Set(phrases)].map((code) => `en:${code}`));
}

function chinesePronunciationKeys(
  value: string,
  locale: "zh-CN" | "zh-TW",
): Readonly<{ exact: readonly string[]; near: readonly string[] }> | null {
  const points = Array.from(value);
  if (points.length === 0 || points.length > 16) return null;
  if (points.length === 1) {
    const readings = new Set(polyphonic(value, {
      type: "array",
      toneType: "num",
      traditional: locale === "zh-TW",
    })[0] ?? []);
    if (readings.size !== 1) return null;
  }
  const syllables = pinyin(value, {
    type: "array",
    toneType: "num",
    traditional: locale === "zh-TW",
    nonZh: "removed",
    segmentit: 1,
  });
  if (syllables.length !== points.length || syllables.some((item) => item.length === 0)) {
    return null;
  }
  const exact = `zh:${syllables.join("|")}`;
  const near: string[] = [];
  syllables.forEach((syllable, index) => {
    const normalized = normalizeFinalPair(syllable);
    if (normalized === null) return;
    const copy = [...syllables];
    copy[index] = normalized;
    near.push(`zh-near:${index}:${copy.join("|")}`);
  });
  return Object.freeze({ exact: Object.freeze([exact]), near: Object.freeze(near) });
}

function normalizeFinalPair(syllable: string): string | null {
  const match = /^(.*?)([1-5])$/.exec(syllable);
  if (match === null) return null;
  const [, body, tone] = match;
  for (const [short, long, marker] of [
    ["an", "ang", "A"],
    ["en", "eng", "E"],
    ["in", "ing", "I"],
  ] as const) {
    if (body.endsWith(long)) return `${body.slice(0, -long.length)}${marker}${tone}`;
    if (body.endsWith(short)) return `${body.slice(0, -short.length)}${marker}${tone}`;
  }
  return null;
}

function toPronunciationLexeme(lexeme: WikiLexeme): PronunciationLexeme | null {
  const folded = fold(lexeme.canonical, lexeme.locale);
  const length = Array.from(folded).length;
  if (length === 0 || length > MAX_FIT_GRAPHEMES) return null;
  return Object.freeze({
    locale: lexeme.locale,
    canonical: lexeme.canonical,
    folded,
  });
}

function uniqueCandidate(
  index: Readonly<Record<string, PronunciationBucket>>,
  keys: readonly string[],
  form: string,
  locale: MatterLocale,
): PronunciationLexeme | null {
  const candidates = new Map<string, PronunciationLexeme>();
  const foldedForm = fold(form, locale);
  for (const key of keys) {
    const bucket = index[key];
    if (bucket === undefined || bucket.overflow) continue;
    for (const candidate of bucket.lexemes) {
      if (candidate.folded === foldedForm) return null;
      candidates.set(candidate.canonical, candidate);
    }
  }
  return candidates.size === 1 ? [...candidates.values()][0] ?? null : null;
}

function addBucket(
  target: Map<string, PronunciationLexeme[]>,
  key: string,
  candidate: PronunciationLexeme,
): void {
  const bucket = target.get(key);
  if (bucket === undefined) target.set(key, [candidate]);
  else if (bucket.length <= MAX_FIT_BUCKET_SIZE) bucket.push(candidate);
}

function localeMaps(): Record<MatterLocale, Map<string, PronunciationLexeme[]>> {
  return Object.fromEntries([
    "zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE",
  ].map((locale) => [locale, new Map<string, PronunciationLexeme[]>()])) as Record<
    MatterLocale,
    Map<string, PronunciationLexeme[]>
  >;
}

function freezeLocaleBuckets(
  input: ReturnType<typeof localeMaps>,
  onBucket: () => void,
  onOverflow: () => void,
): ProducerIndex {
  return Object.freeze(Object.fromEntries(Object.entries(input).map(
    ([locale, index]) => [locale, freezeBuckets(index, onBucket, onOverflow)],
  )) as Record<MatterLocale, Readonly<Record<string, PronunciationBucket>>>);
}

function freezeBuckets(
  input: ReadonlyMap<string, readonly PronunciationLexeme[]>,
  onBucket: () => void,
  onOverflow: () => void,
): Readonly<Record<string, PronunciationBucket>> {
  const output: Record<string, PronunciationBucket> = Object.create(null) as
    Record<string, PronunciationBucket>;
  for (const key of [...input.keys()].sort(compareText)) {
    onBucket();
    const values = input.get(key) ?? [];
    const overflow = values.length > MAX_FIT_BUCKET_SIZE;
    if (overflow) onOverflow();
    output[key] = Object.freeze({
      overflow,
      lexemes: overflow
        ? Object.freeze([])
        : Object.freeze([...values].sort((left, right) =>
            compareText(left.canonical, right.canonical))),
    });
  }
  return Object.freeze(output);
}

/** Double Metaphone is only a recall index; orthographic proximity remains an
 * independent qualification gate for distant collisions. */
function isPlausibleEnglishPhoneticRelation(form: string, canonical: string): boolean {
  const foldedForm = form.toLocaleLowerCase("en-US");
  const foldedCanonical = canonical.toLocaleLowerCase("en-US");
  if (foldedForm.replaceAll("x", "cs") === foldedCanonical.replaceAll("x", "cs")) {
    return true;
  }
  const left = Array.from(foldedForm);
  const right = Array.from(foldedCanonical);
  const maximumDistance = Math.max(left.length, right.length) <= 5
    ? Math.max(left.length, right.length)
    : 1;
  if (Math.abs(left.length - right.length) > maximumDistance) return false;
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0));
  for (let row = 0; row <= left.length; row += 1) rows[row]![0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0]![column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    let rowMinimum = Number.POSITIVE_INFINITY;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = rows[row - 1]![column - 1]! +
        (left[row - 1] === right[column - 1] ? 0 : 1);
      let distance = Math.min(
        rows[row - 1]![column]! + 1,
        rows[row]![column - 1]! + 1,
        substitution,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] &&
          left[row - 2] === right[column - 1]) {
        distance = Math.min(distance, rows[row - 2]![column - 2]! + 1);
      }
      rows[row]![column] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maximumDistance) return false;
  }
  return rows[left.length]![right.length]! <= maximumDistance;
}

function wordSegmenter(locale: MatterLocale): Intl.Segmenter {
  const cached = WORD_SEGMENTERS.get(locale);
  if (cached !== undefined) return cached;
  const created = new Intl.Segmenter(locale, { granularity: "word" });
  WORD_SEGMENTERS.set(locale, created);
  return created;
}

function fold(value: string, locale: MatterLocale): string {
  return value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC");
}

function compareEvent(left: WikiObserveEvidenceEvent, right: WikiObserveEvidenceEvent): number {
  if (left.source !== "machine-inference" || right.source !== "machine-inference") return 0;
  return compareText(left.locale, right.locale) || compareText(left.form, right.form) ||
    compareText(left.canonical, right.canonical) || compareText(left.producer, right.producer);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
