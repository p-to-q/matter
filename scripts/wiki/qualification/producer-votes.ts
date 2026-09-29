/**
 * What one producer said about one corpus case, and what the evidence policy
 * would apply from it.
 *
 * A harness records every vote, sorted, so abstention and two votes can never
 * look alike in its results. Only then does it derive the single application
 * the generic verifier scores: votes that name different targets for the same
 * source compete, and the ambiguity margin keeps each of them inactive, so
 * they apply nothing; every other vote is its own application, and a case
 * that yields more than one application reports all of them, which no
 * single-answer expectation can match.
 */

export type WikiProducerVote = Readonly<{
  actionId: string;
  /** Votes sharing this key compete for one source; absent, the vote stands alone. */
  competesFor?: string;
}>;

export type WikiProducerCaseVotes = Readonly<{
  caseId: string;
  /** Every vote the producer cast for the case, sorted by code units. */
  voteActionIds: readonly string[];
  appliedActionId: string | null;
}>;

export function recordWikiProducerVotes(
  caseId: string,
  votes: readonly WikiProducerVote[],
): WikiProducerCaseVotes {
  const bySource = new Map<string, Set<string>>();
  for (const vote of votes) {
    const source = vote.competesFor ?? `\u0000${vote.actionId}`;
    const targets = bySource.get(source) ?? new Set<string>();
    targets.add(vote.actionId);
    bySource.set(source, targets);
  }
  const applications = [...bySource.values()]
    .filter((targets) => targets.size === 1)
    .map((targets) => [...targets][0]!)
    .sort(compareCodeUnits);
  return Object.freeze({
    caseId,
    voteActionIds: Object.freeze(votes.map((vote) => vote.actionId).sort(compareCodeUnits)),
    appliedActionId: applications.length === 0 ? null : applications.join(" + "),
  });
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
