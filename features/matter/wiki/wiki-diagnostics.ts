import { MAX_WIKI_OUTCOME_COUNT, type WikiOutcomeCounters, type WikiState } from "./wiki-model";

export const EMPTY_WIKI_OUTCOME_COUNTERS: WikiOutcomeCounters = Object.freeze({
  acceptedImplicit: 0, inspectedKept: 0, explicitConfirm: 0,
  explicitReject: 0, explicitReplace: 0, reverted: 0,
});

export function isWikiOutcomeCounters(value: unknown): value is WikiOutcomeCounters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(EMPTY_WIKI_OUTCOME_COUNTERS);
  return Object.keys(row).length === keys.length && keys.every((key) =>
    Number.isInteger(row[key]) && (row[key] as number) >= 0 &&
    (row[key] as number) <= MAX_WIKI_OUTCOME_COUNT);
}

export function incrementWikiOutcome(
  counters: WikiOutcomeCounters, key: keyof WikiOutcomeCounters,
): WikiOutcomeCounters {
  return Object.freeze({ ...counters, [key]: Math.min(MAX_WIKI_OUTCOME_COUNT, counters[key] + 1) });
}

export type WikiTransientOutcomes = Readonly<{
  censored: number; failed: number; unattributed: number;
}>;

/** The receipt derives numbers from current owners; it owns no second counters. */
export function deriveWikiDiagnostics(state: WikiState | null, transient: WikiTransientOutcomes) {
  return Object.freeze({
    revision: state?.revision ?? null,
    lexemes: state?.lexemes.length ?? 0,
    relations: (state?.authorities.length ?? 0) + (state?.aliasEvidence.length ?? 0),
    established: state?.ruleMaturity.filter((entry) => entry.establishedAt !== null).length ?? 0,
    outcomes: state?.outcomeCounters ?? EMPTY_WIKI_OUTCOME_COUNTERS,
    transient: Object.freeze({ ...transient }),
  });
}
