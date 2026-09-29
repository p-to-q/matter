import { freezeWikiState, lexemeKey } from "./wiki-invariants";
import {
  advanceWikiAliasQuietTurn,
  advanceWikiKeptQuietTurn,
  advanceWikiRevertStrikeTurn,
  advanceWikiTermQuietTurn,
  compareWikiEvictionOrder,
  reconcileWikiTermEvidence,
  type WikiEvictionCandidate,
} from "./wiki-learning-policy";
import {
  isWikiStarterLexemeIdentity,
  type WikiAliasDescriptor,
  type WikiAliasEvidenceAggregate,
  type WikiLedgerTick,
  type WikiObservationTick,
  type WikiObserveEvidenceEvent,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTransitionResult,
} from "./wiki-model";
import {
  wikiScriptMask,
  wikiScriptMaskFromClasses,
  wikiScriptsCover,
  type WikiScriptMask,
} from "./wiki-script";
import {
  aliasCandidate,
  commitAtRevision,
  storedAliasEvidenceKey,
  transitionFailure as failure,
  transitionSuccess as success,
  type WikiCommit,
} from "./wiki-transition";

/**
 * Evidence aging and eviction: how one human turn ages the candidates it was
 * a comparable opportunity for, which automatic lexemes stay listed, and which
 * row a full reservoir gives up for a newcomer. Only the observation batch
 * calls it; scoring constants live in `wiki-learning-policy.ts`.
 */

/*
 * Two dependency questions, kept apart on purpose.
 *
 * Retention: an automatic lexeme stays listed while its term is collected or
 * a relation, a human decision, or a tombstone depends on it. A revert strike
 * is soft memory; it never keeps an automatic lexeme alive and leaves with the
 * identity it describes. Demotion and aging both answer this question.
 *
 * Eviction protection: a full reservoir never makes room by evicting an
 * identity anything retains, nor one a strike describes, because capacity
 * pressure alone must not erase a person's negative evidence.
 */

/** Lexeme ids a relation, human decision, or tombstone keeps listed. */
export function lexemesRetainedByDependents(
  state: Pick<WikiState, "aliasEvidence" | "authorities" | "aliasTombstones">,
): ReadonlySet<number> {
  return new Set([
    ...state.aliasEvidence.map((entry) => entry.lexemeId),
    ...state.authorities.map((entry) => entry.lexemeId),
    ...state.aliasTombstones.map((entry) => entry.lexemeId),
  ]);
}

/** Lexeme ids an eviction must not remove: every retained id and every struck one. */
function lexemesProtectedFromEviction(state: WikiState): ReadonlySet<number> {
  return new Set([
    ...lexemesRetainedByDependents(state),
    ...state.revertStrikes.map((entry) => entry.lexemeId),
  ]);
}

/**
 * Removes the weakest term row that nothing depends on, together with its
 * automatic lexeme. Human-owned terms, product starters, rows observed in this
 * turn, and any identity a relation, decision, or strike depends on stay.
 */
export function evictWeakestTermEvidence(
  state: WikiState,
  observedThisTurn: ReadonlySet<string>,
): WikiState | null {
  const dependents = lexemesProtectedFromEviction(state);
  const lexemesByKey = new Map(state.lexemes.map((lexeme) => [lexemeKey(lexeme), lexeme]));
  let victim: WikiState["termEvidence"][number] | undefined;
  let victimOrder: WikiEvictionCandidate | undefined;
  for (const entry of state.termEvidence) {
    const lexeme = lexemesByKey.get(lexemeKey(entry));
    const identity = JSON.stringify(["recent-material", entry.locale, entry.canonical]);
    if (observedThisTurn.has(identity) || (lexeme !== undefined && (
      lexeme.provenance !== "aggregate-evidence" ||
      isWikiStarterLexemeIdentity(lexeme) ||
      dependents.has(lexeme.id)
    ))) continue;
    const order: WikiEvictionCandidate = {
      established: entry.phase === "collected",
      support: entry.support,
      quietTurns: entry.quietTurns,
      identity,
    };
    if (victimOrder === undefined || compareWikiEvictionOrder(order, victimOrder) < 0) {
      victim = entry;
      victimOrder = order;
    }
  }
  if (victim === undefined) return null;
  const removed = victim;
  const victimLexeme = lexemesByKey.get(lexemeKey(removed));
  return freezeWikiState({
    ...state,
    termEvidence: state.termEvidence.filter((entry) => entry !== removed),
    lexemes: victimLexeme === undefined
      ? state.lexemes
      : state.lexemes.filter((entry) => entry !== victimLexeme),
  });
}

/**
 * Removes the weakest relation row that holds no authority: never an active
 * relation, never one observed in this turn. Rows with kept evidence leave
 * after rows without it.
 */
export function evictWeakestAliasEvidence(
  state: WikiState,
  observedThisTurn: ReadonlySet<string>,
): WikiState | null {
  const lexemesById = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  let victim: WikiAliasEvidenceAggregate | undefined;
  let victimOrder: WikiEvictionCandidate | undefined;
  for (const entry of state.aliasEvidence) {
    if (entry.phase === "active") continue;
    const lexeme = lexemesById.get(entry.lexemeId);
    const identity = JSON.stringify([
      "machine-inference",
      lexeme?.locale ?? "",
      entry.channel,
      entry.boundary,
      entry.form,
      lexeme?.canonical ?? "",
    ]);
    if (observedThisTurn.has(identity)) continue;
    const order: WikiEvictionCandidate = {
      established: entry.kept > 0,
      support: entry.support,
      quietTurns: entry.quietTurns,
      identity: storedAliasEvidenceKey(entry),
    };
    if (victimOrder === undefined || compareWikiEvictionOrder(order, victimOrder) < 0) {
      victim = entry;
      victimOrder = order;
    }
  }
  if (victim === undefined) return null;
  const removed = victim;
  return freezeWikiState({
    ...state,
    aliasEvidence: state.aliasEvidence.filter((entry) => entry !== removed),
  });
}

/**
 * Advances the candidate-local quiet clocks for one human turn. A candidate
 * ages only when this turn was a comparable opportunity for it: a complete
 * scan in the same locale (and, for relations, the same channel) whose
 * eligible content contained every script the candidate needs. A turn's
 * routed opportunity is the same test for the Latin ledger its Latin words
 * routed to. Absence from a turn that could not have contained it is not
 * evidence of disuse.
 */
export function advanceUnobservedEvidence(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
  tick: WikiObservationTick,
  commit: WikiCommit = commitAtRevision,
): WikiTransitionResult {
  const initialTermKeys = new Set(state.termEvidence.map(lexemeKey));
  const hasOwnerlessAutomaticLexeme = state.lexemes.some((lexeme) =>
    lexeme.provenance === "aggregate-evidence" &&
    !isWikiStarterLexemeIdentity(lexeme) &&
    !initialTermKeys.has(lexemeKey(lexeme)));
  if (state.termEvidence.length === 0 && state.aliasEvidence.length === 0 &&
      state.revertStrikes.length === 0 && !hasOwnerlessAutomaticLexeme) {
    return success(state, false);
  }
  const termAging = agingScopes(tick.term);
  const aliasAging = agingScopes(tick.alias);
  const scriptMasks = new Map<string, WikiScriptMask>();
  const scriptsOf = (text: string): WikiScriptMask => {
    const cached = scriptMasks.get(text);
    if (cached !== undefined) return cached;
    const mask = wikiScriptMask(text);
    scriptMasks.set(text, mask);
    return mask;
  };
  const observedTerms = new Set(events
    .filter((event) => event.source === "recent-material")
    .map((event) => lexemeKey(event)));
  const observedAliases = new Set(events
    .filter((event) => event.source === "machine-inference")
    .map((event) => JSON.stringify([
      event.locale, event.channel, event.boundary, event.form, event.canonical, event.producer,
    ])));
  const agedTermEvidence = state.termEvidence.map((entry) => {
    if (observedTerms.has(lexemeKey(entry)) || !termAging.some((scope) =>
      entry.locale === scope.locale &&
      wikiScriptsCover(scope.scripts, scriptsOf(entry.canonical)))) return entry;
    const aged = advanceWikiTermQuietTurn(entry);
    return Object.freeze({
      locale: entry.locale,
      canonical: entry.canonical,
      producer: entry.producer,
      ...reconcileWikiTermEvidence(aged),
    });
  });
  const lexemesById = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const aliasComparable = (
    entry: Pick<WikiAliasDescriptor, "lexemeId" | "channel" | "form">,
  ): boolean => {
    const lexeme = lexemesById.get(entry.lexemeId);
    return lexeme !== undefined && aliasAging.some((scope) =>
      lexeme.locale === scope.locale && entry.channel === scope.channel &&
      wikiScriptsCover(scope.scripts, scriptsOf(entry.form)));
  };
  const aliasEvidence = state.aliasEvidence.map((entry) => {
    if (!aliasComparable(entry)) return entry;
    const lexeme = lexemesById.get(entry.lexemeId)!;
    const kept = advanceWikiKeptQuietTurn(entry);
    const observedKey = JSON.stringify([
      lexeme.locale, entry.channel, entry.boundary, entry.form, lexeme.canonical, entry.producer,
    ]);
    if (observedAliases.has(observedKey)) {
      return kept.kept === entry.kept && kept.keptQuietTurns === entry.keptQuietTurns
        ? entry
        : Object.freeze({ ...entry, ...kept });
    }
    const aged = advanceWikiAliasQuietTurn(aliasCandidate(entry));
    return Object.freeze({
      ...entry,
      phase: aged.phase,
      support: aged.support,
      quietTurns: aged.quietTurns,
      ...kept,
    });
  }).filter((entry) => entry.support > 0);
  const agedStrikes = state.revertStrikes.flatMap((entry) => {
    if (!aliasComparable(entry)) return [entry];
    const quietTurns = advanceWikiRevertStrikeTurn(entry.quietTurns);
    return quietTurns === null ? [] : [Object.freeze({ ...entry, quietTurns })];
  });
  const retainedByDependents = lexemesRetainedByDependents({
    aliasEvidence,
    authorities: state.authorities,
    aliasTombstones: state.aliasTombstones,
  });
  const dependentTermKeys = new Set(state.lexemes
    .filter((lexeme) => retainedByDependents.has(lexeme.id))
    .map(lexemeKey));
  // A zero-support term row is the cleanup owner while another relation still
  // depends on its aggregate lexeme. Drop both only after the last dependency
  // disappears, otherwise the lexeme can become an uncollectable UI orphan.
  const termEvidence = agedTermEvidence.filter((entry) =>
    entry.support > 0 || dependentTermKeys.has(lexemeKey(entry))
  );
  // An automatic lexeme is visible only while its term stays collected or a
  // relation or decision depends on it; a demoted candidate keeps its fading
  // support in the ledger but no longer lists or blocks a canonical form.
  const collectedTermKeys = new Set(termEvidence
    .filter((entry) => entry.phase === "collected")
    .map(lexemeKey));
  const lexemes = state.lexemes.filter((lexeme) => {
    if (lexeme.provenance !== "aggregate-evidence" ||
        isWikiStarterLexemeIdentity(lexeme)) return true;
    return collectedTermKeys.has(lexemeKey(lexeme)) ||
      retainedByDependents.has(lexeme.id);
  });
  // A strike is soft memory. It never keeps an automatic lexeme alive and
  // leaves with the identity it describes.
  const retainedLexemeIds = new Set(lexemes.map((lexeme) => lexeme.id));
  const revertStrikes = agedStrikes.filter((entry) => retainedLexemeIds.has(entry.lexemeId));
  const changed = termEvidence.length !== state.termEvidence.length ||
    aliasEvidence.length !== state.aliasEvidence.length ||
    lexemes.length !== state.lexemes.length ||
    revertStrikes.length !== state.revertStrikes.length ||
    termEvidence.some((entry, index) => entry !== state.termEvidence[index]) ||
    aliasEvidence.some((entry, index) => entry !== state.aliasEvidence[index]) ||
    revertStrikes.some((entry, index) => entry !== state.revertStrikes[index]);
  if (!changed) return success(state, false);
  // Aging is part of the admission it belongs to. A turn that cannot age its
  // evidence fails whole rather than silently committing without the aging.
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  return commit(state, state.revision + 1, {
    lexemes,
    termEvidence,
    aliasEvidence,
    revertStrikes,
  });
}

type WikiAgingScope = Readonly<{
  locale: WikiRuleDescriptor["locale"];
  channel: WikiRuleDescriptor["channel"];
  scripts: WikiScriptMask;
}>;

const NO_AGING: readonly WikiAgingScope[] = Object.freeze([]);

/** The turn's own opportunity and, when it routed Latin words, that ledger's. */
function agingScopes(tick: WikiLedgerTick): readonly WikiAgingScope[] {
  if (tick.disposition !== "observed" && tick.disposition !== "quiet") return NO_AGING;
  const opportunities = tick.routedOpportunity === undefined
    ? [tick.opportunity]
    : [tick.opportunity, tick.routedOpportunity];
  return Object.freeze(opportunities.map((opportunity) => Object.freeze({
    locale: opportunity.locale,
    channel: opportunity.channel,
    scripts: wikiScriptMaskFromClasses(opportunity.scripts),
  })));
}
