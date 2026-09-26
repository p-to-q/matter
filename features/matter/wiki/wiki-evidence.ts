import { isMatterLocale } from "../config/locales";
import {
  compareDescriptor,
  decisionKey,
  freezeWikiState,
  isWikiCanonical,
  isWikiDescriptor,
  isWikiLexemeScope,
  lexemeKey,
  storedAliasKey,
  storedDecisionKey,
  validateWikiState,
} from "./wiki-invariants";
import {
  MAX_WIKI_AUTHORITY_RULES,
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_APPLICABLE_RULES,
  MAX_WIKI_EVIDENCE_RECORDS,
  MAX_WIKI_LEXEMES,
  MAX_WIKI_LEXEME_TOMBSTONES,
  MAX_WIKI_OBSERVATIONS_PER_BATCH,
  MAX_WIKI_TOMBSTONES,
  WIKI_FITTING_VERSION,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiAliasDescriptor,
  type WikiAliasEvidenceAggregate,
  type WikiEvent,
  type WikiLexeme,
  type WikiLexemeScope,
  type WikiLexemeTombstone,
  type WikiMatchRule,
  type WikiObserveEvidenceEvent,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTombstone,
  type WikiTransitionResult,
} from "./wiki-model";
import {
  advanceWikiAliasQuietTurn,
  advanceWikiTermQuietTurn,
  observeWikiAliasCandidate,
  observeWikiTermEvidence,
  reconcileWikiTermEvidence,
  resolveWikiAliasCompetition,
  scoreWikiAliasCandidate,
} from "./wiki-learning-policy";

/**
 * Confirmed authority retains its existing maximal score receipt. Provisional
 * scoring is owned by wiki-learning-policy and remains release-gated.
 */
export const WIKI_SCORE_POLICY = Object.freeze({
  version: WIKI_SCORING_VERSION,
  confirmedRuleScore: 2_147_483_647,
});

export const WIKI_STARTER_LEXEMES = Object.freeze([
  Object.freeze({ locale: "en-US" as const, canonical: "Engelbart", scope: "both" as const }),
  Object.freeze({ locale: "en-US" as const, canonical: "Morphogenesis", scope: "both" as const }),
  Object.freeze({ locale: "en-US" as const, canonical: "KFC", scope: "both" as const }),
  Object.freeze({ locale: "zh-CN" as const, canonical: "[p → q]", scope: "both" as const }),
]);

const P_TO_Q_CANONICAL = "[p → q]";
const P_TO_Q_FORMS = Object.freeze(["P to Q", "p to q"] as const);

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
    state.aliasTombstones.some((entry) => entry.lexemeId === lexeme.id)
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

/** Folds one bounded observation batch atomically before the coordinator saves it once. */
export function applyWikiObservationBatch(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
): WikiTransitionResult {
  if (events.length > MAX_WIKI_OBSERVATIONS_PER_BATCH) {
    return failure("BOUND_EXCEEDED", "The Wiki observation batch bound is exceeded.");
  }
  const unique = new Map<string, WikiObserveEvidenceEvent>();
  for (const event of events) {
    // A human-admission tick can mention one canonical through several visible
    // occurrences. Recurrence is evidence across turns, not raw frequency
    // within one material change. Alias relations remain descriptor-specific.
    const key = event.source === "recent-material"
      ? JSON.stringify([event.source, event.locale, event.canonical])
      : JSON.stringify([
          event.source,
          event.locale,
          event.channel,
          event.boundary,
          event.form,
          event.canonical,
        ]);
    unique.set(key, event);
  }
  let working = advanceUnobservedEvidence(state, [...unique.values()]);
  for (const event of [...unique.values()].sort(compareObservation)) {
    const result = applyWikiEvent(working, event);
    if (!result.ok) return result;
    working = result.state;
  }
  return success(working, working !== state);
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
  });
}

export type WikiProjectionPolicy = Readonly<{ includeProvisional: boolean }>;
export const WIKI_CONFIRMED_ONLY: WikiProjectionPolicy = Object.freeze({
  includeProvisional: false,
});
export const WIKI_WITH_PROVISIONAL: WikiProjectionPolicy = Object.freeze({
  includeProvisional: true,
});

/** The only resolved projection consumed by the material matcher. */
export function projectApplicableWikiRules(
  state: WikiState,
  policy: WikiProjectionPolicy = WIKI_WITH_PROVISIONAL,
): readonly WikiMatchRule[] {
  if (!validateWikiState(state).ok) return Object.freeze([]);
  const lexemes = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const canonicalKeys = new Set(state.lexemes
    .filter((lexeme) => lexeme.provenance === "human-confirmed")
    .map((lexeme) => lexemeKey(lexeme)));
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

  const confirmedAliases = new Set(state.authorities.map((authority) => {
    const lexeme = lexemes.get(authority.lexemeId);
    return lexeme === undefined ? "" : storedAliasKey(authority, lexeme.locale);
  }));
  const tombstones = new Set(state.aliasTombstones.map(storedDecisionKey));
  const candidatesByAlias = new Map<string, WikiAliasEvidenceAggregate[]>();

  for (const aggregate of state.aliasEvidence) {
    const lexeme = lexemes.get(aggregate.lexemeId);
    if (lexeme === undefined || !scopeIncludes(lexeme.scope, aggregate.channel)) continue;
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
  const qualifiedProducers = new Set<WikiAliasEvidenceAggregate["producer"]>();
  for (const evidence of candidatesByAlias.values()) {
    const candidates = evidence.map((aggregate) => ({
      candidateId: storedAliasEvidenceKey(aggregate),
      producer: aggregate.producer,
      phase: aggregate.phase,
      support: aggregate.support,
      quietTurns: aggregate.quietTurns,
    }));
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
      scoreWikiAliasCandidate(winner),
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

function ruleCodePoints(rule: WikiRuleDescriptor): number {
  return Array.from(rule.form).length + Array.from(rule.canonical).length;
}

function observeEvidence(
  state: WikiState,
  event: Extract<WikiEvent, { type: "observe-evidence" }>,
): WikiTransitionResult {
  if (state.automaticLearningSaturated) return success(state, false);
  if (hasLexemeTombstone(state, event)) return success(state, false);
  const working = state;
  const revision = state.revision + 1;
  if (event.source === "recent-material") {
    const existingLexeme = findLexeme(working, event);
    if (existingLexeme?.provenance === "human-confirmed") {
      return success(state, false);
    }
    const index = working.termEvidence.findIndex((entry) =>
      lexemeKey(entry) === lexemeKey(event));
    if (index === -1 && working.termEvidence.length >= MAX_WIKI_EVIDENCE_RECORDS) {
      return failure("BOUND_EXCEEDED", "The Wiki term evidence bound is exceeded.");
    }
    const previous = index === -1
      ? Object.freeze({
          phase: "candidate" as const,
          support: 0,
          quietTurns: 0,
        })
      : working.termEvidence[index];
    const observed = reconcileWikiTermEvidence(observeWikiTermEvidence(previous));
    const termEvidence = [...working.termEvidence];
    const aggregate = Object.freeze({
      locale: event.locale,
      canonical: event.canonical,
      ...observed,
    });
    if (index === -1) termEvidence.push(aggregate);
    else termEvidence[index] = aggregate;
    if (aggregate.phase === "candidate") {
      return commitAtRevision(working, revision, { termEvidence });
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
  const producer = "legacy-v1" as const;
  const key = storedAliasEvidenceKey({ ...descriptor, producer });
  const index = working.aliasEvidence.findIndex((entry) =>
    storedAliasEvidenceKey(entry) === key);
  if (index === -1 && working.aliasEvidence.length >= MAX_WIKI_EVIDENCE_RECORDS) {
    return failure("BOUND_EXCEEDED", "The Wiki alias evidence bound is exceeded.");
  }
  const previous = index === -1
    ? Object.freeze({
        ...descriptor,
        producer,
        phase: "candidate" as const,
        support: 0,
        quietTurns: 0,
      })
    : working.aliasEvidence[index];
  const observed = observeWikiAliasCandidate({
    candidateId: key,
    producer: previous.producer,
    phase: previous.phase,
    support: previous.support,
    quietTurns: previous.quietTurns,
  });
  if (observed.support === previous.support) {
    return success(state, false);
  }
  const aliasEvidence = [...working.aliasEvidence];
  const aggregate = Object.freeze({
    ...descriptor,
    producer: observed.producer,
    phase: observed.phase,
    support: observed.support,
    quietTurns: observed.quietTurns,
  });
  if (index === -1) aliasEvidence.push(aggregate);
  else aliasEvidence[index] = aggregate;
  return commitAtRevision(working, revision, {
    aliasEvidence,
  });
}

function advanceUnobservedEvidence(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
): WikiState {
  if (state.termEvidence.length === 0 && state.aliasEvidence.length === 0) return state;
  const observedTerms = new Set(events
    .filter((event) => event.source === "recent-material")
    .map((event) => lexemeKey(event)));
  const observedAliases = new Set(events
    .filter((event) => event.source === "machine-inference")
    .map((event) => JSON.stringify([
      event.locale, event.channel, event.boundary, event.form, event.canonical, "legacy-v1",
    ])));
  const agedTermEvidence = state.termEvidence.map((entry) => {
    if (observedTerms.has(lexemeKey(entry))) return entry;
    const aged = advanceWikiTermQuietTurn(entry);
    return Object.freeze({
      locale: entry.locale,
      canonical: entry.canonical,
      ...reconcileWikiTermEvidence(aged),
    });
  });
  const lexemesById = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const aliasEvidence = state.aliasEvidence.map((entry) => {
    const lexeme = lexemesById.get(entry.lexemeId);
    const observedKey = lexeme === undefined ? "" : JSON.stringify([
      lexeme.locale, entry.channel, entry.boundary, entry.form, lexeme.canonical, entry.producer,
    ]);
    if (observedAliases.has(observedKey)) return entry;
    const aged = advanceWikiAliasQuietTurn({
      candidateId: storedAliasEvidenceKey(entry),
      producer: entry.producer,
      phase: entry.phase,
      support: entry.support,
      quietTurns: entry.quietTurns,
    });
    return Object.freeze({
      ...entry,
      phase: aged.phase,
      support: aged.support,
      quietTurns: aged.quietTurns,
    });
  }).filter((entry) => entry.support > 0);
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
  const retainedTermKeys = new Set(termEvidence.map(lexemeKey));
  const expiredTermKeys = new Set(agedTermEvidence
    .filter((entry) => !retainedTermKeys.has(lexemeKey(entry)))
    .map(lexemeKey));
  const lexemes = state.lexemes.filter((lexeme) => {
    if (lexeme.provenance !== "aggregate-evidence" ||
        !expiredTermKeys.has(lexemeKey(lexeme))) return true;
    return aliasEvidence.some((entry) => entry.lexemeId === lexeme.id) ||
      state.authorities.some((entry) => entry.lexemeId === lexeme.id) ||
      state.aliasTombstones.some((entry) => entry.lexemeId === lexeme.id);
  });
  const changed = termEvidence.length !== state.termEvidence.length ||
    aliasEvidence.length !== state.aliasEvidence.length ||
    lexemes.length !== state.lexemes.length ||
    termEvidence.some((entry, index) => entry !== state.termEvidence[index]) ||
    aliasEvidence.some((entry, index) => entry !== state.aliasEvidence[index]);
  if (!changed) return state;
  const next = freezeWikiState({
    ...state,
    revision: state.revision + 1,
    lexemes,
    termEvidence,
    aliasEvidence,
  });
  return validateWikiState(next).ok ? next : state;
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
  const next = freezeWikiState({ ...state, ...replacement, revision });
  const validation = validateWikiState(next);
  if (!validation.ok) return failure("INVALID_STATE", validation.message);
  return success(next, true);
}

function scopeIncludes(scope: WikiLexemeScope, channel: WikiRuleDescriptor["channel"]): boolean {
  return scope === "both" || scope === channel;
}

function mergeScopes(left: WikiLexemeScope, right: WikiLexemeScope): WikiLexemeScope {
  return left === right ? left : "both";
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
  if (!isWikiDescriptor(event)) return false;
  if (event.type === "confirm-rule" || event.type === "reject-rule") return true;
  return event.type === "observe-evidence" &&
    (event.source === "recent-material" || event.source === "machine-inference");
}

function compareObservation(
  left: WikiObserveEvidenceEvent,
  right: WikiObserveEvidenceEvent,
): number {
  return compareText(JSON.stringify([
    left.locale, left.channel, left.boundary, left.form, left.canonical, left.source,
  ]), JSON.stringify([
    right.locale, right.channel, right.boundary, right.form, right.canonical, right.source,
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
