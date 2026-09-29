import { isMatterLocale } from "../config/locales";
import {
  compareDescriptor,
  decisionKey,
  freezeWikiState,
  isValidatedFrozenWikiState,
  isWikiCanonical,
  isWikiDescriptor,
  isWikiLexemeScope,
  isWikiOccurrenceId,
  lexemeKey,
  storedAliasKey,
  storedDecisionKey,
  validateWikiState,
} from "./wiki-invariants";
import {
  MAX_WIKI_AUTHORITY_RULES,
  MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS,
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_APPLICABLE_RULES,
  MAX_WIKI_HUMAN_CONFIRMED_LEXEMES,
  MAX_WIKI_LEXEMES,
  MAX_WIKI_LEXEME_TOMBSTONES,
  MAX_WIKI_OBSERVATIONS_PER_BATCH,
  MAX_WIKI_OBSERVATIONS_PER_LEDGER,
  MAX_WIKI_REVERT_STRIKES,
  MAX_WIKI_SETTLED_OCCURRENCES,
  MAX_WIKI_TOMBSTONES,
  WIKI_FITTING_VERSION,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  WIKI_STARTER_LEXEMES,
  isWikiStarterLexemeIdentity,
  type WikiAliasDescriptor,
  type WikiAliasEvidenceAggregate,
  type WikiAppliedRule,
  type WikiEvent,
  type WikiEvidenceOpportunity,
  type WikiLedgerTick,
  type WikiLexeme,
  type WikiLexemeScope,
  type WikiLexemeTombstone,
  type WikiMatchRule,
  type WikiObserveEvidenceEvent,
  type WikiObservationTick,
  type WikiOccurrenceSettlement,
  type WikiRevertStrike,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTombstone,
  type WikiTransitionResult,
} from "./wiki-model";
import {
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  advanceWikiAliasQuietTurn,
  advanceWikiKeptQuietTurn,
  advanceWikiRevertStrikeTurn,
  advanceWikiTermQuietTurn,
  compareWikiAliasProducerPrecedence,
  compareWikiEvictionOrder,
  compareWikiTermProducerPrecedence,
  decideWikiOccurrenceEffect,
  hasWikiKeptSettlementSinceTurn,
  isQualifiedCollectedWikiTermEvidence,
  isWikiOccurrenceOutcome,
  observeWikiAliasCandidate,
  observeWikiTermEvidence,
  settleWikiKeptEvidence,
  WIKI_TERM_PRODUCER_WEIGHTS,
  isWikiAliasEvidenceProducer,
  isWikiTermEvidenceProducer,
  reconcileWikiTermEvidence,
  resolveWikiAliasCompetition,
  scoreWikiAliasRetention,
  type WikiAliasCandidate,
  type WikiAliasEvidenceProducer,
  type WikiAliasReleaseQualification,
  type WikiEvictionCandidate,
  type WikiOccurrenceEffect,
} from "./wiki-learning-policy";
import {
  isWikiScriptClass,
  wikiScriptMask,
  wikiScriptMaskFromClasses,
  wikiScriptsCover,
  type WikiScriptMask,
} from "./wiki-script";
import { isWikiRoutedOpportunity } from "./wiki-script-routing";
import {
  isWikiQualifiedProducerRelease,
  type WikiQualifiedProducerRelease,
} from "./wiki-producer-qualification";

/**
 * Confirmed authority retains its existing maximal score receipt. Provisional
 * scoring is owned by wiki-learning-policy and remains release-gated.
 */
export const WIKI_SCORE_POLICY = Object.freeze({
  version: WIKI_SCORING_VERSION,
  confirmedRuleScore: 2_147_483_647,
});

const P_TO_Q_CANONICAL = "[p → q]";
const P_TO_Q_FORMS = Object.freeze(["P to Q", "p to q"] as const);
const ALL_WIKI_ALIAS_PRODUCERS = new Set<WikiAliasEvidenceProducer>(
  Object.keys(WIKI_ALIAS_PRODUCER_WEIGHTS) as WikiAliasEvidenceProducer[],
);

type WikiProjectionLexemeIndex = Readonly<{
  byId: ReadonlyMap<number, WikiLexeme>;
  canonicalKeys: ReadonlySet<string>;
}>;

// Projection indexes are derived solely from one immutable collection. Weak
// keys keep recovery-only rows from acquiring a second retention lifecycle.
const projectionLexemeIndexes = new WeakMap<object, WikiProjectionLexemeIndex>();
const projectionAuthorityAliases = new WeakMap<object, Readonly<{
  lexemes: readonly WikiLexeme[];
  aliases: ReadonlySet<string>;
}>>();
const projectionTombstones = new WeakMap<object, ReadonlySet<string>>();

export function createEmptyWikiState(): WikiState {
  return freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: 0,
    nextLexemeId: 1,
    automaticLearningSaturated: false,
    lexemes: [],
    termEvidence: [],
    aliasEvidence: [],
    authorities: [],
    aliasTombstones: [],
    lexemeTombstones: [],
    revertStrikes: [],
    settledOccurrences: [],
  });
}

/** Creates the four editable starter spellings in their stable product order. */
export function createInitialWikiState(): WikiState {
  return freezeWikiState({
    ...createEmptyWikiState(),
    nextLexemeId: WIKI_STARTER_LEXEMES.length + 1,
    lexemes: WIKI_STARTER_LEXEMES.map((entry, index) => Object.freeze({
      id: index + 1,
      ...entry,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    })),
    authorities: P_TO_Q_FORMS.map((form) => Object.freeze({
      lexemeId: 4,
      channel: "spoken" as const,
      boundary: "word" as const,
      form,
      confirmedAtRevision: 0,
    })),
  });
}

/** Adds missing starter spellings once while respecting a person's tombstones,
 * renamed entries, scope choices, and every existing canonical identity. */
export function ensureWikiStarterLexemes(state: WikiState): WikiTransitionResult {
  const validation = validateWikiState(state);
  if (!validation.ok) return failure("INVALID_STATE", validation.message);
  if (isPristineLegacyStarterState(state)) {
    return success(createInitialWikiState(), true);
  }

  let lexemes = state.lexemes;
  let authorities = state.authorities;
  let changed = false;
  const legacyPToQ = lexemes.find((entry) =>
    entry.locale === "en-US" && entry.canonical === P_TO_Q_CANONICAL);
  const currentPToQ = lexemes.find((entry) =>
    entry.locale === "zh-CN" && entry.canonical === P_TO_Q_CANONICAL);
  const legacyPToQRemoved = state.lexemeTombstones.some((entry) =>
    entry.locale === "en-US" && entry.canonical === P_TO_Q_CANONICAL);
  const safeLegacyPToQ = legacyPToQ !== undefined &&
    isAutomaticPToQStarter(state, legacyPToQ);
  const safeCurrentPToQ = currentPToQ !== undefined &&
    isAutomaticPToQStarter(state, currentPToQ);

  // Record V3 briefly shipped the product-owned p-to-q starter under en-US.
  // V4 repairs only that exact automatic seed. Unknown relations and anything
  // a person has taken over remain untouched rather than being guessed away.
  if (legacyPToQRemoved && safeCurrentPToQ) {
    lexemes = Object.freeze(lexemes.filter((entry) => entry.id !== currentPToQ.id));
    authorities = Object.freeze(authorities.filter((entry) => entry.lexemeId !== currentPToQ.id));
    changed = true;
  } else if (safeLegacyPToQ && currentPToQ !== undefined) {
    lexemes = Object.freeze(lexemes.filter((entry) => entry.id !== legacyPToQ.id));
    authorities = Object.freeze(authorities.filter((entry) => entry.lexemeId !== legacyPToQ.id));
    changed = true;
  } else if (safeLegacyPToQ && currentPToQ === undefined && !legacyPToQRemoved) {
    lexemes = Object.freeze(lexemes.map((entry) => entry.id === legacyPToQ.id
      ? Object.freeze({ ...entry, locale: "zh-CN" as const })
      : entry));
    changed = true;
  }

  // A saturated decision ledger cannot prove that an absent starter was never
  // removed. Human agency wins over optional seed completion.
  if (state.automaticLearningSaturated) {
    if (!changed) return success(state, false);
    if (state.revision === Number.MAX_SAFE_INTEGER) {
      return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
    }
    return commitAtRevision(state, state.revision + 1, { lexemes, authorities });
  }

  let nextLexemeId = state.nextLexemeId;
  for (const starter of WIKI_STARTER_LEXEMES) {
    if (starter.canonical === P_TO_Q_CANONICAL && legacyPToQRemoved) continue;
    const key = lexemeKey(starter);
    if (lexemes.some((entry) => lexemeKey(entry) === key) ||
        state.lexemeTombstones.some((entry) => lexemeKey(entry) === key)) continue;
    if (lexemes.length >= MAX_WIKI_LEXEMES || nextLexemeId === Number.MAX_SAFE_INTEGER) {
      return failure("BOUND_EXCEEDED", "The Wiki lexeme bound is exceeded.");
    }
    lexemes = Object.freeze([...lexemes, Object.freeze({
      id: nextLexemeId,
      ...starter,
      provenance: "aggregate-evidence" as const,
      confirmedAtRevision: null,
    })]);
    nextLexemeId += 1;
    changed = true;
  }

  const pToQ = lexemes.find((entry) =>
    entry.locale === "zh-CN" && entry.canonical === "[p → q]");
  if (pToQ !== undefined && isAutomaticPToQStarter(state, pToQ)) {
    const lexemesById = new Map(lexemes.map((entry) => [entry.id, entry]));
    for (const form of P_TO_Q_FORMS) {
      const alias = storedAliasKey({ channel: "spoken", form }, pToQ.locale);
      const claimed = authorities.some((entry) => {
        const target = lexemesById.get(entry.lexemeId);
        return target !== undefined && storedAliasKey(entry, target.locale) === alias;
      });
      const rejected = state.aliasTombstones.some((entry) =>
        entry.lexemeId === pToQ.id && entry.channel === "spoken" && entry.form === form);
      if (claimed || rejected) continue;
      if (authorities.length >= MAX_WIKI_AUTHORITY_RULES) {
        return failure("BOUND_EXCEEDED", "The Wiki authority bound is exceeded.");
      }
      authorities = Object.freeze([...authorities, Object.freeze({
        lexemeId: pToQ.id,
        channel: "spoken" as const,
        boundary: "word" as const,
        form,
        confirmedAtRevision: state.revision + 1,
      })]);
      changed = true;
    }
  }

  if (!changed) return success(state, false);
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  return commitAtRevision(state, state.revision + 1, {
    lexemes,
    nextLexemeId,
    authorities,
  });
}

function isAutomaticPToQStarter(state: WikiState, lexeme: WikiLexeme): boolean {
  if (
    lexeme.canonical !== P_TO_Q_CANONICAL ||
    lexeme.scope !== "both" ||
    lexeme.provenance !== "aggregate-evidence" ||
    lexeme.confirmedAtRevision !== null ||
    state.termEvidence.some((entry) => lexemeKey(entry) === lexemeKey(lexeme)) ||
    state.aliasEvidence.some((entry) => entry.lexemeId === lexeme.id) ||
    state.aliasTombstones.some((entry) => entry.lexemeId === lexeme.id) ||
    state.revertStrikes.some((entry) => entry.lexemeId === lexeme.id)
  ) return false;
  return state.authorities.every((entry) => entry.lexemeId !== lexeme.id || (
    entry.channel === "spoken" &&
    entry.boundary === "word" &&
    P_TO_Q_FORMS.includes(entry.form as (typeof P_TO_Q_FORMS)[number])
  ));
}

function isPristineLegacyStarterState(state: WikiState): boolean {
  const tail = ["Morphogenesis", "KFC", "[p → q]"];
  const first = state.lexemes[0]?.canonical;
  return state.revision === 0 &&
    state.nextLexemeId === tail.length + 2 &&
    !state.automaticLearningSaturated &&
    state.termEvidence.length === 0 &&
    state.aliasEvidence.length === 0 &&
    state.authorities.length === 0 &&
    state.aliasTombstones.length === 0 &&
    state.lexemeTombstones.length === 0 &&
    state.revertStrikes.length === 0 &&
    state.settledOccurrences.length === 0 &&
    state.lexemes.length === tail.length + 1 &&
    (first === "Matter" || first === "Douglas Engelbart" || first === "Engelbart") &&
    state.lexemes.every((entry, index) =>
      entry.id === index + 1 &&
      entry.locale === "en-US" &&
      (index === 0 || entry.canonical === tail[index - 1]) &&
      entry.scope === "both" &&
      entry.provenance === "human-confirmed" &&
      entry.confirmedAtRevision === 0);
}

export function applyWikiEvent(state: WikiState, event: WikiEvent): WikiTransitionResult {
  const stateValidation = validateWikiState(state);
  if (!stateValidation.ok) return failure("INVALID_STATE", stateValidation.message);
  if (!isWikiEvent(event)) return failure("INVALID_EVENT", "The Wiki event is invalid.");

  if (event.type === "observe-evidence") return observeEvidence(state, event);
  if (event.type === "confirm-rule") return confirmRule(state, event);
  if (event.type === "reject-rule") return rejectRule(state, event);
  if (event.type === "replace-rule") return replaceRule(state, event);
  if (event.type === "create-lexeme") return createLexeme(state, event);
  if (event.type === "rename-lexeme") return renameLexeme(state, event);
  return removeLexeme(state, event);
}

/**
 * Folds one bounded human-admission batch atomically before the coordinator
 * saves it once. The tick states what the turn offered each ledger; only the
 * successful human-admission owner can construct one.
 */
export function applyWikiObservationBatch(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
  tick: WikiObservationTick,
  qualifiedAliasProducers: WikiAliasReleaseQualification = ALL_WIKI_ALIAS_PRODUCERS,
): WikiTransitionResult {
  const stateValidation = validateWikiState(state);
  if (!stateValidation.ok) return failure("INVALID_STATE", stateValidation.message);
  if (!Array.isArray(events) || events.length > MAX_WIKI_OBSERVATIONS_PER_BATCH ||
      events.filter((event) => event?.source === "recent-material").length >
        MAX_WIKI_OBSERVATIONS_PER_LEDGER ||
      events.filter((event) => event?.source !== "recent-material").length >
        MAX_WIKI_OBSERVATIONS_PER_LEDGER) {
    return failure("BOUND_EXCEEDED", "The Wiki observation batch bound is exceeded.");
  }
  if (!isWikiObservationTick(tick)) {
    return failure("INVALID_EVENT", "The Wiki observation tick is invalid.");
  }
  // A caller cannot smuggle evidence through a paused, censored, or explicitly
  // quiet ledger. The disposition is the admission decision for that ledger.
  const admittedEvents = events.filter((event) => admitsObservations(
    event.source === "recent-material" ? tick.term : tick.alias,
  ));
  const unique = new Map<string, WikiObserveEvidenceEvent>();
  for (const event of admittedEvents) {
    // A human-admission tick can mention one canonical through several visible
    // occurrences. Recurrence is evidence across turns, not raw frequency
    // within one material change. When two producers describe the same term
    // or relation in one turn, explicit precedence decides, never input order.
    const key = observationIdentity(event);
    const previous = unique.get(key);
    if (previous === undefined || compareObservationProducer(event, previous) < 0) {
      unique.set(key, event);
    }
  }
  let working = advanceUnobservedEvidence(state, [...unique.values()], tick);
  // Rows observed in this turn are never evicted to make room for its newcomers.
  const observedThisTurn: ReadonlySet<string> = new Set(unique.keys());
  for (const event of [...unique.values()].sort(compareObservation)) {
    const result = isWikiEvent(event)
      ? observeEvidence(working, event, observedThisTurn)
      : failure("INVALID_EVENT", "The Wiki event is invalid.");
    if (!result.ok) return result;
    working = result.state;
  }
  const reconciled = reconcileAliasEvidencePhases(
    working,
    qualifiedAliasProducers,
    working.revision === state.revision,
  );
  if (!reconciled.ok) return reconciled;
  working = reconciled.state;
  return success(working, working !== state);
}

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
export function applyWikiOccurrenceSettlement(
  state: WikiState,
  settlement: WikiOccurrenceSettlement,
  qualifiedAliasProducers: WikiAliasReleaseQualification = ALL_WIKI_ALIAS_PRODUCERS,
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
  if (effect.kind === "neutral") return success(state, false);
  const explicit = effect.kind === "confirm" || effect.kind === "reject" ||
    effect.kind === "replace";
  if (!explicit && state.settledOccurrences.includes(settlement.occurrenceId)) {
    return success(state, false);
  }
  let result: WikiTransitionResult;
  if (effect.kind === "confirm") {
    result = applyWikiEvent(state, Object.freeze({ type: "confirm-rule", ...rule }));
  } else if (effect.kind === "reject") {
    result = applyWikiEvent(state, Object.freeze({ type: "reject-rule", ...rule }));
  } else if (effect.kind === "replace") {
    if (settlement.outcome !== "explicit-replace") {
      return failure("INVALID_EVENT", "The Wiki occurrence settlement is invalid.");
    }
    result = applyWikiEvent(state, Object.freeze({
      type: "replace-rule",
      before: rule,
      after: settlement.replacement,
    }));
  } else if (effect.kind === "strike") {
    result = strikeRevertedAlias(state, rule, settlement.rule.appliedAtRevision);
  } else {
    result = keepAppliedAlias(
      state,
      rule,
      settlement.rule.appliedAtRevision,
      effect,
      qualifiedAliasProducers,
    );
  }
  if (!result.ok || !result.changed) return result;
  return recordSettledOccurrence(result.state, settlement.occurrenceId);
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
    return rejectRule(cleared.state, Object.freeze({ type: "reject-rule", ...rule }));
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

function reconcileAliasEvidencePhases(
  state: WikiState,
  qualifiedProducers: WikiAliasReleaseQualification,
  mustAdvanceRevision: boolean,
): WikiTransitionResult {
  if (state.aliasEvidence.length === 0) return success(state, false);
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
  if (!changed) return success(state, false);
  if (mustAdvanceRevision && state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("BOUND_EXCEEDED", "The Wiki revision bound is exceeded.");
  }
  return commitAtRevision(
    state,
    mustAdvanceRevision ? state.revision + 1 : state.revision,
    { aliasEvidence: Object.freeze(aliasEvidence) },
  );
}

/** Clears learned and explicit authority without resetting monotonic lineage. */
export function clearWikiState(state: WikiState): WikiTransitionResult {
  const validation = validateWikiState(state);
  if (!validation.ok) return failure("INVALID_STATE", validation.message);
  if (
    state.lexemes.length === 0 &&
    state.termEvidence.length === 0 &&
    state.aliasEvidence.length === 0 &&
    state.authorities.length === 0 &&
    state.aliasTombstones.length === 0 &&
    state.lexemeTombstones.length === 0 &&
    state.revertStrikes.length === 0 &&
    state.settledOccurrences.length === 0 &&
    !state.automaticLearningSaturated
  ) return success(state, false);
  return commit(state, {
    nextLexemeId: state.nextLexemeId,
    automaticLearningSaturated: false,
    lexemes: Object.freeze([]),
    termEvidence: Object.freeze([]),
    aliasEvidence: Object.freeze([]),
    authorities: Object.freeze([]),
    aliasTombstones: Object.freeze([]),
    lexemeTombstones: Object.freeze([]),
    revertStrikes: Object.freeze([]),
    settledOccurrences: Object.freeze([]),
  });
}

export type WikiProjectionPolicy = Readonly<{
  includeProvisional: boolean;
  qualifiedProducerReleases: readonly WikiQualifiedProducerRelease[];
}>;
export const WIKI_CONFIRMED_ONLY: WikiProjectionPolicy = Object.freeze({
  includeProvisional: false,
  qualifiedProducerReleases: Object.freeze([]),
});
export const WIKI_WITH_PROVISIONAL: WikiProjectionPolicy = Object.freeze({
  includeProvisional: true,
  qualifiedProducerReleases: Object.freeze([]),
});

/** Runtime policy consumes complete release identities or fails closed. */
export function createWikiProjectionPolicy(
  releases: readonly WikiQualifiedProducerRelease[],
): WikiProjectionPolicy {
  if (!Array.isArray(releases) ||
      releases.some((release) => !isWikiQualifiedProducerRelease(release)) ||
      new Set(releases.map((release) => release.identity.producerId)).size !==
        releases.length) return WIKI_CONFIRMED_ONLY;
  return Object.freeze({
    includeProvisional: releases.length > 0,
    qualifiedProducerReleases: Object.freeze([...releases]),
  });
}

/** The only resolved projection consumed by the material matcher. */
export function projectApplicableWikiRules(
  state: WikiState,
  policy: WikiProjectionPolicy = WIKI_WITH_PROVISIONAL,
): readonly WikiMatchRule[] {
  if (!validateWikiState(state).ok) return Object.freeze([]);
  const lexemeIndex = readProjectionLexemeIndex(state);
  const lexemes = lexemeIndex.byId;
  // A canonical is a no-op authority regardless of how it entered the Wiki.
  // Machine relation evidence may never turn one visible canonical into
  // another; that semantic choice requires explicit human authority.
  const canonicalKeys = lexemeIndex.canonicalKeys;
  const result: WikiMatchRule[] = [];

  for (const authority of state.authorities) {
    const lexeme = lexemes.get(authority.lexemeId);
    if (lexeme === undefined || !scopeIncludes(lexeme.scope, authority.channel) ||
        canonicalKeys.has(lexemeKey({
      locale: lexeme.locale,
      canonical: authority.form,
    }))) continue;
    result.push(resolveRule(authority, lexeme, "confirmed", "human-confirmed",
      WIKI_SCORE_POLICY.confirmedRuleScore));
  }

  if (!policy.includeProvisional || state.automaticLearningSaturated) {
    result.sort(compareDescriptor);
    return Object.freeze(result);
  }

  const confirmedAliases = readProjectionAuthorityAliases(state, lexemes);
  const tombstones = readProjectionTombstones(state);
  const candidatesByAlias = new Map<string, WikiAliasEvidenceAggregate[]>();
  const qualifiedTermProducers = new Set(
    policy.qualifiedProducerReleases.flatMap((release) =>
      isWikiTermEvidenceProducer(release.identity.producerId)
        ? [release.identity.producerId]
        : []),
  );
  const termEvidenceByIdentity = new Map(state.termEvidence.map((entry) => [
    lexemeKey(entry),
    entry,
  ]));

  for (const aggregate of state.aliasEvidence) {
    const lexeme = lexemes.get(aggregate.lexemeId);
    if (lexeme === undefined || !scopeIncludes(lexeme.scope, aggregate.channel)) continue;
    const termEvidence = termEvidenceByIdentity.get(lexemeKey(lexeme));
    if (lexeme.provenance === "aggregate-evidence" &&
        !isWikiStarterLexemeIdentity(lexeme) &&
        !isQualifiedCollectedWikiTermEvidence(termEvidence, qualifiedTermProducers)) continue;
    if (canonicalKeys.has(lexemeKey({
      locale: lexeme.locale,
      canonical: aggregate.form,
    }))) continue;
    const alias = storedAliasKey(aggregate, lexeme.locale);
    if (confirmedAliases.has(alias) || tombstones.has(storedDecisionKey(aggregate))) continue;
    const candidates = candidatesByAlias.get(alias) ?? [];
    candidates.push(aggregate);
    candidatesByAlias.set(alias, candidates);
  }

  const provisional: WikiMatchRule[] = [];
  const qualifiedProducers = new Set<WikiAliasEvidenceAggregate["producer"]>(
    policy.qualifiedProducerReleases.flatMap((release) =>
      isWikiAliasEvidenceProducer(release.identity.producerId)
        ? [release.identity.producerId]
        : []),
  );
  for (const evidence of candidatesByAlias.values()) {
    const candidates = evidence.map(aliasCandidate);
    const resolved = resolveWikiAliasCompetition(candidates, qualifiedProducers);
    const winner = resolved.find((candidate) => candidate.phase === "active");
    if (winner === undefined) continue;
    const aggregate = evidence.find((entry) =>
      storedAliasEvidenceKey(entry) === winner.candidateId);
    if (aggregate === undefined) continue;
    const lexeme = lexemes.get(aggregate.lexemeId);
    if (lexeme === undefined) continue;
    provisional.push(resolveRule(
      aggregate,
      lexeme,
      "provisional",
      "aggregate-evidence",
      scoreWikiAliasRetention(winner),
    ));
  }

  provisional.sort((left, right) =>
    right.score - left.score || compareDescriptor(left, right));
  let totalCodePoints = result.reduce((sum, rule) => sum + ruleCodePoints(rule), 0);
  for (const rule of provisional) {
    const codePoints = ruleCodePoints(rule);
    if (result.length >= MAX_WIKI_APPLICABLE_RULES ||
        totalCodePoints + codePoints > MAX_WIKI_APPLICABLE_CODE_POINTS) continue;
    result.push(rule);
    totalCodePoints += codePoints;
  }
  result.sort(compareDescriptor);
  return Object.freeze(result);
}

function readProjectionLexemeIndex(state: WikiState): WikiProjectionLexemeIndex {
  const cached = projectionLexemeIndexes.get(state.lexemes);
  if (cached !== undefined) return cached;
  const index = Object.freeze({
    byId: new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme])),
    canonicalKeys: new Set(state.lexemes.map(lexemeKey)),
  });
  if (isValidatedFrozenWikiState(state)) {
    projectionLexemeIndexes.set(state.lexemes, index);
  }
  return index;
}

function readProjectionAuthorityAliases(
  state: WikiState,
  lexemes: ReadonlyMap<number, WikiLexeme>,
): ReadonlySet<string> {
  const cached = projectionAuthorityAliases.get(state.authorities);
  if (cached !== undefined && cached.lexemes === state.lexemes) return cached.aliases;
  const aliases = new Set(state.authorities.flatMap((authority) => {
    const lexeme = lexemes.get(authority.lexemeId);
    return lexeme === undefined ? [] : [storedAliasKey(authority, lexeme.locale)];
  }));
  if (isValidatedFrozenWikiState(state)) {
    projectionAuthorityAliases.set(state.authorities, Object.freeze({
      lexemes: state.lexemes,
      aliases,
    }));
  }
  return aliases;
}

function readProjectionTombstones(state: WikiState): ReadonlySet<string> {
  const cached = projectionTombstones.get(state.aliasTombstones);
  if (cached !== undefined) return cached;
  const tombstones = new Set(state.aliasTombstones.map(storedDecisionKey));
  if (isValidatedFrozenWikiState(state)) {
    projectionTombstones.set(state.aliasTombstones, tombstones);
  }
  return tombstones;
}

function ruleCodePoints(rule: WikiRuleDescriptor): number {
  return Array.from(rule.form).length + Array.from(rule.canonical).length;
}

function observeEvidence(
  state: WikiState,
  event: Extract<WikiEvent, { type: "observe-evidence" }>,
  observedThisTurn: ReadonlySet<string> = EMPTY_IDENTITIES,
): WikiTransitionResult {
  if (state.automaticLearningSaturated) return success(state, false);
  if (hasLexemeTombstone(state, event)) return success(state, false);
  let working = state;
  const revision = state.revision + 1;
  if (event.source === "recent-material") {
    const existingLexeme = findLexeme(working, event);
    const index = working.termEvidence.findIndex((entry) =>
      lexemeKey(entry) === lexemeKey(event));
    if (existingLexeme?.provenance === "human-confirmed" ||
        (index === -1 && existingLexeme?.provenance === "aggregate-evidence" &&
          isWikiStarterLexemeIdentity(existingLexeme))) {
      return success(state, false);
    }
    if (index === -1 &&
        working.termEvidence.length >= MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS) {
      // A full reservoir makes room by evicting its weakest independent row,
      // so learning stays live after the person changes locale or script.
      const evicted = evictWeakestTermEvidence(working, observedThisTurn);
      if (evicted === null) return success(state, false);
      working = evicted;
    }
    const previous = index === -1 ||
      working.termEvidence[index]?.producer !== event.producer
      ? Object.freeze({
          phase: "candidate" as const,
          support: 0,
          quietTurns: 0,
        })
      : working.termEvidence[index];
    const observed = reconcileWikiTermEvidence(observeWikiTermEvidence(
      previous,
      WIKI_TERM_PRODUCER_WEIGHTS[event.producer],
    ));
    const termEvidence = [...working.termEvidence];
    const aggregate = Object.freeze({
      locale: event.locale,
      canonical: event.canonical,
      producer: event.producer,
      ...observed,
    });
    if (index === -1) termEvidence.push(aggregate);
    else termEvidence[index] = aggregate;
    if (aggregate.phase === "candidate") {
      // A producer release change can return a collected term to candidate; its
      // automatic lexeme leaves with it unless another relation depends on it.
      const lexemes = existingLexeme !== undefined &&
          existingLexeme.provenance === "aggregate-evidence" &&
          !isWikiStarterLexemeIdentity(existingLexeme) &&
          !dependentLexemeIds(working).has(existingLexeme.id)
        ? working.lexemes.filter((entry) => entry.id !== existingLexeme.id)
        : working.lexemes;
      return commitAtRevision(working, revision, { termEvidence, lexemes });
    }
    const ensured = ensureLexeme(working, event, "aggregate-evidence", revision);
    if (!ensured.ok) return ensured.result;
    return commitAtRevision(working, revision, {
      lexemes: ensured.lexemes,
      nextLexemeId: ensured.nextLexemeId,
      termEvidence,
    });
  }

  const lexeme = findLexeme(working, event);
  if (lexeme === undefined || !scopeIncludes(lexeme.scope, event.channel)) {
    return success(state, false);
  }
  const descriptor = aliasDescriptor(event, lexeme.id);
  const producer = event.producer;
  const key = storedAliasEvidenceKey({ ...descriptor, producer });
  const relationIndexesOf = (candidate: WikiState) =>
    candidate.aliasEvidence.flatMap((entry, index) =>
      entry.lexemeId === descriptor.lexemeId &&
      entry.channel === descriptor.channel &&
      entry.boundary === descriptor.boundary &&
      entry.form === descriptor.form
        ? [index]
        : []);
  let relationIndexes = relationIndexesOf(working);
  if (relationIndexes.length === 0 &&
      working.aliasEvidence.length >= MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS) {
    const evicted = evictWeakestAliasEvidence(working, observedThisTurn);
    if (evicted === null) return success(state, false);
    working = evicted;
    relationIndexes = relationIndexesOf(working);
  }
  const index = relationIndexes.find((candidate) =>
    storedAliasEvidenceKey(working.aliasEvidence[candidate]!) === key) ?? -1;
  const previous: WikiAliasEvidenceAggregate = index === -1
    ? Object.freeze({
        ...descriptor,
        producer,
        phase: "candidate" as const,
        support: 0,
        quietTurns: 0,
        kept: 0,
        keptQuietTurns: 0,
      })
    : working.aliasEvidence[index]!;
  const observed = observeWikiAliasCandidate(aliasCandidate(previous));
  if (observed.support === previous.support &&
      observed.quietTurns === previous.quietTurns &&
      relationIndexes.length === 1 && index !== -1) {
    return success(state, false);
  }
  // One visible relation has one evolving producer authority. On an algorithm
  // release change, reset its evidence instead of letting old and new producer
  // rows compete against the same canonical action.
  const relationIndexSet = new Set(relationIndexes);
  const aliasEvidence = working.aliasEvidence.filter((_, candidate) =>
    !relationIndexSet.has(candidate));
  const aggregate = Object.freeze({
    ...descriptor,
    producer: observed.producer,
    phase: observed.phase,
    support: observed.support,
    quietTurns: observed.quietTurns,
    kept: observed.kept,
    keptQuietTurns: observed.keptQuietTurns,
  });
  aliasEvidence.push(aggregate);
  return commitAtRevision(working, revision, {
    aliasEvidence,
  });
}

const EMPTY_IDENTITIES: ReadonlySet<string> = new Set();

/** Lexeme ids that a relation, human decision, or strike still depends on. */
function dependentLexemeIds(state: WikiState): ReadonlySet<number> {
  return new Set([
    ...state.aliasEvidence.map((entry) => entry.lexemeId),
    ...state.authorities.map((entry) => entry.lexemeId),
    ...state.aliasTombstones.map((entry) => entry.lexemeId),
    ...state.revertStrikes.map((entry) => entry.lexemeId),
  ]);
}

/**
 * Removes the weakest term row that nothing depends on, together with its
 * automatic lexeme. Human-owned terms, product starters, rows observed in this
 * turn, and any identity a relation, decision, or strike depends on stay.
 */
function evictWeakestTermEvidence(
  state: WikiState,
  observedThisTurn: ReadonlySet<string>,
): WikiState | null {
  const dependents = dependentLexemeIds(state);
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
function evictWeakestAliasEvidence(
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
function advanceUnobservedEvidence(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
  tick: WikiObservationTick,
): WikiState {
  const initialTermKeys = new Set(state.termEvidence.map(lexemeKey));
  const hasOwnerlessAutomaticLexeme = state.lexemes.some((lexeme) =>
    lexeme.provenance === "aggregate-evidence" &&
    !isWikiStarterLexemeIdentity(lexeme) &&
    !initialTermKeys.has(lexemeKey(lexeme)));
  if (state.termEvidence.length === 0 && state.aliasEvidence.length === 0 &&
      state.revertStrikes.length === 0 && !hasOwnerlessAutomaticLexeme) return state;
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
  const dependentLexemeIds = new Set([
    ...aliasEvidence.map((entry) => entry.lexemeId),
    ...state.authorities.map((entry) => entry.lexemeId),
    ...state.aliasTombstones.map((entry) => entry.lexemeId),
  ]);
  const dependentTermKeys = new Set(state.lexemes
    .filter((lexeme) => dependentLexemeIds.has(lexeme.id))
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
      dependentLexemeIds.has(lexeme.id);
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
  if (!changed) return state;
  const next = freezeWikiState({
    ...state,
    revision: state.revision + 1,
    lexemes,
    termEvidence,
    aliasEvidence,
    revertStrikes,
  });
  return validateWikiState(next).ok ? next : state;
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

function admitsObservations(tick: WikiLedgerTick): boolean {
  return tick.disposition === "observed" || tick.disposition === "partial";
}

function isWikiObservationTick(value: unknown): value is WikiObservationTick {
  return isPlainRecord(value) && hasOnlyKeys(value, ["term", "alias"]) &&
    isWikiLedgerTick(value.term) && isWikiLedgerTick(value.alias);
}

function isWikiLedgerTick(value: unknown): value is WikiLedgerTick {
  if (!isPlainRecord(value)) return false;
  if (value.disposition === "partial" || value.disposition === "paused" ||
      value.disposition === "censored") {
    return hasOnlyKeys(value, ["disposition"]);
  }
  if (value.disposition !== "observed" && value.disposition !== "quiet") return false;
  if (!isWikiEvidenceOpportunity(value.opportunity)) return false;
  if (!Object.hasOwn(value, "routedOpportunity")) {
    return hasOnlyKeys(value, ["disposition", "opportunity"]);
  }
  // A routed opportunity is accepted only for the one ledger the turn's
  // locale routes Latin words to; a caller cannot age an arbitrary locale.
  return hasOnlyKeys(value, ["disposition", "opportunity", "routedOpportunity"]) &&
    isWikiEvidenceOpportunity(value.routedOpportunity) &&
    isWikiRoutedOpportunity(value.opportunity, value.routedOpportunity);
}

function isWikiEvidenceOpportunity(value: unknown): value is WikiEvidenceOpportunity {
  return isPlainRecord(value) &&
    hasOnlyKeys(value, ["locale", "channel", "scripts"]) &&
    typeof value.locale === "string" && isMatterLocale(value.locale) &&
    (value.channel === "spoken" || value.channel === "written") &&
    Array.isArray(value.scripts) &&
    value.scripts.every(isWikiScriptClass) &&
    new Set(value.scripts).size === value.scripts.length;
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

function observationIdentity(event: WikiObserveEvidenceEvent): string {
  return event.source === "recent-material"
    ? JSON.stringify([event.source, event.locale, event.canonical])
    : JSON.stringify([
        event.source,
        event.locale,
        event.channel,
        event.boundary,
        event.form,
        event.canonical,
      ]);
}

function compareObservationProducer(
  left: WikiObserveEvidenceEvent,
  right: WikiObserveEvidenceEvent,
): number {
  if (left.source === "recent-material" && right.source === "recent-material") {
    return compareWikiTermProducerPrecedence(left.producer, right.producer);
  }
  if (left.source === "machine-inference" && right.source === "machine-inference") {
    return compareWikiAliasProducerPrecedence(left.producer, right.producer);
  }
  return 0;
}

function aliasCandidate(entry: WikiAliasEvidenceAggregate): WikiAliasCandidate {
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

function confirmRule(
  state: WikiState,
  event: Extract<WikiEvent, { type: "confirm-rule" }>,
): WikiTransitionResult {
  const revision = state.revision + 1;
  const ensured = ensureLexeme(state, event, "human-confirmed", revision);
  if (!ensured.ok) return ensured.result;
  if (hasCanonicalCollision(ensured.lexemes, event.locale, event.form, ensured.lexeme.id)) {
    return failure("INVALID_EVENT", "A canonical Wiki lexeme already owns this visible form.");
  }
  const target = aliasDescriptor(event, ensured.lexeme.id);
  const lexemesById = new Map(ensured.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const alias = storedAliasKey(target, event.locale);
  const previous = state.authorities.find((entry) => {
    const lexeme = lexemesById.get(entry.lexemeId);
    return lexeme !== undefined && storedAliasKey(entry, lexeme.locale) === alias;
  });
  const targetKey = storedDecisionKey(target);
  const targetTombstone = state.aliasTombstones.find((entry) =>
    storedDecisionKey(entry) === targetKey);
  if (previous !== undefined && storedDecisionKey(previous) === targetKey &&
      targetTombstone === undefined && !ensured.changed) return success(state, false);
  if (previous === undefined && state.authorities.length >= MAX_WIKI_AUTHORITY_RULES) {
    return failure("BOUND_EXCEEDED", "The Wiki authority bound is exceeded.");
  }

  const authorities = state.authorities.filter((entry) => {
    const lexeme = lexemesById.get(entry.lexemeId);
    return lexeme === undefined || storedAliasKey(entry, lexeme.locale) !== alias;
  });
  authorities.push(Object.freeze({ ...target, confirmedAtRevision: revision }));
  const aliasTombstones = state.aliasTombstones.filter((entry) =>
    storedDecisionKey(entry) !== targetKey);
  let automaticLearningSaturated = state.automaticLearningSaturated;
  if (previous !== undefined && storedDecisionKey(previous) !== targetKey) {
    automaticLearningSaturated ||= upsertAliasTombstone(
      aliasTombstones,
      previous,
      revision,
    );
  }
  return commitAtRevision(state, revision, {
    lexemes: ensured.lexemes,
    nextLexemeId: ensured.nextLexemeId,
    termEvidence: ensured.termEvidence,
    lexemeTombstones: removeLexemeTombstone(state.lexemeTombstones, event),
    authorities,
    aliasTombstones,
    automaticLearningSaturated,
  });
}

function rejectRule(
  state: WikiState,
  event: Extract<WikiEvent, { type: "reject-rule" }>,
): WikiTransitionResult {
  const lexeme = findLexeme(state, event);
  if (lexeme === undefined) return success(state, false);
  const target = aliasDescriptor(event, lexeme.id);
  const key = storedDecisionKey(target);
  const authority = state.authorities.find((entry) => storedDecisionKey(entry) === key);
  const tombstone = state.aliasTombstones.find((entry) => storedDecisionKey(entry) === key);
  if (authority === undefined && tombstone !== undefined) return success(state, false);
  const revision = state.revision + 1;
  const authorities = state.authorities.filter((entry) => storedDecisionKey(entry) !== key);
  const aliasTombstones = [...state.aliasTombstones];
  const saturated = upsertAliasTombstone(aliasTombstones, target, revision);
  return commitAtRevision(state, revision, {
    authorities,
    aliasTombstones,
    automaticLearningSaturated: state.automaticLearningSaturated || saturated,
  });
}

function replaceRule(
  state: WikiState,
  event: Extract<WikiEvent, { type: "replace-rule" }>,
): WikiTransitionResult {
  const beforeLexeme = findLexeme(state, event.before);
  if (beforeLexeme === undefined) {
    return failure("INVALID_EVENT", "The Wiki rule to replace is no longer current.");
  }
  const before = aliasDescriptor(event.before, beforeLexeme.id);
  const beforeKey = storedDecisionKey(before);
  const previous = state.authorities.find((entry) => storedDecisionKey(entry) === beforeKey);
  const provisional = previous === undefined
    ? projectApplicableWikiRules(state).find((entry) =>
      entry.authority === "provisional" && decisionKey(entry) === decisionKey(event.before))
    : undefined;
  if (previous === undefined && provisional === undefined) {
    return failure("INVALID_EVENT", "The Wiki rule to replace is no longer current.");
  }
  if (decisionKey(event.before) === decisionKey(event.after) &&
      event.before.boundary === event.after.boundary) return success(state, false);

  const revision = state.revision + 1;
  const ensured = ensureLexeme(state, event.after, "human-confirmed", revision);
  if (!ensured.ok) return ensured.result;
  if (hasCanonicalCollision(
    ensured.lexemes,
    event.after.locale,
    event.after.form,
    ensured.lexeme.id,
  )) return failure("INVALID_EVENT", "A canonical Wiki lexeme already owns this visible form.");
  const after = aliasDescriptor(event.after, ensured.lexeme.id);
  const lexemesById = new Map(ensured.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const afterAlias = storedAliasKey(after, event.after.locale);
  if (state.authorities.some((entry) => {
    if (storedDecisionKey(entry) === beforeKey) return false;
    const lexeme = lexemesById.get(entry.lexemeId);
    return lexeme !== undefined && storedAliasKey(entry, lexeme.locale) === afterAlias;
  })) return failure("INVALID_EVENT", "The replacement Wiki form already has an authority.");

  const authorities = state.authorities.filter((entry) => storedDecisionKey(entry) !== beforeKey);
  authorities.push(Object.freeze({ ...after, confirmedAtRevision: revision }));
  const afterKey = storedDecisionKey(after);
  const aliasTombstones = state.aliasTombstones.filter((entry) =>
    storedDecisionKey(entry) !== afterKey);
  const saturated = upsertAliasTombstone(aliasTombstones, before, revision);
  return commitAtRevision(state, revision, {
    lexemes: ensured.lexemes,
    nextLexemeId: ensured.nextLexemeId,
    termEvidence: ensured.termEvidence,
    lexemeTombstones: removeLexemeTombstone(state.lexemeTombstones, event.after),
    authorities,
    aliasTombstones,
    automaticLearningSaturated: state.automaticLearningSaturated || saturated,
  });
}

function createLexeme(
  state: WikiState,
  event: Extract<WikiEvent, { type: "create-lexeme" }>,
): WikiTransitionResult {
  const revision = state.revision + 1;
  const ensured = ensureLexeme(state, event, "human-confirmed", revision);
  const lexemeTombstones = removeLexemeTombstone(state.lexemeTombstones, event);
  if (!ensured.ok) return ensured.result;
  if (!ensured.changed && lexemeTombstones === state.lexemeTombstones) {
    return success(state, false);
  }
  const protectedIdentity = protectCanonicalIdentity(
    state,
    ensured.lexemes,
    event.locale,
    event.canonical,
    revision,
  );
  return commitAtRevision(state, revision, {
    lexemes: ensured.lexemes,
    nextLexemeId: ensured.nextLexemeId,
    termEvidence: ensured.termEvidence,
    lexemeTombstones,
    authorities: protectedIdentity.authorities,
    aliasTombstones: protectedIdentity.aliasTombstones,
    automaticLearningSaturated: protectedIdentity.automaticLearningSaturated,
  });
}

function renameLexeme(
  state: WikiState,
  event: Extract<WikiEvent, { type: "rename-lexeme" }>,
): WikiTransitionResult {
  const lexeme = state.lexemes.find((entry) => entry.id === event.lexemeId);
  if (lexeme === undefined) return failure("INVALID_EVENT", "The Wiki lexeme no longer exists.");
  if (lexeme.locale === event.locale && lexeme.canonical === event.canonical &&
      lexeme.scope === event.scope && lexeme.provenance === "human-confirmed") {
    return success(state, false);
  }
  if (lexeme.provenance !== "human-confirmed" && !hasHumanLexemeCapacity(state)) {
    return humanLexemeBoundExceeded();
  }
  if (lexeme.locale === event.locale && lexeme.canonical === event.canonical) {
    const revision = state.revision + 1;
    const lexemes = state.lexemes.map((entry) => entry.id === lexeme.id
      ? Object.freeze({
          ...entry,
          scope: event.scope,
          provenance: "human-confirmed" as const,
          confirmedAtRevision: revision,
        })
      : entry);
    // Scope is an applicability preference, not ownership of the stored
    // relations. Changing it must remain reversible and cannot tombstone or
    // discard evidence collected for the temporarily disabled channel.
    const protectedIdentity = protectCanonicalIdentity(
      state,
      lexemes,
      event.locale,
      event.canonical,
      revision,
    );
    return commitAtRevision(state, revision, {
      lexemes,
      // Human ownership replaces automatic recurrence evidence; retaining it
      // would give one identity two independent sources of canonical authority.
      termEvidence: state.termEvidence.filter((entry) =>
        lexemeKey(entry) !== lexemeKey(lexeme)),
      authorities: protectedIdentity.authorities,
      aliasTombstones: protectedIdentity.aliasTombstones,
      automaticLearningSaturated: protectedIdentity.automaticLearningSaturated,
    });
  }
  if (state.lexemes.some((entry) =>
    entry.id !== lexeme.id && entry.locale === event.locale &&
    entry.canonical === event.canonical)) {
    return failure("INVALID_EVENT", "The replacement Wiki lexeme already exists.");
  }
  const revision = state.revision + 1;
  const lexemes = state.lexemes.map((entry) => entry.id === lexeme.id
    ? Object.freeze({
        ...entry,
        locale: event.locale,
        canonical: event.canonical,
        scope: event.scope,
        provenance: "human-confirmed" as const,
        confirmedAtRevision: revision,
      })
    : entry);
  // A canonical never needs to alias to itself after a rename.
  const aliasEvidence = state.aliasEvidence.filter((entry) =>
    entry.lexemeId !== lexeme.id || entry.form !== event.canonical);
  const authorities = state.authorities.filter((entry) =>
    entry.lexemeId !== lexeme.id || entry.form !== event.canonical);
  const aliasTombstones = state.aliasTombstones.filter((entry) =>
    entry.lexemeId !== lexeme.id || entry.form !== event.canonical);
  const protectedIdentity = protectCanonicalIdentity(
    Object.freeze({ ...state, authorities, aliasTombstones }),
    lexemes,
    event.locale,
    event.canonical,
    revision,
  );
  const removedIdentity = upsertLexemeTombstone(
    [...state.lexemeTombstones],
    lexeme,
    revision,
  );
  const lexemeTombstones = removeLexemeTombstone(
    removedIdentity.tombstones,
    { locale: event.locale, canonical: event.canonical },
  );
  const renamedKeys = new Set([
    lexemeKey(lexeme),
    lexemeKey({ locale: event.locale, canonical: event.canonical }),
  ]);
  return commitAtRevision(state, revision, {
    lexemes,
    termEvidence: state.termEvidence.filter((entry) =>
      !renamedKeys.has(lexemeKey(entry))),
    aliasEvidence,
    authorities: protectedIdentity.authorities,
    aliasTombstones: protectedIdentity.aliasTombstones,
    lexemeTombstones,
    automaticLearningSaturated: state.automaticLearningSaturated ||
      protectedIdentity.automaticLearningSaturated || removedIdentity.saturated,
  });
}

/** A person's canonical spelling outranks every alias with the same visible form. */
function protectCanonicalIdentity(
  state: Pick<WikiState,
    "aliasEvidence" | "authorities" | "aliasTombstones" | "automaticLearningSaturated">,
  lexemes: readonly WikiLexeme[],
  locale: WikiRuleDescriptor["locale"],
  canonical: string,
  revision: number,
): Readonly<{
  authorities: readonly WikiState["authorities"][number][];
  aliasTombstones: readonly WikiTombstone[];
  automaticLearningSaturated: boolean;
}> {
  const lexemesById = new Map(lexemes.map((entry) => [entry.id, entry]));
  const conflicts = [...state.authorities, ...state.aliasEvidence].filter((entry) => {
    const target = lexemesById.get(entry.lexemeId);
    return target !== undefined && target.locale === locale && entry.form === canonical &&
      target.canonical !== canonical;
  });
  if (conflicts.length === 0) {
    return Object.freeze({
      authorities: state.authorities,
      aliasTombstones: state.aliasTombstones,
      automaticLearningSaturated: state.automaticLearningSaturated,
    });
  }
  const conflictKeys = new Set(conflicts.map(storedDecisionKey));
  const authorities = state.authorities.filter((entry) =>
    !conflictKeys.has(storedDecisionKey(entry)));
  const aliasTombstones = [...state.aliasTombstones];
  let automaticLearningSaturated = state.automaticLearningSaturated;
  for (const conflict of conflicts) {
    automaticLearningSaturated ||= upsertAliasTombstone(
      aliasTombstones,
      conflict,
      revision,
    );
  }
  return Object.freeze({
    authorities: Object.freeze(authorities),
    aliasTombstones: Object.freeze(aliasTombstones),
    automaticLearningSaturated,
  });
}

function removeLexeme(
  state: WikiState,
  event: Extract<WikiEvent, { type: "remove-lexeme" }>,
): WikiTransitionResult {
  const lexeme = state.lexemes.find((entry) => entry.id === event.lexemeId);
  if (lexeme === undefined) return success(state, false);
  const revision = state.revision + 1;
  const removedIdentity = upsertLexemeTombstone(
    [...state.lexemeTombstones],
    lexeme,
    revision,
  );
  return commitAtRevision(state, revision, {
    lexemes: state.lexemes.filter((entry) => entry.id !== lexeme.id),
    termEvidence: state.termEvidence.filter((entry) =>
      lexemeKey(entry) !== lexemeKey(lexeme)),
    aliasEvidence: state.aliasEvidence.filter((entry) => entry.lexemeId !== lexeme.id),
    authorities: state.authorities.filter((entry) => entry.lexemeId !== lexeme.id),
    aliasTombstones: state.aliasTombstones.filter((entry) => entry.lexemeId !== lexeme.id),
    lexemeTombstones: removedIdentity.tombstones,
    automaticLearningSaturated: state.automaticLearningSaturated ||
      removedIdentity.saturated,
  });
}

function ensureLexeme(
  state: WikiState,
  identity: Pick<WikiRuleDescriptor, "locale" | "canonical"> &
    Partial<Pick<WikiRuleDescriptor, "channel">> &
    Readonly<{ scope?: WikiLexemeScope }>,
  provenance: WikiLexeme["provenance"],
  revision: number,
): EnsureLexemeResult {
  const requestedScope = identity.scope ?? identity.channel ?? "both";
  const termEvidence = provenance === "human-confirmed"
    ? state.termEvidence.filter((entry) => lexemeKey(entry) !== lexemeKey(identity))
    : state.termEvidence;
  const existing = findLexeme(state, identity);
  if (existing !== undefined) {
    if (
      provenance === "human-confirmed" &&
      existing.provenance !== "human-confirmed" &&
      !hasHumanLexemeCapacity(state)
    ) {
      return { ok: false, result: humanLexemeBoundExceeded() };
    }
    const scope = existing.provenance === "human-confirmed" && provenance !== "human-confirmed"
      ? existing.scope
      : identity.scope !== undefined
        ? requestedScope
        : mergeScopes(existing.scope, requestedScope);
    if (
      provenance !== "human-confirmed" &&
      existing.provenance === "human-confirmed" &&
      scope === existing.scope
    ) {
      return { ok: true, lexeme: existing, lexemes: state.lexemes,
        termEvidence, nextLexemeId: state.nextLexemeId, changed: false };
    }
    const promoted = Object.freeze({
      ...existing,
      scope,
      provenance: provenance === "human-confirmed"
        ? "human-confirmed" as const
        : existing.provenance,
      confirmedAtRevision: provenance === "human-confirmed"
        ? revision
        : existing.confirmedAtRevision,
    });
    if (promoted.scope === existing.scope && promoted.provenance === existing.provenance) {
      return { ok: true, lexeme: existing, lexemes: state.lexemes,
        termEvidence, nextLexemeId: state.nextLexemeId, changed: false };
    }
    return {
      ok: true,
      lexeme: promoted,
      lexemes: Object.freeze(state.lexemes.map((entry) =>
        entry.id === existing.id ? promoted : entry)),
      termEvidence,
      nextLexemeId: state.nextLexemeId,
      changed: true,
    };
  }
  if (provenance === "human-confirmed" && !hasHumanLexemeCapacity(state)) {
    return { ok: false, result: humanLexemeBoundExceeded() };
  }
  if (state.lexemes.length >= MAX_WIKI_LEXEMES || state.nextLexemeId === Number.MAX_SAFE_INTEGER) {
    return { ok: false, result: failure("BOUND_EXCEEDED", "The Wiki lexeme bound is exceeded.") };
  }
  const lexeme: WikiLexeme = Object.freeze({
    id: state.nextLexemeId,
    locale: identity.locale,
    canonical: identity.canonical,
    scope: requestedScope,
    provenance,
    confirmedAtRevision: provenance === "human-confirmed" ? revision : null,
  });
  return {
    ok: true,
    lexeme,
    lexemes: Object.freeze([...state.lexemes, lexeme]),
    termEvidence,
    nextLexemeId: state.nextLexemeId + 1,
    changed: true,
  };
}

function hasHumanLexemeCapacity(state: WikiState): boolean {
  let confirmed = 0;
  for (const lexeme of state.lexemes) {
    if (lexeme.provenance !== "human-confirmed") continue;
    confirmed += 1;
    if (confirmed >= MAX_WIKI_HUMAN_CONFIRMED_LEXEMES) return false;
  }
  return true;
}

function humanLexemeBoundExceeded(): WikiTransitionResult {
  return failure("BOUND_EXCEEDED", "The human-confirmed Wiki lexeme bound is exceeded.");
}

function findLexeme(
  state: WikiState,
  identity: Pick<WikiRuleDescriptor, "locale" | "canonical">,
): WikiLexeme | undefined {
  return state.lexemes.find((entry) =>
    entry.locale === identity.locale && entry.canonical === identity.canonical);
}

function hasCanonicalCollision(
  lexemes: readonly WikiLexeme[],
  locale: WikiRuleDescriptor["locale"],
  form: string,
  targetLexemeId: number,
): boolean {
  return lexemes.some((entry) =>
    entry.id !== targetLexemeId && entry.locale === locale && entry.canonical === form);
}

function hasLexemeTombstone(
  state: WikiState,
  identity: Pick<WikiRuleDescriptor, "locale" | "canonical">,
): boolean {
  const key = lexemeKey(identity);
  return state.lexemeTombstones.some((entry) => lexemeKey(entry) === key);
}

function aliasDescriptor(
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

function storedAliasEvidenceKey(
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

function resolveRule(
  alias: WikiAliasDescriptor,
  lexeme: WikiLexeme,
  authority: WikiMatchRule["authority"],
  provenance: WikiMatchRule["provenance"],
  score: number,
): WikiMatchRule {
  return Object.freeze({
    locale: lexeme.locale,
    channel: alias.channel,
    boundary: alias.boundary,
    form: alias.form,
    canonical: lexeme.canonical,
    authority,
    provenance,
    score,
  });
}

function upsertAliasTombstone(
  tombstones: WikiTombstone[],
  descriptor: WikiAliasDescriptor,
  rejectedAtRevision: number,
): boolean {
  const key = storedDecisionKey(descriptor);
  const index = tombstones.findIndex((entry) => storedDecisionKey(entry) === key);
  const next = Object.freeze({ ...descriptor, rejectedAtRevision });
  if (index !== -1) {
    tombstones[index] = next;
    return false;
  }
  if (tombstones.length >= MAX_WIKI_TOMBSTONES) return true;
  tombstones.push(next);
  return false;
}

function upsertLexemeTombstone(
  tombstones: WikiLexemeTombstone[],
  identity: Pick<WikiLexeme, "locale" | "canonical">,
  rejectedAtRevision: number,
): Readonly<{
  tombstones: WikiLexemeTombstone[];
  saturated: boolean;
}> {
  const key = lexemeKey(identity);
  const index = tombstones.findIndex((entry) => lexemeKey(entry) === key);
  const next = Object.freeze({
    locale: identity.locale,
    canonical: identity.canonical,
    rejectedAtRevision,
  });
  if (index !== -1) {
    tombstones[index] = next;
    return Object.freeze({ tombstones, saturated: false });
  }
  if (tombstones.length >= MAX_WIKI_LEXEME_TOMBSTONES) {
    return Object.freeze({ tombstones, saturated: true });
  }
  tombstones.push(next);
  return Object.freeze({ tombstones, saturated: false });
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function removeLexemeTombstone(
  tombstones: readonly WikiLexemeTombstone[],
  identity: Pick<WikiRuleDescriptor, "locale" | "canonical">,
): readonly WikiLexemeTombstone[] {
  const key = lexemeKey(identity);
  if (!tombstones.some((entry) => lexemeKey(entry) === key)) return tombstones;
  return Object.freeze(tombstones.filter((entry) => lexemeKey(entry) !== key));
}

function commit(
  state: WikiState,
  replacement: Partial<WikiState>,
  revision = state.revision + 1,
): WikiTransitionResult {
  return commitAtRevision(state, revision, replacement);
}

function commitAtRevision(
  state: WikiState,
  revision: number,
  replacement: Partial<WikiState>,
): WikiTransitionResult {
  const merged = { ...state, ...replacement, revision };
  const next = freezeWikiState({ ...merged, revertStrikes: retainRevertStrikes(merged) });
  const validation = validateWikiState(next);
  if (!validation.ok) return failure("INVALID_STATE", validation.message);
  return success(next, true);
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

function scopeIncludes(scope: WikiLexemeScope, channel: WikiRuleDescriptor["channel"]): boolean {
  return scope === "both" || scope === channel;
}

function mergeScopes(left: WikiLexemeScope, right: WikiLexemeScope): WikiLexemeScope {
  return left === right ? left : "both";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isWikiEvent(event: WikiEvent): boolean {
  if (event.type === "replace-rule") {
    return isWikiDescriptor(event.before) && isWikiDescriptor(event.after);
  }
  if (event.type === "create-lexeme") {
    return isMatterLocale(event.locale) && isWikiCanonical(event.canonical) &&
      isWikiLexemeScope(event.scope);
  }
  if (event.type === "rename-lexeme") {
    return Number.isSafeInteger(event.lexemeId) && event.lexemeId >= 1 &&
      isMatterLocale(event.locale) && isWikiCanonical(event.canonical) &&
      isWikiLexemeScope(event.scope);
  }
  if (event.type === "remove-lexeme") {
    return Number.isSafeInteger(event.lexemeId) && event.lexemeId >= 1;
  }
  if (event.type === "observe-evidence" && event.source === "recent-material") {
    return isMatterLocale(event.locale) && isWikiCanonical(event.canonical) &&
      isWikiTermEvidenceProducer(event.producer);
  }
  if (!isWikiDescriptor(event)) return false;
  if (event.type === "confirm-rule" || event.type === "reject-rule") return true;
  return event.type === "observe-evidence" && event.source === "machine-inference" &&
    Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, event.producer);
}

function compareObservation(
  left: WikiObserveEvidenceEvent,
  right: WikiObserveEvidenceEvent,
): number {
  return compareText(JSON.stringify([
    left.locale,
    left.source === "machine-inference" ? left.channel : "",
    left.source === "machine-inference" ? left.boundary : "",
    left.source === "machine-inference" ? left.form : "",
    left.canonical, left.source,
    left.source === "machine-inference" ? left.producer : "",
  ]), JSON.stringify([
    right.locale,
    right.source === "machine-inference" ? right.channel : "",
    right.source === "machine-inference" ? right.boundary : "",
    right.source === "machine-inference" ? right.form : "",
    right.canonical, right.source,
    right.source === "machine-inference" ? right.producer : "",
  ]));
}

function success(state: WikiState, changed: boolean): WikiTransitionResult {
  return Object.freeze({ ok: true, state, changed });
}

function failure(
  code: "INVALID_STATE" | "INVALID_EVENT" | "BOUND_EXCEEDED",
  message: string,
): WikiTransitionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

type EnsureLexemeResult =
  | Readonly<{
      ok: true;
      lexeme: WikiLexeme;
      lexemes: readonly WikiLexeme[];
      termEvidence: readonly WikiState["termEvidence"][number][];
      nextLexemeId: number;
      changed: boolean;
    }>
  | Readonly<{ ok: false; result: WikiTransitionResult }>;
