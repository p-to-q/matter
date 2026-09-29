import {
  findProtectedWikiSpans,
  isWikiRangeEligible,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
} from "./canonicalize-wiki-text";
import { isWikiCanonical } from "./wiki-invariants";
import {
  compareWikiTermProducerPrecedence,
  type WikiTermEvidenceProducer,
} from "./wiki-learning-policy";
import {
  MAX_WIKI_OBSERVATIONS_PER_BATCH,
  type WikiObserveEvidenceEvent,
} from "./wiki-model";
import type { WikiAdmissionObservation } from "./wiki-admission";
import type { MatterLocale } from "../config/locales";

const LATIN = /^[\p{Script=Latin}\p{M}]+$/u;
const HAN = /^\p{Script=Han}+$/u;
const JAPANESE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30fc]+$/u;
const HIRAGANA_ONLY = /^[\p{Script=Hiragana}\u30fc]+$/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const WORD_SEGMENTERS = new Map<MatterLocale, Intl.Segmenter>();
export const WIKI_TERM_SEGMENTATION_FIXTURES = Object.freeze([
  Object.freeze({ locale: "en-US" as const, text: "OpenAI morphogenesis",
    expected: Object.freeze(["OpenAI", "morphogenesis"]) }),
  Object.freeze({ locale: "de-DE" as const, text: "Morphogenese",
    expected: Object.freeze(["Morphogenese"]) }),
  Object.freeze({ locale: "zh-CN" as const, text: "青色原野",
    expected: Object.freeze(["青色", "原野"]) }),
  Object.freeze({ locale: "zh-TW" as const, text: "青色原野",
    expected: Object.freeze(["青色", "原野"]) }),
  Object.freeze({ locale: "ja-JP" as const, text: "カタカナ",
    expected: Object.freeze(["カタカナ"]) }),
]);
let segmenterConformance: boolean | null = null;

/** Locale stoplists remove grammatical glue, not unknown vocabulary. */
export const WIKI_TERM_STOPWORDS: Readonly<Record<MatterLocale, ReadonlySet<string>>> =
  Object.freeze({
    "en-US": frozenSet([
      "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
      "from", "had", "has", "have", "he", "her", "his", "i", "if", "in", "is",
      "it", "its", "me", "my", "not", "of", "on", "or", "our", "she", "so",
      "that", "the", "their", "them", "there", "they", "this", "to", "us", "was",
      "we", "were", "what", "when", "which", "who", "will", "with", "you", "your",
    ]),
    "de-DE": frozenSet([
      "aber", "als", "am", "an", "auch", "auf", "aus", "bei", "das", "der", "die",
      "ein", "eine", "einer", "eines", "er", "es", "für", "hat", "ich", "im", "in",
      "ist", "mit", "nicht", "oder", "sie", "sind", "und", "von", "war", "wir", "zu",
    ]),
    "zh-CN": frozenSet([
      "一个", "一些", "不是", "不能", "东西", "为什么", "什么", "他们", "以后", "但是",
      "你们", "可以", "因为", "如何", "已经", "应该", "我们", "所以", "时候", "是否",
      "没有", "然后", "现在", "的", "这个", "那个", "需要", "还是", "还有", "这里", "就是", "属于",
    ]),
    "zh-TW": frozenSet([
      "一個", "一些", "不是", "不能", "東西", "什麼", "他們", "以後", "但是", "你們", "可以",
      "因為", "如何", "已經", "應該", "我們", "所以", "時候", "是否", "沒有", "然後", "現在",
      "的", "這個", "那個", "需要", "還是", "還有", "這裡", "就是", "為什麼",
    ]),
    "ja-JP": frozenSet([
      "ある", "いる", "から", "ここ", "こと", "これ", "しかし", "そして", "それ", "ため",
      "です", "では", "でも", "という", "として", "ない", "なら", "なる", "ので", "もの",
      "よう", "わたし", "を", "この", "その", "あの", "する", "ます",
    ]),
  });

/**
 * Produces bounded canonical-term evidence from committed human material.
 * Shape is confidence evidence, never the definition of a word: distinctive
 * names and brands may surface after one turn, while ordinary locale segments
 * remain in the reservoir until they recur in another successful admission.
 */
export function collectCommittedWikiTerms(
  request: WikiAdmissionObservation,
  enabledProducers?: ReadonlySet<WikiTermEvidenceProducer>,
): readonly WikiObserveEvidenceEvent[] {
  return collectCommittedWikiTermsResult(request, enabledProducers).events;
}

export type WikiTermCollectionResult = Readonly<{
  status: "ok" | "censored";
  events: readonly WikiObserveEvidenceEvent[];
}>;

export function collectCommittedWikiTermsResult(
  request: WikiAdmissionObservation,
  enabledProducers?: ReadonlySet<WikiTermEvidenceProducer>,
): WikiTermCollectionResult {
  if (request.text.length === 0 || !wikiTermSegmenterConforms()) {
    return Object.freeze({ status: "censored", events: Object.freeze([]) });
  }
  const eligibleRanges = normalizeWikiEligibleRanges(
    request.eligibleRanges,
    request.text.length,
  );
  if (eligibleRanges === null) {
    return Object.freeze({ status: "censored", events: Object.freeze([]) });
  }
  const protectedSpans = findProtectedWikiSpans(request.text, "evidence");
  const segmenter = wordSegmenter(request.locale);
  const events = new Map<string, WikiObserveEvidenceEvent>();

  for (const segment of segmenter.segment(request.text)) {
    if (!segment.isWordLike) continue;
    const start = segment.index;
    const end = start + segment.segment.length;
    if (!isWikiRangeEligible(start, end, eligibleRanges, 0) ||
        wikiRangeOverlapsProtected(start, end, protectedSpans, 0)) continue;
    const canonical = segment.segment.normalize("NFC");
    const producer = classifyTerm(request.locale, canonical);
    if (producer === null || !isWikiCanonical(canonical) ||
        (enabledProducers !== undefined && !enabledProducers.has(producer))) continue;
    const event: WikiObserveEvidenceEvent = Object.freeze({
      type: "observe-evidence",
      locale: request.locale,
      canonical,
      source: "recent-material",
      producer,
    });
    const key = JSON.stringify([event.locale, event.canonical]);
    const previous = events.get(key);
    if (previous === undefined || (
      previous.source === "recent-material" &&
      compareWikiTermProducerPrecedence(producer, previous.producer) < 0
    )) events.set(key, event);
    if (events.size > MAX_WIKI_OBSERVATIONS_PER_BATCH) {
      return Object.freeze({ status: "censored", events: Object.freeze([]) });
    }
  }
  return Object.freeze({
    status: "ok",
    events: Object.freeze([...events.values()].sort((left, right) =>
      left.canonical.localeCompare(right.canonical, request.locale))),
  });
}

/** Fails term learning closed when the host ICU segmentation drifts. */
export function wikiTermSegmenterConforms(): boolean {
  if (segmenterConformance !== null) return segmenterConformance;
  try {
    segmenterConformance = WIKI_TERM_SEGMENTATION_FIXTURES.every((fixture) => {
      const actual = [...wordSegmenter(fixture.locale).segment(fixture.text)]
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment);
      return actual.length === fixture.expected.length &&
        actual.every((segment, index) => segment === fixture.expected[index]);
    });
  } catch {
    segmenterConformance = false;
  }
  return segmenterConformance;
}

function classifyTerm(
  locale: MatterLocale,
  canonical: string,
): WikiTermEvidenceProducer | null {
  const points = Array.from(canonical);
  if (points.length === 0 || points.length > 48 || /^\p{N}+$/u.test(canonical)) {
    return null;
  }
  const folded = canonical.toLocaleLowerCase(locale);
  if (WIKI_TERM_STOPWORDS[locale].has(folded)) return null;

  if (LATIN.test(canonical)) {
    if (points.length < 2) return null;
    const titleCaseOnly = UPPER.test(points[0] ?? "") &&
      points.slice(1).every((point) => !UPPER.test(point));
    const distinctive = points.every((point) =>
      point === point.toLocaleUpperCase(locale)) ||
      (UPPER.test(canonical) && LOWER.test(canonical) && !titleCaseOnly);
    if (distinctive) return "shape-specific-v1";
    return points.length >= 4 ? "locale-segment-v1" : null;
  }
  if ((locale === "zh-CN" || locale === "zh-TW") && HAN.test(canonical)) {
    return points.length >= 2 && points.length <= 12
      ? "locale-segment-v1"
      : null;
  }
  if (locale === "ja-JP" && JAPANESE.test(canonical)) {
    if (points.length < 2 || points.length > 16) return null;
    return HIRAGANA_ONLY.test(canonical) && points.length < 4
      ? null
      : /\p{Script=Katakana}/u.test(canonical)
        ? "shape-specific-v1"
        : "locale-segment-v1";
  }
  return null;
}

function wordSegmenter(locale: MatterLocale): Intl.Segmenter {
  const cached = WORD_SEGMENTERS.get(locale);
  if (cached !== undefined) return cached;
  const created = new Intl.Segmenter(locale, { granularity: "word" });
  WORD_SEGMENTERS.set(locale, created);
  return created;
}

function frozenSet(values: readonly string[]): ReadonlySet<string> {
  return Object.freeze(new Set(values));
}
