/**
 * The one owner of outcome lines on the paper's guidance line: work the person
 * asked for that ended without the change it promised, said once and kept
 * until the person's next action instead of a timer.
 *
 * Each turn owner reports into one bounded queue that holds at most one entry
 * per owner, so outcomes that end together are each shown and announced in
 * turn rather than one hiding the others. A newer outcome from the same owner
 * replaces its older entry where it stands. Only the entry at the head can be
 * shown, and a next action acknowledges only the entry that was shown.
 *
 * Held admission words are state, not an outcome: they keep the line until the
 * person places or discards them, and every outcome waits behind them.
 */

export type MaterialOutcome =
  /** A submitted Elastic expansion changed nothing. */
  | Readonly<{ owner: "expansion"; reason: "unavailable" | "stale" }>
  /** A submitted Point-and-Talk rewrite ended with no field left to say so. */
  | Readonly<{ owner: "rewrite"; reason: "unavailable" | "stale" }>
  /**
   * An explicit Keep or restore of a Wiki change: Wiki could not record it, or
   * the passage no longer held the word to restore.
   */
  | Readonly<{ owner: "wiki"; reason: "unsaved" | "passage-changed" }>;

export type OutcomeOwner = MaterialOutcome["owner"];

/** One reported outcome; a fresh id marks each report for announcement. */
export type OutcomeEntry = MaterialOutcome & Readonly<{ id: number }>;

export type OutcomeLine = Readonly<{
  /** Oldest first; at most one entry per owner. */
  entries: readonly OutcomeEntry[];
  lastId: number;
}>;

export const EMPTY_OUTCOME_LINE: OutcomeLine = Object.freeze({
  entries: Object.freeze([]),
  lastId: 0,
});

export function reportOutcome(line: OutcomeLine, outcome: MaterialOutcome): OutcomeLine {
  const id = line.lastId + 1;
  const entry: OutcomeEntry = Object.freeze({ ...outcome, id });
  const index = line.entries.findIndex((candidate) => candidate.owner === outcome.owner);
  const entries = index === -1
    ? [...line.entries, entry]
    : line.entries.map((candidate, position) => position === index ? entry : candidate);
  return Object.freeze({ entries: Object.freeze(entries), lastId: id });
}

/** The entry the guidance line may show now. */
export function currentOutcome(line: OutcomeLine): OutcomeEntry | null {
  return line.entries[0] ?? null;
}

/**
 * Retires the shown entry once the person acted after seeing it. An id that is
 * not at the head was never shown, so it is not acknowledged.
 */
export function acknowledgeOutcome(line: OutcomeLine, id: number): OutcomeLine {
  if (line.entries[0]?.id !== id) return line;
  return Object.freeze({ entries: Object.freeze(line.entries.slice(1)), lastId: line.lastId });
}
