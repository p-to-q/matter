import {
  isWikiDescriptor,
  isWikiOccurrenceId,
  storedAliasKey,
  storedDecisionKey,
  storedDescriptorKey,
  validateWikiState,
} from "./wiki-invariants";
import {
  compareWikiAliasProducerPrecedence,
  decideWikiOccurrenceEffect,
  hasWikiKeptSettlementSinceTurn,
  isWikiOccurrenceOutcome,
  settleWikiKeptEvidence,
  type WikiAliasReleaseQualification,
  type WikiOccurrenceEffect,
} from "./wiki-learning-policy";
import {
  MAX_WIKI_REVERT_STRIKES,
  MAX_WIKI_SETTLED_OCCURRENCES,
  type WikiAppliedRule,
  type WikiEvent,
  type WikiOccurrenceSettlement,
  type WikiRevertStrike,
  type WikiRuleDescriptor,
  type WikiRuleMaturity,
  type WikiOutcomeCounters,
  type WikiState,
  type WikiTransitionResult,
} from "./wiki-model";
import {
  aliasDescriptor,
  commitAtRevision,
  findLexeme,
  reconcileAliasEvidencePhases,
  transitionFailure as failure,
  transitionSuccess as success,
} from "./wiki-transition";
import { incrementWikiOutcome } from "./wiki-diagnostics";

/**
 * Occurrence settlement: the state transition for one applied occurrence's
 * single outcome. The pure outcome policy lives in `wiki-learning-policy.ts`;
 * this module applies its effect to the state. It never makes a human
 * decision itself: explicit outcomes, and the tombstone a second revert
 * earns, go through the human decision paths its caller supplies.
 */

/** The human authority paths an explicit outcome is routed through. */
export type WikiRuleDecision = (
  state: WikiState,
  event: Extract<WikiEvent, { type: "confirm-rule" | "reject-rule" | "replace-rule" }>,
) => WikiTransitionResult;

/**
 * Records the one settlement of one applied occurrence. Explicit decisions use
 * the existing human authority paths. Authority is read from the current
 * state, never from the caller: confirmed human rules and tombstones stay
 * outside scoring. Informed acceptance only adds bounded kept evidence to a
 * relation that already holds producer evidence. A revert returns every
 * automatic rewrite of that visible form to zero and remembers one strike; a
 * second revert becomes a tombstone only for an occurrence applied from a
 * basis that already held the first strike. A revert of a relation without
 * evidence is neutral. At most one scoring effect is recorded per occurrence
 * identity within the bounded settled window.
 */
export function settleWikiOccurrence(
  state: WikiState,
  settlement: WikiOccurrenceSettlement,
  qualifiedAliasProducers: WikiAliasReleaseQualification,
  decide: WikiRuleDecision,
): WikiTransitionResult {
  const stateValidation = validateWikiState(state);
  if (!stateValidation.ok) return failure("INVALID_STATE", stateValidation.message);
  if (!isWikiOccurrenceSettlement(settlement) ||
      settlement.rule.appliedAtRevision > state.revision) {
    return failure("INVALID_EVENT", "The Wiki occurrence settlement is invalid.");
  }
  const rule = ruleDescriptor(settlement.rule);
  const effect = decideWikiOccurrenceEffect(
    settlement.outcome,
    currentAuthority(state, rule),
    settlement.origin,
  );
  if (settlement.outcome === "censored") return success(state, false);
  const explicit = effect.kind === "confirm" || effect.kind === "reject" ||
    effect.kind === "replace";
  const duplicate = state.settledOccurrences.includes(settlement.occurrenceId);
  if (!explicit && duplicate) {
    return success(state, false);
  }
  let result: WikiTransitionResult;
  if (effect.kind === "confirm") {
    result = decide(state, Object.freeze({ type: "confirm-rule", ...rule }));
  } else if (effect.kind === "reject") {
    result = decide(state, Object.freeze({ type: "reject-rule", ...rule }));
  } else if (effect.kind === "replace") {
    if (settlement.outcome !== "explicit-replace") {
      return failure("INVALID_EVENT", "The Wiki occurrence settlement is invalid.");
    }
    result = decide(state, Object.freeze({
      type: "replace-rule",
      before: rule,
      after: settlement.replacement,
    }));
  } else if (effect.kind === "strike") {
    result = strikeRevertedAlias(state, rule, settlement.rule.appliedAtRevision, decide);
  } else if (effect.kind === "kept") {
    result = keepAppliedAlias(
      state,
      rule,
      settlement.rule.appliedAtRevision,
      effect,
      qualifiedAliasProducers,
    );
  } else {
    result = success(state, false);
  }
  if (!result.ok) return result;
  if (!duplicate) {
    const maturity = settleMaturity(state, result.state, rule, settlement);
    if (!maturity.ok) return maturity;
    result = success(maturity.state, result.changed || maturity.changed);
  }
  if (!result.ok) return result;
  if (!result.changed) return result;
  const counter = outcomeCounter(settlement.outcome);
  const counted = counter === null ? result : commitAtRevision(result.state, result.state.revision, {
    outcomeCounters: incrementWikiOutcome(result.state.outcomeCounters, counter),
  });
  return counted.ok ? recordSettledOccurrence(counted.state, settlement.occurrenceId) : counted;
}

function outcomeCounter(outcome: WikiOccurrenceSettlement["outcome"]): keyof WikiOutcomeCounters | null {
  switch (outcome) {
    case "accepted-implicit": return "acceptedImplicit";
    case "inspected-kept": return "inspectedKept";
    case "explicit-confirm": return "explicitConfirm";
    case "explicit-reject": return "explicitReject";
    case "explicit-replace": return "explicitReplace";
    case "reverted": return "reverted";
    default: return null;
  }
}

function settleMaturity(
  original: WikiState, state: WikiState, rule: WikiRuleDescriptor,
  settlement: WikiOccurrenceSettlement,
): WikiTransitionResult {
  const kept = settlement.outcome === "accepted-implicit" || settlement.outcome === "inspected-kept";
  const reverted = settlement.outcome === "reverted";
  if (!kept && !reverted) return success(state, false);
  const lexeme = findLexeme(state, rule);
  if (lexeme === undefined) return success(state, false);
  const alias = aliasDescriptor(rule, lexeme.id);
  const key = storedDescriptorKey(alias);
  const confirmed = state.authorities.some((entry) => storedDescriptorKey(entry) === key);
  if (!confirmed && (state.automaticLearningSaturated ||
      !state.aliasEvidence.some((entry) => storedDescriptorKey(entry) === key) ||
      strikeSince(state, storedDecisionKey(alias), settlement.rule.appliedAtRevision) !== undefined)) {
    return success(state, false);
  }
  const previous = state.ruleMaturity.find((entry) => storedDescriptorKey(entry) === key);
  if (previous?.lastRevertedAtRevision !== null && previous?.lastRevertedAtRevision !== undefined &&
      settlement.rule.appliedAtRevision < previous.lastRevertedAtRevision) return success(state, false);
  if (kept && previous?.keptSettlements === 3) return success(state, false);
  if (state.revision === original.revision && state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  const revision = state.revision === original.revision ? state.revision + 1 : state.revision;
  const count = reverted ? 0 : Math.min(3, (previous?.keptSettlements ?? 0) + 1) as 1 | 2 | 3;
  const maturity: WikiRuleMaturity = Object.freeze({ ...alias, keptSettlements: count,
    establishedAt: count === 3 ? revision : null,
    lastRevertedAtRevision: reverted ? revision : previous?.lastRevertedAtRevision ?? null,
  });
  return commitAtRevision(state, revision, { ruleMaturity: Object.freeze([
    ...state.ruleMaturity.filter((entry) => storedDescriptorKey(entry) !== key), maturity,
  ]) });
}

function currentAuthority(
  state: WikiState,
  rule: WikiRuleDescriptor,
): "confirmed" | "provisional" {
  const lexeme = findLexeme(state, rule);
  if (lexeme === undefined) return "provisional";
  const key = storedDecisionKey(aliasDescriptor(rule, lexeme.id));
  return state.authorities.some((entry) => storedDecisionKey(entry) === key)
    ? "confirmed"
    : "provisional";
}

function recordSettledOccurrence(
  state: WikiState,
  occurrenceId: string,
): WikiTransitionResult {
  if (state.settledOccurrences.includes(occurrenceId)) return success(state, true);
  const settledOccurrences = [...state.settledOccurrences, occurrenceId]
    .slice(-MAX_WIKI_SETTLED_OCCURRENCES);
  return commitAtRevision(state, state.revision, {
    settledOccurrences: Object.freeze(settledOccurrences),
  });
}

/** A strike recorded after an occurrence was applied supersedes it. */
function strikeSince(
  state: WikiState,
  key: string,
  appliedAtRevision: number,
): WikiRevertStrike | undefined {
  return state.revertStrikes.find((entry) =>
    storedDecisionKey(entry) === key && entry.struckAtRevision > appliedAtRevision);
}

function keepAppliedAlias(
  state: WikiState,
  rule: WikiRuleDescriptor,
  appliedAtRevision: number,
  effect: Extract<WikiOccurrenceEffect, { kind: "kept" }>,
  qualifiedProducers: WikiAliasReleaseQualification,
): WikiTransitionResult {
  if (state.automaticLearningSaturated) return success(state, false);
  const lexeme = findLexeme(state, rule);
  if (lexeme === undefined) return success(state, false);
  // The person reverted this relation after the occurrence was applied; the
  // older acceptance no longer describes the current evidence.
  if (strikeSince(state, storedDecisionKey(aliasDescriptor(rule, lexeme.id)),
    appliedAtRevision) !== undefined) return success(state, false);
  const matches = state.aliasEvidence.flatMap((entry, index) =>
    entry.lexemeId === lexeme.id && entry.channel === rule.channel &&
      entry.boundary === rule.boundary && entry.form === rule.form
      ? [index]
      : []);
  // Informed acceptance reinforces a relation that producer evidence already
  // holds. It never creates one, so a relation that has since expired stays
  // expired rather than being rebuilt from implicit evidence.
  const index = matches.sort((left, right) =>
    Number(state.aliasEvidence[right]!.phase === "active") -
      Number(state.aliasEvidence[left]!.phase === "active") ||
    compareWikiAliasProducerPrecedence(
      state.aliasEvidence[left]!.producer,
      state.aliasEvidence[right]!.producer,
    ))[0];
  if (index === undefined) return success(state, false);
  const entry = state.aliasEvidence[index]!;
  if (effect.implicit && hasWikiKeptSettlementSinceTurn(entry)) {
    return success(state, false);
  }
  const kept = settleWikiKeptEvidence(entry, effect.units);
  if (kept.kept === entry.kept && kept.keptQuietTurns === entry.keptQuietTurns) {
    return success(state, false);
  }
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  const aliasEvidence = [...state.aliasEvidence];
  aliasEvidence[index] = Object.freeze({ ...entry, ...kept });
  const committed = commitAtRevision(state, state.revision + 1, { aliasEvidence });
  if (!committed.ok) return committed;
  const reconciled = reconcileAliasEvidencePhases(committed.state, qualifiedProducers, false);
  return reconciled.ok ? success(reconciled.state, true) : reconciled;
}

function strikeRevertedAlias(
  state: WikiState,
  rule: WikiRuleDescriptor,
  appliedAtRevision: number,
  decide: WikiRuleDecision,
): WikiTransitionResult {
  const lexeme = findLexeme(state, rule);
  if (lexeme === undefined) return success(state, false);
  const alias = aliasDescriptor(rule, lexeme.id);
  const key = storedDecisionKey(alias);
  if (state.authorities.some((entry) => storedDecisionKey(entry) === key) ||
      state.aliasTombstones.some((entry) => storedDecisionKey(entry) === key)) {
    return success(state, false);
  }
  // Without relation evidence there is nothing automatic to demote: a stale or
  // duplicate revert is neutral and can never become a tombstone by itself.
  if (!state.aliasEvidence.some((entry) => storedDecisionKey(entry) === key)) {
    return success(state, false);
  }
  const priorStrike = state.revertStrikes.find((entry) => storedDecisionKey(entry) === key);
  // A revert of an occurrence applied before the first strike belongs to the
  // same application epoch; it neither escalates nor strikes again.
  if (priorStrike !== undefined && appliedAtRevision < priorStrike.struckAtRevision) {
    return success(state, false);
  }
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  // Reverting restores the heard form. That is evidence against every
  // automatic rewrite of this visible form, so a competing canonical cannot
  // take over merely because the reverted one stepped aside.
  const lexemesById = new Map(state.lexemes.map((entry) => [entry.id, entry]));
  const visibleAlias = storedAliasKey(alias, lexeme.locale);
  const aliasEvidence = state.aliasEvidence.filter((entry) => {
    const target = lexemesById.get(entry.lexemeId);
    return target === undefined || storedAliasKey(entry, target.locale) !== visibleAlias;
  });
  if (priorStrike !== undefined || state.revertStrikes.length >= MAX_WIKI_REVERT_STRIKES) {
    // A second revert after the first strike took effect is a durable
    // rejection. When no strike memory is free, the stronger reading wins
    // rather than dropping a person's negative evidence.
    const cleared = commitAtRevision(state, state.revision, { aliasEvidence });
    if (!cleared.ok) return cleared;
    return decide(cleared.state, Object.freeze({ type: "reject-rule", ...rule }));
  }
  const revision = state.revision + 1;
  const strike: WikiRevertStrike = Object.freeze({
    lexemeId: lexeme.id,
    channel: rule.channel,
    form: rule.form,
    quietTurns: 0,
    struckAtRevision: revision,
  });
  return commitAtRevision(state, revision, {
    aliasEvidence,
    revertStrikes: Object.freeze([...state.revertStrikes, strike]),
  });
}

function isWikiOccurrenceSettlement(value: unknown): value is WikiOccurrenceSettlement {
  if (!isPlainRecord(value) || !isWikiOccurrenceId(value.occurrenceId) ||
      !isWikiOccurrenceOutcome(value.outcome) ||
      (value.origin !== "human-admission" && value.origin !== "generated") ||
      !isAppliedRule(value.rule)) return false;
  if (value.outcome === "explicit-replace") {
    return hasOnlyKeys(value, ["occurrenceId", "outcome", "rule", "origin", "replacement"]) &&
      isWikiDescriptor(value.replacement);
  }
  return hasOnlyKeys(value, ["occurrenceId", "outcome", "rule", "origin"]);
}

function isAppliedRule(value: unknown): value is WikiAppliedRule {
  return isPlainRecord(value) &&
    hasOnlyKeys(value, [
      "locale", "channel", "boundary", "form", "canonical", "appliedAtRevision",
    ]) &&
    typeof value.appliedAtRevision === "number" &&
    Number.isSafeInteger(value.appliedAtRevision) && value.appliedAtRevision >= 0 &&
    isWikiDescriptor(ruleDescriptor(value as WikiAppliedRule));
}

function ruleDescriptor(rule: WikiAppliedRule): WikiRuleDescriptor {
  return Object.freeze({
    locale: rule.locale,
    channel: rule.channel,
    boundary: rule.boundary,
    form: rule.form,
    canonical: rule.canonical,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
