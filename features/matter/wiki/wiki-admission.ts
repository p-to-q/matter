import type { MatterLocale } from "../config/locales";
import type {
  WikiChannel,
  WikiLedgerTick,
  WikiObservationTick,
  WikiObserveEvidenceEvent,
} from "./wiki-model";
import type { WikiEligibleRange } from "./canonicalize-wiki-text";
import {
  findProtectedWikiSpans,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
} from "./canonicalize-wiki-text";
import { wikiAliasProducerClaimsCollectionSource } from "./wiki-learning-policy";
import type { WikiScriptClass } from "./wiki-script";

/** Ephemeral human-material envelope; it is never stored or exported. */
export type WikiAdmissionObservation = Readonly<{
  locale: MatterLocale;
  channel: WikiChannel;
  text: string;
  eligibleRanges?: readonly WikiEligibleRange[];
}>;

/** One successful material turn keeps raw recognition and visible text apart. */
export type WikiAdmissionTurn = Readonly<{
  observed: WikiAdmissionObservation;
  committed: WikiAdmissionObservation;
}>;

/**
 * One producer's content-free result for one ledger of one human turn.
 * `scannedScripts` names the scripts of the eligible, unprotected words the
 * producer actually scanned; it is the comparable opportunity that turn
 * offered, never a record of what was said.
 */
export type WikiAdmissionProducerResult = Readonly<{
  status: "ok" | "partial" | "censored";
  events: readonly WikiObserveEvidenceEvent[];
  scannedScripts: readonly WikiScriptClass[];
}>;

export type WikiAdmissionBatch = Readonly<{
  events: readonly WikiObserveEvidenceEvent[];
  tick: WikiObservationTick;
}>;

const PAUSED_TICK: WikiLedgerTick = Object.freeze({ disposition: "paused" });
const CENSORED_TICK: WikiLedgerTick = Object.freeze({ disposition: "censored" });
const PARTIAL_TICK: WikiLedgerTick = Object.freeze({ disposition: "partial" });

/**
 * Keeps collection and fitting ledgers independent without teaching a known
 * relation source back as a canonical in the same admission. Only a unique
 * relation from a producer whose precedence entry claims its collection
 * source may suppress collection; competing targets remain ambiguous and
 * therefore do not own the source.
 */
export function combineWikiAdmissionEvidence(
  termEvents: readonly WikiObserveEvidenceEvent[],
  fittingEvents: readonly WikiObserveEvidenceEvent[],
): readonly WikiObserveEvidenceEvent[] {
  const targetsBySource = new Map<string, Set<string>>();
  for (const event of fittingEvents) {
    if (event.source !== "machine-inference" ||
        !wikiAliasProducerClaimsCollectionSource(event.producer)) continue;
    const key = admissionLexicalKey(event.locale, event.form);
    const targets = targetsBySource.get(key) ?? new Set<string>();
    targets.add(event.canonical);
    targetsBySource.set(key, targets);
  }
  const uniqueFittingSources = new Set([...targetsBySource.entries()]
    .filter(([, targets]) => targets.size === 1)
    .map(([key]) => key));
  return Object.freeze([
    ...termEvents.filter((event) => event.source !== "recent-material" ||
      !uniqueFittingSources.has(admissionLexicalKey(event.locale, event.canonical))),
    ...fittingEvents,
  ]);
}

/**
 * Turns one successful human admission into one bounded batch and its tick.
 * A ledger whose producer did not run is paused; a turn without eligible
 * content, or a producer that could not scan, is censored and neutral; a
 * partial scan scores what it saw and ages nothing; a complete scan offers
 * its locale, channel, and scanned scripts as the comparable opportunity.
 */
export function planWikiAdmissionBatch(
  turn: WikiAdmissionTurn,
  term: WikiAdmissionProducerResult | null,
  fitting: WikiAdmissionProducerResult | null,
): WikiAdmissionBatch {
  const events = combineWikiAdmissionEvidence(term?.events ?? [], fitting?.events ?? []);
  return Object.freeze({
    events,
    tick: Object.freeze({
      term: ledgerTick(
        term,
        turn.committed,
        "evidence",
        events.some((event) => event.source === "recent-material"),
      ),
      alias: ledgerTick(
        fitting,
        turn.observed,
        "matching",
        events.some((event) => event.source === "machine-inference"),
      ),
    }),
  });
}

/** A protected or generated-only turn is censored, not negative evidence. */
export function hasWikiAdmissionContent(
  request: WikiAdmissionObservation,
  protection: "matching" | "evidence",
): boolean {
  const ranges = normalizeWikiEligibleRanges(request.eligibleRanges, request.text.length);
  if (ranges === null || ranges.length === 0) return false;
  const protectedSpans = findProtectedWikiSpans(request.text, protection);
  for (const range of ranges) {
    for (const match of request.text.slice(range.start, range.end).matchAll(/[\p{L}\p{N}]/gu)) {
      const start = range.start + (match.index ?? 0);
      const end = start + match[0].length;
      if (!wikiRangeOverlapsProtected(start, end, protectedSpans, 0)) return true;
    }
  }
  return false;
}

function ledgerTick(
  result: WikiAdmissionProducerResult | null,
  observation: WikiAdmissionObservation,
  protection: "matching" | "evidence",
  observed: boolean,
): WikiLedgerTick {
  if (result === null) return PAUSED_TICK;
  if (result.status === "censored" || !hasWikiAdmissionContent(observation, protection)) {
    return CENSORED_TICK;
  }
  if (result.status === "partial") return PARTIAL_TICK;
  return Object.freeze({
    disposition: observed ? "observed" : "quiet",
    opportunity: Object.freeze({
      locale: observation.locale,
      channel: observation.channel,
      scripts: result.scannedScripts,
    }),
  });
}

function admissionLexicalKey(locale: MatterLocale, value: string): string {
  return JSON.stringify([
    locale,
    value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC"),
  ]);
}
