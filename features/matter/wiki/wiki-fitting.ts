import type { MatterLocale } from "../config/locales";
import type {
  WikiAdmissionObservation,
} from "./wiki-admission";
import {
  isQualifiedCollectedWikiTermEvidence,
  isWikiAliasEvidenceProducer,
  isWikiTermEvidenceProducer,
  type WikiAliasEvidenceProducer,
  type WikiTermEvidenceProducer,
} from "./wiki-learning-policy";
import {
  MAX_WIKI_FITTING_TARGETS,
  isWikiStarterLexemeIdentity,
  isHumanWikiLexeme,
  type WikiPreferences,
  type WikiLexeme,
  type WikiState,
} from "./wiki-model";
import type { WikiQualifiedProducerRelease } from "./wiki-producer-qualification";
import { DEFAULT_WIKI_PREFERENCES, wikiNearSoundEnabled } from "./wiki-preferences";

export const MIN_EDIT_GRAPHEMES = 7;
export const MAX_FIT_GRAPHEMES = 48;
const MAX_FIT_BUCKET_SIZE = 8;

export type FitLexeme = Readonly<{
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
  preferences?: WikiPreferences;
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
    if (lexeme.scope === "written" || !wikiNearSoundEnabled(state.preferences, lexeme.locale)) continue;
    const termEvidence = termEvidenceByIdentity.get(JSON.stringify([
      lexeme.locale,
      lexeme.canonical,
    ]));
    if (!isHumanWikiLexeme(lexeme) &&
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
    const internalEditTarget = isHumanWikiLexeme(lexeme) ||
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
    ...(state.preferences.nearSound.length !== 0 ? { preferences: state.preferences } : {}),
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
  return isHumanWikiLexeme(lexeme) ? 1 : 2;
}

export function wikiFitSnapshotMatchesState(
  snapshot: WikiFitSnapshot,
  state: WikiState,
  releases: readonly WikiQualifiedProducerRelease[] = Object.freeze([]),
): boolean {
  const qualifiedProducerReleases = freezeQualifiedProducerReleases(releases);
  if (snapshot.fittingVersion !== state.fittingVersion ||
      JSON.stringify(snapshot.preferences ?? DEFAULT_WIKI_PREFERENCES) !== JSON.stringify(state.preferences) ||
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

function fold(value: string, locale: MatterLocale): string {
  return value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC");
}

function splitGraphemes(value: string): string[] {
  return [...value];
}

function compareLexeme(left: FitLexeme, right: FitLexeme): number {
  return compareText(left.canonical, right.canonical);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export { editBucketKeys as wikiFitEditBucketKeys, fold as foldWikiFitText, splitGraphemes as splitWikiFitGraphemes };
