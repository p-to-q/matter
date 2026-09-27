import type { MatterLocale } from "../config/locales";
import type { WikiChannel, WikiObserveEvidenceEvent } from "./wiki-model";
import type { WikiEligibleRange } from "./canonicalize-wiki-text";
import {
  findProtectedWikiSpans,
  normalizeWikiEligibleRanges,
  wikiRangeOverlapsProtected,
} from "./canonicalize-wiki-text";

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
 * Keeps collection and fitting ledgers independent without teaching a known
 * bounded Latin fitting source back as a canonical in the same admission.
 * Only one unique relation may suppress collection; competing fitting targets
 * remain ambiguous and therefore do not own the source.
 */
export function combineWikiAdmissionEvidence(
  termEvents: readonly WikiObserveEvidenceEvent[],
  fittingEvents: readonly WikiObserveEvidenceEvent[],
): readonly WikiObserveEvidenceEvent[] {
  const targetsBySource = new Map<string, Set<string>>();
  for (const event of fittingEvents) {
    if (event.source !== "machine-inference" ||
        event.producer !== "latin-internal-edit-v2") continue;
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

function admissionLexicalKey(locale: MatterLocale, value: string): string {
  return JSON.stringify([
    locale,
    value.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC"),
  ]);
}
