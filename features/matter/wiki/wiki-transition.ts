import {
  freezeWikiState,
  storedAliasKey,
  storedDecisionKey,
  validateWikiState,
} from "./wiki-invariants";
import {
  resolveWikiAliasCompetition,
  type WikiAliasCandidate,
  type WikiAliasReleaseQualification,
} from "./wiki-learning-policy";
import type {
  WikiAliasDescriptor,
  WikiAliasEvidenceAggregate,
  WikiLexeme,
  WikiRevertStrike,
  WikiRuleDescriptor,
  WikiState,
  WikiTransitionResult,
} from "./wiki-model";

/**
 * The commit boundary every Wiki state transition ends in, shared by human
 * decisions, observation batches, aging, and occurrence settlement: how a
 * candidate becomes one frozen, validated state or a stable failure, the
 * identity of one alias-evidence row, and the competition that decides its
 * phase. It owns no decision policy of its own.
 */

export function transitionSuccess(state: WikiState, changed: boolean): WikiTransitionResult {
  return Object.freeze({ ok: true, state, changed });
}

export function transitionFailure(
  code: "INVALID_STATE" | "INVALID_EVENT" | "BOUND_EXCEEDED",
  message: string,
): WikiTransitionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

export function commitAtRevision(
  state: WikiState,
  revision: number,
  replacement: Partial<WikiState>,
): WikiTransitionResult {
  const merged = { ...state, ...replacement, revision };
  const next = freezeWikiState({ ...merged, revertStrikes: retainRevertStrikes(merged) });
  const validation = validateWikiState(next);
  if (!validation.ok) return transitionFailure("INVALID_STATE", validation.message);
  return transitionSuccess(next, true);
}

/**
 * Strikes are soft memory for automatic aliases only. Any human decision on
 * the same visible alias, removal of its lexeme, or a rename that makes the
 * form canonical supersedes the strike inside the same transition.
 */
function retainRevertStrikes(state: WikiState): readonly WikiRevertStrike[] {
  if (state.revertStrikes.length === 0) return state.revertStrikes;
  const lexemesById = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const decided = new Set([
    ...state.authorities.map(storedDecisionKey),
    ...state.aliasTombstones.map(storedDecisionKey),
  ]);
  const retained = state.revertStrikes.filter((strike) => {
    const lexeme = lexemesById.get(strike.lexemeId);
    return lexeme !== undefined && lexeme.canonical !== strike.form &&
      !decided.has(storedDecisionKey(strike));
  });
  return retained.length === state.revertStrikes.length
    ? state.revertStrikes
    : Object.freeze(retained);
}

export function findLexeme(
  state: WikiState,
  identity: Pick<WikiRuleDescriptor, "locale" | "canonical">,
): WikiLexeme | undefined {
  return state.lexemes.find((entry) =>
    entry.locale === identity.locale && entry.canonical === identity.canonical);
}

export function aliasDescriptor(
  descriptor: Pick<WikiRuleDescriptor, "channel" | "boundary" | "form">,
  lexemeId: number,
): WikiAliasDescriptor {
  return Object.freeze({
    lexemeId,
    channel: descriptor.channel,
    boundary: descriptor.boundary,
    form: descriptor.form,
  });
}

export function storedAliasEvidenceKey(
  evidence: WikiAliasDescriptor & Pick<WikiAliasEvidenceAggregate, "producer">,
): string {
  return JSON.stringify([
    evidence.lexemeId,
    evidence.channel,
    evidence.boundary,
    evidence.form,
    evidence.producer,
  ]);
}

export function aliasCandidate(entry: WikiAliasEvidenceAggregate): WikiAliasCandidate {
  return Object.freeze({
    candidateId: storedAliasEvidenceKey(entry),
    producer: entry.producer,
    phase: entry.phase,
    support: entry.support,
    quietTurns: entry.quietTurns,
    kept: entry.kept,
    keptQuietTurns: entry.keptQuietTurns,
  });
}

/** Re-resolves every visible form's competition after its evidence changed. */
export function reconcileAliasEvidencePhases(
  state: WikiState,
  qualifiedProducers: WikiAliasReleaseQualification,
  mustAdvanceRevision: boolean,
): WikiTransitionResult {
  if (state.aliasEvidence.length === 0) return transitionSuccess(state, false);
  const lexemes = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const groups = new Map<string, WikiAliasEvidenceAggregate[]>();
  for (const entry of state.aliasEvidence) {
    const lexeme = lexemes.get(entry.lexemeId);
    if (lexeme === undefined) continue;
    const key = storedAliasKey(entry, lexeme.locale);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const phases = new Map<string, WikiAliasEvidenceAggregate["phase"]>();
  for (const group of groups.values()) {
    const resolved = resolveWikiAliasCompetition(
      group.map(aliasCandidate),
      qualifiedProducers,
    );
    for (const candidate of resolved) phases.set(candidate.candidateId, candidate.phase);
  }
  let changed = false;
  const aliasEvidence = state.aliasEvidence.map((entry) => {
    const phase = phases.get(storedAliasEvidenceKey(entry)) ?? "candidate";
    if (phase === entry.phase) return entry;
    changed = true;
    return Object.freeze({ ...entry, phase });
  });
  if (!changed) return transitionSuccess(state, false);
  if (mustAdvanceRevision && state.revision === Number.MAX_SAFE_INTEGER) {
    return transitionFailure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  return commitAtRevision(
    state,
    mustAdvanceRevision ? state.revision + 1 : state.revision,
    { aliasEvidence: Object.freeze(aliasEvidence) },
  );
}
