import type { MatterLocale } from "../config/locales";
import {
  findProtectedWikiSpans,
  findWidthAwareProtectedWikiSpans,
  hasWikiWordBoundaryAround,
  isWikiRangeEligible,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
} from "./canonicalize-wiki-text";
import type {
  WikiAdmissionProducerResult,
} from "./wiki-admission";
import {
  type WikiAliasEvidenceProducer,
} from "./wiki-learning-policy";
import {
  MAX_WIKI_OBSERVATIONS_PER_LEDGER,
  wikiProducerFamily,
  type WikiProducerFamily,
  type WikiObserveEvidenceEvent,
} from "./wiki-model";
import { wikiScriptClassesFromMask, wikiScriptMask } from "./wiki-script";
import {
  isWikiLatinScriptLocale,
  isWikiLatinWord,
  routeWikiWord,
  wikiLatinRouteLocale,
} from "./wiki-script-routing";
import { DEFAULT_WIKI_PREFERENCES, wikiNearSoundEnabled } from "./wiki-preferences";
import { MIN_EDIT_GRAPHEMES, MAX_FIT_GRAPHEMES, wikiFitEditBucketKeys as editBucketKeys, foldWikiFitText as fold, splitWikiFitGraphemes as splitGraphemes, type FitLexeme, type WikiFitSnapshot, type WikiFittingRequest } from "./wiki-fitting";
const LATIN_WORD = /^[A-Za-z]+$/u;

const WORD_SEGMENTERS = new Map<MatterLocale, Intl.Segmenter>();


/** Produces local relation evidence; it never rewrites or scans every lexeme. */
export function fitCommittedWikiText(
  snapshot: WikiFitSnapshot,
  request: WikiFittingRequest,
  enabledProducers?: ReadonlySet<WikiAliasEvidenceProducer>,
): readonly WikiObserveEvidenceEvent[] {
  return fitCommittedWikiTextResult(snapshot, request, enabledProducers).events;
}


export type WikiFittingResult = WikiAdmissionProducerResult;


const CENSORED_FITTING: WikiFittingResult = Object.freeze({
  status: "censored",
  events: Object.freeze([]),
  scannedScripts: Object.freeze([]),
});


/**
 * Scans eligible words in text order. A word whose relations would exceed the
 * per-ledger bound is not scanned; the result is `partial`, so its relations
 * already found still count and nothing unscanned is treated as absent.
 *
 * Each word is fitted in the ledger its script routes to: a Latin word inside
 * a Chinese or Japanese turn reaches the `en-US` internal-edit producer, while
 * CJK words never reach a Latin producer. A Latin word votes by its
 * width-folded spelling in every turn, routed or not, so a full-width spelling
 * votes like its half-width one instead of counting as its absence. The
 * turn's own opportunity still names every script it scanned, so a candidate
 * stored under the turn locale for a script that now routes away ages out at
 * the ordinary cadence instead of becoming immortal.
 */
export function fitCommittedWikiTextResult(
  snapshot: WikiFitSnapshot,
  request: WikiFittingRequest,
  enabledProducers?: ReadonlySet<WikiAliasEvidenceProducer>,
): WikiFittingResult {
  if (request.channel !== "spoken" || request.text.length === 0) {
    return CENSORED_FITTING;
  }
  const ledgerLocale = wikiLatinRouteLocale(request.locale) ?? request.locale;
  if (!wikiNearSoundEnabled(snapshot.preferences ?? DEFAULT_WIKI_PREFERENCES, ledgerLocale)) {
    return CENSORED_FITTING;
  }
  const eligibleRanges = normalizeWikiEligibleRanges(
    request.eligibleRanges,
    request.text.length,
  );
  if (eligibleRanges === null) return CENSORED_FITTING;
  // Learning mirrors matching: Latin words, routed or in a Latin-script turn,
  // are protected across widths.
  const protectedSpans = isWikiLatinScriptLocale(request.locale)
    ? findWidthAwareProtectedWikiSpans(request.text)
    : findProtectedWikiSpans(request.text);
  const routedProtectedSpans = wikiLatinRouteLocale(request.locale) === null
    ? protectedSpans
    : findWidthAwareProtectedWikiSpans(request.text);
  const segmenter = wordSegmenter(request.locale);
  const events = new Map<string, WikiObserveEvidenceEvent>();
  const words = [...segmenter.segment(request.text)].flatMap((segment) => {
    if (!segment.isWordLike) return [];
    const start = segment.index;
    const end = start + segment.segment.length;
    if (!isWikiRangeEligible(start, end, eligibleRanges, 0) ||
        wikiRangeOverlapsProtected(start, end, protectedSpans, 0)) return [];
    const route = routeWikiWord(request.locale, segment.segment.normalize("NFC"));
    if (route.routed &&
        wikiRangeOverlapsProtected(start, end, routedProtectedSpans, 0)) return [];
    // A relation is evidence only where its word rule could apply: `@name`,
    // `#tag`, and joined forms are never rewritten, so like protected
    // literals they neither vote nor offer an opportunity. Nor does a Latin
    // word the producer cannot read in any width, such as one holding a
    // digit, an apostrophe, or a non-ASCII letter: it could never be a
    // relation's form, so its presence says nothing about one's absence.
    if (isWikiLatinWord(route.form) && (!LATIN_WORD.test(route.form) ||
        !hasWikiWordBoundaryAround(request.text, start, end, request.locale, route.routed))) {
      return [];
    }
    return [route];
  });

  let scannedScripts = 0;
  let routedScripts = 0;
  let partial = false;
  for (const word of words) {
    const additions = (LATIN_WORD.test(word.form)
      ? latinEditEvents(snapshot, word.locale, word.form, enabledProducers)
      : []).filter((event) => !events.has(fittingEventKey(event)));
    if (events.size + additions.length > MAX_WIKI_OBSERVATIONS_PER_LEDGER) {
      partial = true;
      break;
    }
    for (const event of additions) events.set(fittingEventKey(event), event);
    const scripts = wikiScriptMask(word.form);
    scannedScripts |= scripts;
    if (word.routed) routedScripts |= scripts;
  }
  return Object.freeze({
    status: partial ? "partial" : "ok",
    events: Object.freeze([...events.values()].sort(compareEvent)),
    scannedScripts: wikiScriptClassesFromMask(scannedScripts),
    routedScripts: wikiScriptClassesFromMask(routedScripts),
    producerFamilies: Object.freeze([...new Set(snapshot.qualifiedProducerReleases
      .map((release) => release.identity.producerId)
      .filter((producer) => producer === "latin-internal-edit-v2" &&
        (enabledProducers === undefined || enabledProducers.has(producer)))
      .map(wikiProducerFamily).filter((family): family is WikiProducerFamily => family !== null))]),
  });
}


function fittingEventKey(event: WikiObserveEvidenceEvent): string {
  return event.source === "machine-inference"
    ? JSON.stringify([event.locale, event.form, event.canonical])
    : JSON.stringify([event.locale, event.canonical]);
}


function latinEditEvents(
  snapshot: WikiFitSnapshot,
  locale: MatterLocale,
  form: string,
  enabled: ReadonlySet<WikiAliasEvidenceProducer> | undefined,
): readonly WikiObserveEvidenceEvent[] {
  if (locale !== "en-US" ||
      !snapshotHasAliasProducer(snapshot, "latin-internal-edit-v2") ||
      !producerEnabled("latin-internal-edit-v2", enabled)) return [];
  const folded = fold(form, locale);
  const graphemes = splitGraphemes(folded);
  if (graphemes.length < MIN_EDIT_GRAPHEMES || graphemes.length > MAX_FIT_GRAPHEMES) {
    return [];
  }
  const candidates = collectEditCandidates(snapshot, locale, graphemes);
  // A form already owned by the canonical lexicon is a hard no-op, not a
  // low-scoring alternative that repeated machine evidence may outvote.
  if (candidates.some((candidate) => candidate.folded === folded)) return [];
  const events: WikiObserveEvidenceEvent[] = [];
  for (const candidate of candidates) {
    if (candidate.folded === folded ||
        !isOneConservativeEdit(graphemes, candidate.graphemes)) continue;
    const event: WikiObserveEvidenceEvent = Object.freeze({
      type: "observe-evidence",
      locale,
      channel: "spoken",
      boundary: "word",
      form,
      canonical: candidate.canonical,
      source: "machine-inference",
      producer: "latin-internal-edit-v2",
    });
    events.push(event);
  }
  return events;
}


function snapshotHasAliasProducer(
  snapshot: WikiFitSnapshot,
  producer: WikiAliasEvidenceProducer,
): boolean {
  return snapshot.qualifiedProducerReleases.some((release) =>
    release.identity.producerId === producer);
}


function collectEditCandidates(
  snapshot: WikiFitSnapshot,
  locale: MatterLocale,
  graphemes: readonly string[],
): readonly FitLexeme[] {
  const result = new Map<string, FitLexeme>();
  for (const key of editBucketKeys(graphemes)) {
    const bucket = snapshot.buckets[locale][key];
    if (bucket === undefined || bucket.overflow) continue;
    for (const lexeme of bucket.lexemes) result.set(lexeme.canonical, lexeme);
  }
  return [...result.values()];
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


function producerEnabled(
  producer: WikiAliasEvidenceProducer,
  enabled: ReadonlySet<WikiAliasEvidenceProducer> | undefined,
): boolean {
  return enabled === undefined || enabled.has(producer);
}


function wordSegmenter(locale: MatterLocale): Intl.Segmenter {
  const cached = WORD_SEGMENTERS.get(locale);
  if (cached !== undefined) return cached;
  const created = new Intl.Segmenter(locale, { granularity: "word" });
  WORD_SEGMENTERS.set(locale, created);
  return created;
}


function compareEvent(left: WikiObserveEvidenceEvent, right: WikiObserveEvidenceEvent): number {
  if (left.source !== "machine-inference" || right.source !== "machine-inference") return 0;
  return compareText(left.locale, right.locale) ||
    compareText(left.form, right.form) || compareText(left.canonical, right.canonical) ||
    compareText(left.producer, right.producer);
}
function compareText(left: string, right: string): number { return left === right ? 0 : left < right ? -1 : 1; }
