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
  WikiAdmissionObservation,
  WikiAdmissionProducerResult,
} from "./wiki-admission";
import {
  isQualifiedCollectedWikiTermEvidence,
  isWikiAliasEvidenceProducer,
  isWikiTermEvidenceProducer,
  type WikiAliasEvidenceProducer,
  type WikiTermEvidenceProducer,
} from "./wiki-learning-policy";
import {
  MAX_WIKI_OBSERVATIONS_PER_LEDGER,
  MAX_WIKI_FITTING_TARGETS,
  isWikiStarterLexemeIdentity,
  type WikiLexeme,
  type WikiObserveEvidenceEvent,
  type WikiState,
} from "./wiki-model";
import type { WikiQualifiedProducerRelease } from "./wiki-producer-qualification";
import { wikiScriptClassesFromMask, wikiScriptMask } from "./wiki-script";
import {
  isWikiLatinScriptLocale,
  isWikiLatinWord,
  routeWikiWord,
  wikiLatinRouteLocale,
} from "./wiki-script-routing";

const MIN_EDIT_GRAPHEMES = 7;
const MAX_FIT_GRAPHEMES = 48;
const MAX_FIT_BUCKET_SIZE = 8;
const LATIN_WORD = /^[A-Za-z]+$/u;
const WORD_SEGMENTERS = new Map<MatterLocale, Intl.Segmenter>();

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
  /** Complete release authority that produced this disposable index. */
  qualifiedProducerReleases: readonly WikiQualifiedProducerRelease[];
  identities: readonly Readonly<Pick<
    WikiLexeme,
    "id" | "locale" | "canonical" | "scope" | "provenance" | "confirmedAtRevision"
  > & {
    /** Producer identity is part of cache authority for aggregate targets. */
    termProducer: WikiTermEvidenceProducer | "legacy-term-v1" | null;
    termPhase: "candidate" | "collected" | null;
  }>[];
  /** Conservative orthographic buckets retained as an independent producer. */
  buckets: Readonly<Record<MatterLocale, Readonly<Record<string, FitBucket>>>>;
  stats: Readonly<{
    eligibleLexemeCount: number;
    bucketCount: number;
    overflowBucketCount: number;
  }>;
}>;

export type WikiFittingRequest = WikiAdmissionObservation;

/**
 * Compiles the one released product fitting index from the current canonical
 * lexicon. Pronunciation experiments live in the offline qualification harness;
 * their packages and indexes must never enter this product runtime module.
 */
export function compileWikiFitSnapshot(
  state: WikiState,
  releases: readonly WikiQualifiedProducerRelease[] = Object.freeze([]),
): WikiFitSnapshot {
  const qualifiedProducerReleases = freezeQualifiedProducerReleases(releases);
  const qualifiedTermProducers = termProducerSet(qualifiedProducerReleases);
  const qualifiedAliasProducers = aliasProducerSet(qualifiedProducerReleases);
  const edit = localeMaps();
  let eligibleLexemeCount = 0;
  const termEvidenceByIdentity = new Map(state.termEvidence.map((entry) => [
    JSON.stringify([entry.locale, entry.canonical]),
    entry,
  ]));

  const rankedLexemes = [...state.lexemes].sort((left, right) =>
    fitTargetRank(left) - fitTargetRank(right) ||
    (right.confirmedAtRevision ?? 0) - (left.confirmedAtRevision ?? 0) ||
    right.id - left.id);
  for (const lexeme of rankedLexemes) {
    if (eligibleLexemeCount >= MAX_WIKI_FITTING_TARGETS) break;
    if (lexeme.scope === "written") continue;
    const termEvidence = termEvidenceByIdentity.get(JSON.stringify([
      lexeme.locale,
      lexeme.canonical,
    ]));
    if (lexeme.provenance === "aggregate-evidence" &&
        !isWikiStarterLexemeIdentity(lexeme) &&
        !isQualifiedCollectedWikiTermEvidence(termEvidence, qualifiedTermProducers)) {
      continue;
    }
    const candidate = toFitLexeme(lexeme);
    if (candidate === null) continue;
    let indexed = false;

    // Only the `en-US` ledger has internal-edit targets. Latin words of an
    // English turn, and Latin words routed out of a Chinese or Japanese turn,
    // reach these; a same-spelling lexeme in any other locale never does.
    const internalEditTarget = lexeme.provenance === "human-confirmed" ||
      isWikiStarterLexemeIdentity(lexeme) ||
      termEvidence?.producer === "shape-specific-v1";
    if (qualifiedAliasProducers.has("latin-internal-edit-v2") &&
        internalEditTarget && candidate.locale === "en-US" &&
        candidate.graphemes.length >= MIN_EDIT_GRAPHEMES) {
      for (const key of editBucketKeys(candidate.graphemes)) {
        addBucket(edit[candidate.locale], key, candidate);
      }
      indexed = true;
    }

    if (indexed) eligibleLexemeCount += 1;
  }

  let bucketCount = 0;
  let overflowBucketCount = 0;
  const buckets = freezeLocaleBuckets(edit, () => {
    bucketCount += 1;
  }, () => {
    overflowBucketCount += 1;
  });
  return Object.freeze({
    fittingVersion: state.fittingVersion,
    qualifiedProducerReleases,
    identities: Object.freeze(state.lexemes.map((lexeme) => Object.freeze({
      id: lexeme.id,
      locale: lexeme.locale,
      canonical: lexeme.canonical,
      scope: lexeme.scope,
      provenance: lexeme.provenance,
      confirmedAtRevision: lexeme.confirmedAtRevision,
      termProducer: termEvidenceByIdentity.get(JSON.stringify([
        lexeme.locale,
        lexeme.canonical,
      ]))?.producer ?? null,
      termPhase: termEvidenceByIdentity.get(JSON.stringify([
        lexeme.locale,
        lexeme.canonical,
      ]))?.phase ?? null,
    }))),
    buckets,
    stats: Object.freeze({
      eligibleLexemeCount,
      bucketCount,
      overflowBucketCount,
    }),
  });
}

function fitTargetRank(lexeme: WikiLexeme): number {
  if (isWikiStarterLexemeIdentity(lexeme)) return 0;
  return lexeme.provenance === "human-confirmed" ? 1 : 2;
}

export function wikiFitSnapshotMatchesState(
  snapshot: WikiFitSnapshot,
  state: WikiState,
  releases: readonly WikiQualifiedProducerRelease[] = Object.freeze([]),
): boolean {
  const qualifiedProducerReleases = freezeQualifiedProducerReleases(releases);
  if (snapshot.fittingVersion !== state.fittingVersion ||
      snapshot.identities.length !== state.lexemes.length ||
      !qualifiedProducerReleasesMatch(
        snapshot.qualifiedProducerReleases,
        qualifiedProducerReleases,
      )) return false;
  const termEvidenceByIdentity = new Map(state.termEvidence.map((entry) => [
    JSON.stringify([entry.locale, entry.canonical]),
    entry,
  ]));
  return snapshot.identities.every((identity, index) => {
    const lexeme = state.lexemes[index];
    return lexeme !== undefined && identity.id === lexeme.id &&
      identity.locale === lexeme.locale && identity.canonical === lexeme.canonical &&
      identity.scope === lexeme.scope && identity.provenance === lexeme.provenance &&
      identity.confirmedAtRevision === lexeme.confirmedAtRevision &&
      identity.termProducer === (termEvidenceByIdentity.get(JSON.stringify([
        lexeme.locale,
        lexeme.canonical,
      ]))?.producer ?? null) &&
      identity.termPhase === (termEvidenceByIdentity.get(JSON.stringify([
        lexeme.locale,
        lexeme.canonical,
      ]))?.phase ?? null);
  });
}

function termProducerSet(
  releases: readonly WikiQualifiedProducerRelease[],
): ReadonlySet<WikiTermEvidenceProducer> {
  return new Set(releases.flatMap((release) =>
    isWikiTermEvidenceProducer(release.identity.producerId)
      ? [release.identity.producerId]
      : []));
}

function aliasProducerSet(
  releases: readonly WikiQualifiedProducerRelease[],
): ReadonlySet<WikiAliasEvidenceProducer> {
  return new Set(releases.flatMap((release) =>
    isWikiAliasEvidenceProducer(release.identity.producerId)
      ? [release.identity.producerId]
      : []));
}

function freezeQualifiedProducerReleases(
  releases: readonly WikiQualifiedProducerRelease[],
): readonly WikiQualifiedProducerRelease[] {
  return Object.freeze(sortQualifiedProducerReleases(releases.filter((release) =>
    release.identity.producerId === "latin-internal-edit-v2" ||
    isWikiTermEvidenceProducer(release.identity.producerId))).map((release) =>
    Object.freeze({
      qualificationVersion: release.qualificationVersion,
      identity: Object.freeze({
        producerId: release.identity.producerId,
        producerVersion: release.identity.producerVersion,
        producerDigest: release.identity.producerDigest,
        resourceId: release.identity.resourceId,
        resourceVersion: release.identity.resourceVersion,
        resourceDigest: release.identity.resourceDigest,
      }),
      corpus: Object.freeze({
        corpusVersion: release.corpus.corpusVersion,
        corpusDigest: release.corpus.corpusDigest,
      }),
    })));
}

function sortQualifiedProducerReleases(
  releases: readonly WikiQualifiedProducerRelease[],
): WikiQualifiedProducerRelease[] {
  return [...releases].sort(compareQualifiedProducerRelease);
}

function compareQualifiedProducerRelease(
  left: WikiQualifiedProducerRelease,
  right: WikiQualifiedProducerRelease,
): number {
  return compareText(left.identity.producerId, right.identity.producerId) ||
    left.qualificationVersion - right.qualificationVersion ||
    compareText(left.identity.producerVersion, right.identity.producerVersion) ||
    compareText(left.identity.producerDigest, right.identity.producerDigest) ||
    compareText(left.identity.resourceId, right.identity.resourceId) ||
    compareText(left.identity.resourceVersion, right.identity.resourceVersion) ||
    compareText(left.identity.resourceDigest, right.identity.resourceDigest) ||
    compareText(left.corpus.corpusVersion, right.corpus.corpusVersion) ||
    compareText(left.corpus.corpusDigest, right.corpus.corpusDigest);
}

function qualifiedProducerReleasesMatch(
  left: readonly WikiQualifiedProducerRelease[],
  right: readonly WikiQualifiedProducerRelease[],
): boolean {
  return left.length === right.length && left.every((release, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      compareQualifiedProducerRelease(release, candidate) === 0;
  });
}

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

function toFitLexeme(lexeme: WikiLexeme): FitLexeme | null {
  const folded = fold(lexeme.canonical, lexeme.locale);
  const graphemes = splitGraphemes(folded);
  if (graphemes.length === 0 || graphemes.length > MAX_FIT_GRAPHEMES) return null;
  return Object.freeze({
    locale: lexeme.locale,
    canonical: lexeme.canonical,
    folded,
    graphemes: Object.freeze(graphemes),
  });
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

function editBucketKeys(graphemes: readonly string[]): readonly string[] {
  const first = graphemes.slice(0, 2).join("");
  const last = graphemes.slice(-2).join("");
  return Object.freeze([
    `${graphemes.length - 1}:${first}:${last}`,
    `${graphemes.length}:${first}:${last}`,
    `${graphemes.length + 1}:${first}:${last}`,
  ]);
}

function localeMaps(): Record<MatterLocale, Map<string, FitLexeme[]>> {
  return Object.fromEntries([
    "zh-CN", "zh-TW", "en-US", "ja-JP", "de-DE",
  ].map((locale) => [locale, new Map<string, FitLexeme[]>()])) as Record<
    MatterLocale,
    Map<string, FitLexeme[]>
  >;
}

function addBucket(
  target: Map<string, FitLexeme[]>,
  key: string,
  candidate: FitLexeme,
): void {
  const bucket = target.get(key);
  if (bucket === undefined) target.set(key, [candidate]);
  else if (bucket.length <= MAX_FIT_BUCKET_SIZE) bucket.push(candidate);
}

function freezeLocaleBuckets(
  input: Record<MatterLocale, Map<string, FitLexeme[]>>,
  onBucket: () => void,
  onOverflow: () => void,
): Readonly<Record<MatterLocale, Readonly<Record<string, FitBucket>>>> {
  return Object.freeze(Object.fromEntries(Object.entries(input).map(
    ([locale, index]) => [locale, freezeBuckets(index, onBucket, onOverflow)],
  )) as Record<MatterLocale, Readonly<Record<string, FitBucket>>>);
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

function producerEnabled(
  producer: WikiAliasEvidenceProducer,
  enabled: ReadonlySet<WikiAliasEvidenceProducer> | undefined,
): boolean {
  return enabled === undefined || enabled.has(producer);
}

function fold(value: string, locale: MatterLocale): string {
  return value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC");
}

function splitGraphemes(value: string): string[] {
  return [...value];
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

function compareLexeme(left: FitLexeme, right: FitLexeme): number {
  return compareText(left.canonical, right.canonical);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
