import type { MatterLocale } from "../config/locales";
import {
  findProtectedWikiSpans,
  isWikiRangeEligible,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
  type WikiEligibleRange,
} from "./canonicalize-wiki-text";
import {
  MAX_WIKI_OBSERVATIONS_PER_BATCH,
  type WikiChannel,
  type WikiLexeme,
  type WikiObserveEvidenceEvent,
  type WikiState,
} from "./wiki-model";

const MIN_FIT_GRAPHEMES = 7;
const MAX_FIT_GRAPHEMES = 48;
const MAX_FIT_BUCKET_SIZE = 8;
const LATIN_WORD = /^\p{Script=Latin}[\p{Script=Latin}\p{M}]*$/u;
const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

type FitLexeme = Readonly<{
  locale: MatterLocale;
  canonical: string;
  folded: string;
  graphemes: readonly string[];
}>;

type FitBucket = Readonly<{
  overflow: boolean;
  lexemes: readonly FitLexeme[];
}>;

export type WikiFitSnapshot = Readonly<{
  fittingVersion: number;
  identities: readonly Readonly<Pick<
    WikiLexeme,
    "id" | "locale" | "canonical" | "scope" | "provenance"
  >>[];
  buckets: Readonly<Record<MatterLocale, Readonly<Record<string, FitBucket>>>>;
  stats: Readonly<{
    eligibleLexemeCount: number;
    bucketCount: number;
    overflowBucketCount: number;
  }>;
}>;

export type WikiFittingRequest = Readonly<{
  locale: MatterLocale;
  channel: WikiChannel;
  text: string;
  eligibleRanges?: readonly WikiEligibleRange[];
}>;

/**
 * Compiles a disposable, bounded candidate index. Only person-confirmed
 * lexemes may teach the first fitting adapter; aggregate candidates cannot
 * recursively reinforce themselves.
 */
export function compileWikiFitSnapshot(state: WikiState): WikiFitSnapshot {
  const mutable = Object.fromEntries([
    "zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE",
  ].map((locale) => [locale, new Map<string, FitLexeme[]>()])) as Record<
    MatterLocale,
    Map<string, FitLexeme[]>
  >;
  let eligibleLexemeCount = 0;

  for (const lexeme of state.lexemes) {
    if (lexeme.provenance !== "human-confirmed" || lexeme.scope === "written") continue;
    const candidate = toFitLexeme(lexeme);
    if (candidate === null) continue;
    eligibleLexemeCount += 1;
    for (const key of bucketKeys(candidate.graphemes)) {
      const bucket = mutable[lexeme.locale].get(key);
      if (bucket === undefined) mutable[lexeme.locale].set(key, [candidate]);
      else if (bucket.length <= MAX_FIT_BUCKET_SIZE) bucket.push(candidate);
    }
  }

  let bucketCount = 0;
  let overflowBucketCount = 0;
  const buckets = Object.freeze(Object.fromEntries(Object.entries(mutable).map(
    ([locale, index]) => [locale, freezeBuckets(index, () => {
      bucketCount += 1;
    }, () => {
      overflowBucketCount += 1;
    })],
  )) as Record<MatterLocale, Readonly<Record<string, FitBucket>>>);

  return Object.freeze({
    fittingVersion: state.fittingVersion,
    identities: Object.freeze(state.lexemes.map((lexeme) => Object.freeze({
      id: lexeme.id,
      locale: lexeme.locale,
      canonical: lexeme.canonical,
      scope: lexeme.scope,
      provenance: lexeme.provenance,
    }))),
    buckets,
    stats: Object.freeze({ eligibleLexemeCount, bucketCount, overflowBucketCount }),
  });
}

export function wikiFitSnapshotMatchesState(
  snapshot: WikiFitSnapshot,
  state: WikiState,
): boolean {
  if (snapshot.fittingVersion !== state.fittingVersion ||
      snapshot.identities.length !== state.lexemes.length) return false;
  return snapshot.identities.every((identity, index) => {
    const lexeme = state.lexemes[index];
    return lexeme !== undefined && identity.id === lexeme.id &&
      identity.locale === lexeme.locale && identity.canonical === lexeme.canonical &&
      identity.scope === lexeme.scope && identity.provenance === lexeme.provenance;
  });
}

/**
 * Produces conservative Latin orthographic evidence for committed human
 * speech. It never rewrites text, scans every lexeme, or claims phonetic
 * coverage for a locale without a pinned pronunciation adapter.
 */
export function fitCommittedWikiText(
  snapshot: WikiFitSnapshot,
  request: WikiFittingRequest,
): readonly WikiObserveEvidenceEvent[] {
  if (request.channel !== "spoken" || request.text.length === 0) {
    return Object.freeze([]);
  }
  const eligibleRanges = normalizeWikiEligibleRanges(
    request.eligibleRanges,
    request.text.length,
  );
  if (eligibleRanges === null) return Object.freeze([]);
  const protectedSpans = findProtectedWikiSpans(request.text);
  const segmenter = new Intl.Segmenter(request.locale, { granularity: "word" });
  const events = new Map<string, WikiObserveEvidenceEvent>();

  for (const segment of segmenter.segment(request.text)) {
    if (!segment.isWordLike) continue;
    const start = segment.index;
    const end = start + segment.segment.length;
    if (
      !isWikiRangeEligible(start, end, eligibleRanges, 0) ||
      wikiRangeOverlapsProtected(start, end, protectedSpans, 0)
    ) continue;
    const form = segment.segment.normalize("NFC");
    if (!LATIN_WORD.test(form)) continue;
    const folded = fold(form, request.locale);
    const graphemes = splitGraphemes(folded);
    if (graphemes.length < MIN_FIT_GRAPHEMES || graphemes.length > MAX_FIT_GRAPHEMES) {
      continue;
    }
    const candidates = collectCandidates(snapshot, request.locale, graphemes);
    for (const candidate of candidates) {
      if (candidate.folded === folded || !isOneConservativeEdit(graphemes, candidate.graphemes)) {
        continue;
      }
      const event: WikiObserveEvidenceEvent = Object.freeze({
        type: "observe-evidence",
        locale: request.locale,
        channel: "spoken",
        boundary: "word",
        form,
        canonical: candidate.canonical,
        source: "machine-inference",
      });
      events.set(JSON.stringify([
        event.locale,
        event.channel,
        event.boundary,
        event.form,
        event.canonical,
        event.source,
      ]), event);
      if (events.size > MAX_WIKI_OBSERVATIONS_PER_BATCH) return Object.freeze([]);
    }
  }
  return Object.freeze([...events.values()].sort(compareEvent));
}

function toFitLexeme(lexeme: WikiLexeme): FitLexeme | null {
  if (!LATIN_WORD.test(lexeme.canonical)) return null;
  const folded = fold(lexeme.canonical, lexeme.locale);
  const graphemes = splitGraphemes(folded);
  if (graphemes.length < MIN_FIT_GRAPHEMES || graphemes.length > MAX_FIT_GRAPHEMES) {
    return null;
  }
  return Object.freeze({
    locale: lexeme.locale,
    canonical: lexeme.canonical,
    folded,
    graphemes: Object.freeze(graphemes),
  });
}

function collectCandidates(
  snapshot: WikiFitSnapshot,
  locale: MatterLocale,
  graphemes: readonly string[],
): readonly FitLexeme[] {
  const result = new Map<string, FitLexeme>();
  for (const key of bucketKeys(graphemes)) {
    const bucket = snapshot.buckets[locale][key];
    if (bucket === undefined || bucket.overflow) continue;
    for (const lexeme of bucket.lexemes) result.set(lexeme.canonical, lexeme);
  }
  return [...result.values()];
}

function bucketKeys(graphemes: readonly string[]): readonly string[] {
  const first = graphemes.slice(0, 2).join("");
  const last = graphemes.slice(-2).join("");
  return Object.freeze([
    `${graphemes.length - 1}:${first}:${last}`,
    `${graphemes.length}:${first}:${last}`,
    `${graphemes.length + 1}:${first}:${last}`,
  ]);
}

function freezeBuckets(
  input: ReadonlyMap<string, readonly FitLexeme[]>,
  onBucket: () => void,
  onOverflow: () => void,
): Readonly<Record<string, FitBucket>> {
  const output: Record<string, FitBucket> = Object.create(null) as Record<string, FitBucket>;
  for (const key of [...input.keys()].sort(compareText)) {
    onBucket();
    const values = input.get(key) ?? [];
    const overflow = values.length > MAX_FIT_BUCKET_SIZE;
    if (overflow) onOverflow();
    output[key] = Object.freeze({
      overflow,
      lexemes: overflow ? Object.freeze([]) : Object.freeze([...values].sort(compareLexeme)),
    });
  }
  return Object.freeze(output);
}

function isOneConservativeEdit(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.slice(0, 2).join("") !== right.slice(0, 2).join("") ||
      left.slice(-2).join("") !== right.slice(-2).join("")) return false;
  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    if (differences.length !== 2 || differences[1] !== differences[0] + 1) return false;
    const [first, second] = differences;
    return left[first] === right[second] && left[second] === right[first];
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function fold(value: string, locale: MatterLocale): string {
  return value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC");
}

function splitGraphemes(value: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(value), (entry) => entry.segment);
}

function compareEvent(left: WikiObserveEvidenceEvent, right: WikiObserveEvidenceEvent): number {
  return compareText(left.locale, right.locale) ||
    compareText(left.form, right.form) || compareText(left.canonical, right.canonical);
}

function compareLexeme(left: FitLexeme, right: FitLexeme): number {
  return compareText(left.canonical, right.canonical);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
