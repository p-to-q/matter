import { isMatterLocale } from "../config/locales";
import {
  freezeWikiState,
  isWikiAliasDescriptor,
  isWikiBoundary,
  isWikiCanonical,
  isWikiChannel,
  isWikiDescriptor,
  isWikiForm,
  isWikiLexemeScope,
  lexemeKey,
  validateWikiState,
} from "./wiki-invariants";
import {
  MAX_WIKI_AUTHORITY_RULES,
  MAX_WIKI_EVIDENCE_COUNT,
  MAX_WIKI_EVIDENCE_RECORDS,
  MAX_WIKI_LEXEMES,
  MAX_WIKI_LEXEME_TOMBSTONES,
  MAX_WIKI_TOMBSTONES,
  WIKI_FITTING_VERSION,
  WIKI_RECENT_OBSERVATION_WINDOW,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiAliasDescriptor,
  type WikiAliasEvidenceAggregate,
  type WikiAuthorityRule,
  type WikiEvent,
  type WikiEvidenceSource,
  type WikiLexeme,
  type WikiLexemeTombstone,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTermEvidenceAggregate,
  type WikiTombstone,
} from "./wiki-model";
import {
  MAX_WIKI_LEARNING_QUIET_TURNS,
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  reconcileWikiTermEvidence,
} from "./wiki-learning-policy";

const LEGACY_RELATION_SCHEMA_VERSION = 2;
const LEGACY_LEXEME_SCHEMA_VERSION = 3;
const LEGACY_SCOPED_LEXEME_SCHEMA_VERSION = 4;
const LEGACY_SCORING_VERSION = 2;

export type WikiStateParse =
  | Readonly<{ ok: true; state: WikiState }>
  | Readonly<{ ok: false; message: string }>;

export type WikiEventParse =
  | Readonly<{ ok: true; event: WikiEvent }>
  | Readonly<{ ok: false; message: string }>;

/** Measures the exact compact JSON form used by local persistence. */
export function wikiStateStorageBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Strictly parses V5 or deterministically migrates a valid V2/V3/V4 state. */
export function parseWikiState(value: unknown): WikiStateParse {
  if (!isPlainObject(value)) return invalidState("The Wiki state is not an object.");
  if (value.schemaVersion === LEGACY_RELATION_SCHEMA_VERSION) return parseLegacyWikiState(value);
  if (value.schemaVersion === LEGACY_LEXEME_SCHEMA_VERSION) {
    return parseLegacyLexemeWikiState(value);
  }
  if (value.schemaVersion === LEGACY_SCOPED_LEXEME_SCHEMA_VERSION) {
    return parseLegacyScopedLexemeWikiState(value);
  }
  if (value.schemaVersion !== WIKI_SCHEMA_VERSION || !hasExactKeys(value, [
    "schemaVersion",
    "scoringVersion",
    "fittingVersion",
    "revision",
    "nextLexemeId",
    "automaticLearningSaturated",
    "lexemes",
    "termEvidence",
    "aliasEvidence",
    "authorities",
    "aliasTombstones",
    "lexemeTombstones",
  ])) return invalidState("The Wiki state fields are invalid.");
  if (
    value.scoringVersion !== WIKI_SCORING_VERSION ||
    value.fittingVersion !== WIKI_FITTING_VERSION ||
    !isRevision(value.revision) ||
    !isLexemeId(value.nextLexemeId) ||
    typeof value.automaticLearningSaturated !== "boolean"
  ) return invalidState("The Wiki state version or revision is invalid.");

  const lexemes = parseArray(value.lexemes, MAX_WIKI_LEXEMES, parseLexeme);
  const termEvidence = parseArray(
    value.termEvidence,
    MAX_WIKI_EVIDENCE_RECORDS,
    parseTermEvidence,
  );
  const aliasEvidence = parseArray(
    value.aliasEvidence,
    MAX_WIKI_EVIDENCE_RECORDS,
    parseAliasEvidence,
  );
  const authorities = parseArray(value.authorities, MAX_WIKI_AUTHORITY_RULES, parseAuthority);
  const aliasTombstones = parseArray(value.aliasTombstones, MAX_WIKI_TOMBSTONES,
    parseAliasTombstone);
  const lexemeTombstones = parseArray(value.lexemeTombstones,
    MAX_WIKI_LEXEME_TOMBSTONES, parseLexemeTombstone);
  if (lexemes === null || termEvidence === null || aliasEvidence === null ||
      authorities === null ||
      aliasTombstones === null || lexemeTombstones === null) {
    return invalidState("A Wiki collection is invalid.");
  }
  return validateParsedState(freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: value.revision,
    nextLexemeId: value.nextLexemeId,
    automaticLearningSaturated: value.automaticLearningSaturated,
    lexemes,
    termEvidence,
    aliasEvidence,
    authorities,
    aliasTombstones,
    lexemeTombstones,
  }));
}

/** Parses one transition; extra fields fail closed. */
export function parseWikiEvent(value: unknown): WikiEventParse {
  if (!isPlainObject(value) || typeof value.type !== "string") {
    return invalidEvent("The Wiki event is not an object.");
  }
  if (value.type === "create-lexeme") {
    if (!hasExactKeys(value, ["type", "locale", "canonical", "scope"]) ||
        typeof value.locale !== "string" || !isMatterLocale(value.locale) ||
        !isWikiCanonical(value.canonical) || !isWikiLexemeScope(value.scope)) {
      return invalidEvent("The Wiki lexeme creation event is invalid.");
    }
    return Object.freeze({ ok: true, event: Object.freeze({
      type: "create-lexeme", locale: value.locale, canonical: value.canonical,
      scope: value.scope,
    }) });
  }
  if (value.type === "rename-lexeme") {
    if (!hasExactKeys(value, ["type", "lexemeId", "locale", "canonical", "scope"]) ||
        !isLexemeId(value.lexemeId) || typeof value.locale !== "string" ||
        !isMatterLocale(value.locale) || !isWikiCanonical(value.canonical) ||
        !isWikiLexemeScope(value.scope)) {
      return invalidEvent("The Wiki lexeme rename event is invalid.");
    }
    return Object.freeze({ ok: true, event: Object.freeze({
      type: "rename-lexeme", lexemeId: value.lexemeId,
      locale: value.locale, canonical: value.canonical, scope: value.scope,
    }) });
  }
  if (value.type === "remove-lexeme") {
    if (!hasExactKeys(value, ["type", "lexemeId"]) || !isLexemeId(value.lexemeId)) {
      return invalidEvent("The Wiki lexeme removal event is invalid.");
    }
    return Object.freeze({ ok: true, event: Object.freeze({
      type: "remove-lexeme", lexemeId: value.lexemeId,
    }) });
  }
  if (value.type === "observe-evidence") {
    if (!hasExactKeys(value, [
      "type", "locale", "channel", "boundary", "form", "canonical", "source",
    ])) return invalidEvent("The Wiki evidence event fields are invalid.");
    const descriptor = parseDescriptor(value);
    if (descriptor === null || !isEvidenceSource(value.source)) {
      return invalidEvent("The Wiki evidence event is invalid.");
    }
    return Object.freeze({ ok: true, event: Object.freeze({
      type: "observe-evidence", ...descriptor, source: value.source,
    }) });
  }
  if (value.type === "replace-rule") {
    if (!hasExactKeys(value, ["type", "before", "after"]) ||
        !isPlainObject(value.before) || !isPlainObject(value.after)) {
      return invalidEvent("The Wiki replacement event fields are invalid.");
    }
    const before = parseDescriptor(value.before);
    const after = parseDescriptor(value.after);
    return before === null || after === null
      ? invalidEvent("The Wiki replacement event is invalid.")
      : Object.freeze({ ok: true, event: Object.freeze({ type: "replace-rule", before, after }) });
  }
  if (value.type === "confirm-rule" || value.type === "reject-rule") {
    if (!hasExactKeys(value, [
      "type", "locale", "channel", "boundary", "form", "canonical",
    ])) return invalidEvent("The Wiki decision event fields are invalid.");
    const descriptor = parseDescriptor(value);
    return descriptor === null
      ? invalidEvent("The Wiki decision event is invalid.")
      : Object.freeze({ ok: true, event: Object.freeze({ type: value.type, ...descriptor }) });
  }
  return invalidEvent("The Wiki event type is unsupported.");
}

function parseLegacyWikiState(value: Record<string, unknown>): WikiStateParse {
  if (!hasExactKeys(value, [
    "schemaVersion", "scoringVersion", "revision", "recentObservationCount",
    "evidence", "authorities", "tombstones",
  ]) || value.scoringVersion !== LEGACY_SCORING_VERSION ||
      !isRevision(value.revision) || !isRecentObservationCount(value.recentObservationCount)) {
    return invalidState("The legacy Wiki state is invalid.");
  }
  const evidence = parseArray(value.evidence, MAX_WIKI_EVIDENCE_RECORDS, parseLegacyEvidence);
  const authorities = parseArray(value.authorities, MAX_WIKI_AUTHORITY_RULES,
    parseLegacyAuthority);
  const tombstones = parseArray(value.tombstones, MAX_WIKI_TOMBSTONES,
    parseLegacyTombstone);
  if (evidence === null || authorities === null || tombstones === null) {
    return invalidState("A legacy Wiki collection is invalid.");
  }

  const identities = new Map<string, { locale: WikiRuleDescriptor["locale"]; canonical: string }>();
  for (const entry of [...evidence, ...authorities, ...tombstones]) {
    identities.set(lexemeKey(entry), { locale: entry.locale, canonical: entry.canonical });
  }
  const sorted = [...identities.values()].sort((left, right) =>
    compareText(left.locale, right.locale) || compareText(left.canonical, right.canonical));
  if (sorted.length > MAX_WIKI_LEXEMES) return invalidState("The migrated Wiki is too large.");
  const confirmedRevisionByKey = new Map<string, number>();
  for (const authority of authorities) {
    const key = lexemeKey(authority);
    const previous = confirmedRevisionByKey.get(key);
    if (previous === undefined || authority.confirmedAtRevision < previous) {
      confirmedRevisionByKey.set(key, authority.confirmedAtRevision);
    }
  }
  const idByKey = new Map<string, number>();
  const lexemes: WikiLexeme[] = sorted.map((identity, index) => {
    const id = index + 1;
    const key = lexemeKey(identity);
    idByKey.set(key, id);
    const confirmedAtRevision = confirmedRevisionByKey.get(key) ?? null;
    return Object.freeze({
      id,
      ...identity,
      scope: "both" as const,
      provenance: confirmedAtRevision === null ? "aggregate-evidence" as const : "human-confirmed" as const,
      confirmedAtRevision,
    });
  });
  const aliasOf = (entry: LegacyDescriptor): WikiAliasDescriptor => Object.freeze({
    lexemeId: idByKey.get(lexemeKey(entry)) ?? 0,
    channel: entry.channel,
    boundary: entry.boundary,
    form: entry.form,
  });
  return validateParsedState(freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: value.revision,
    nextLexemeId: lexemes.length + 1,
    automaticLearningSaturated: false,
    lexemes,
    ...splitLegacyEvidence(
      evidence.map((entry) => Object.freeze({ ...aliasOf(entry), counts: entry.counts })),
      lexemes,
    ),
    authorities: authorities.map((entry) => Object.freeze({
      ...aliasOf(entry), confirmedAtRevision: entry.confirmedAtRevision,
    })),
    aliasTombstones: tombstones.map((entry) => Object.freeze({
      ...aliasOf(entry), rejectedAtRevision: entry.rejectedAtRevision,
    })),
    lexemeTombstones: Object.freeze([]),
  }));
}

function parseLegacyLexemeWikiState(value: Record<string, unknown>): WikiStateParse {
  if (!hasExactKeys(value, [
    "schemaVersion",
    "scoringVersion",
    "fittingVersion",
    "revision",
    "nextLexemeId",
    "recentObservationCount",
    "automaticLearningSaturated",
    "lexemes",
    "evidence",
    "authorities",
    "aliasTombstones",
    "lexemeTombstones",
  ]) || value.scoringVersion !== LEGACY_SCORING_VERSION ||
      value.fittingVersion !== WIKI_FITTING_VERSION ||
      !isRevision(value.revision) || !isLexemeId(value.nextLexemeId) ||
      !isRecentObservationCount(value.recentObservationCount) ||
      typeof value.automaticLearningSaturated !== "boolean") {
    return invalidState("The legacy Wiki lexeme state is invalid.");
  }
  const legacyLexemes = parseArray(value.lexemes, MAX_WIKI_LEXEMES, parseLegacyLexeme);
  const evidence = parseArray(value.evidence, MAX_WIKI_EVIDENCE_RECORDS, parseLegacyAliasEvidence);
  const authorities = parseArray(value.authorities, MAX_WIKI_AUTHORITY_RULES, parseAuthority);
  const aliasTombstones = parseArray(value.aliasTombstones, MAX_WIKI_TOMBSTONES,
    parseAliasTombstone);
  const lexemeTombstones = parseArray(value.lexemeTombstones,
    MAX_WIKI_LEXEME_TOMBSTONES, parseLexemeTombstone);
  if (legacyLexemes === null || evidence === null || authorities === null ||
      aliasTombstones === null || lexemeTombstones === null) {
    return invalidState("A legacy Wiki lexeme collection is invalid.");
  }
  const lexemes = legacyLexemes.map((lexeme) => Object.freeze({
    ...lexeme,
    scope: "both" as const,
  }));
  return validateParsedState(freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: value.revision,
    nextLexemeId: value.nextLexemeId,
    automaticLearningSaturated: value.automaticLearningSaturated,
    lexemes,
    ...splitLegacyEvidence(evidence, lexemes),
    authorities,
    aliasTombstones,
    lexemeTombstones,
  }));
}

function parseLegacyScopedLexemeWikiState(
  value: Record<string, unknown>,
): WikiStateParse {
  if (!hasExactKeys(value, [
    "schemaVersion",
    "scoringVersion",
    "fittingVersion",
    "revision",
    "nextLexemeId",
    "recentObservationCount",
    "automaticLearningSaturated",
    "lexemes",
    "evidence",
    "authorities",
    "aliasTombstones",
    "lexemeTombstones",
  ]) || value.scoringVersion !== LEGACY_SCORING_VERSION ||
      value.fittingVersion !== WIKI_FITTING_VERSION ||
      !isRevision(value.revision) || !isLexemeId(value.nextLexemeId) ||
      !isRecentObservationCount(value.recentObservationCount) ||
      typeof value.automaticLearningSaturated !== "boolean") {
    return invalidState("The legacy Wiki scoped-lexeme state is invalid.");
  }
  const lexemes = parseArray(value.lexemes, MAX_WIKI_LEXEMES, parseLexeme);
  const evidence = parseArray(
    value.evidence,
    MAX_WIKI_EVIDENCE_RECORDS,
    parseLegacyAliasEvidence,
  );
  const authorities = parseArray(value.authorities, MAX_WIKI_AUTHORITY_RULES, parseAuthority);
  const aliasTombstones = parseArray(
    value.aliasTombstones,
    MAX_WIKI_TOMBSTONES,
    parseAliasTombstone,
  );
  const lexemeTombstones = parseArray(
    value.lexemeTombstones,
    MAX_WIKI_LEXEME_TOMBSTONES,
    parseLexemeTombstone,
  );
  if (lexemes === null || evidence === null || authorities === null ||
      aliasTombstones === null || lexemeTombstones === null) {
    return invalidState("A legacy Wiki scoped-lexeme collection is invalid.");
  }
  return validateParsedState(freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: value.revision,
    nextLexemeId: value.nextLexemeId,
    automaticLearningSaturated: value.automaticLearningSaturated,
    lexemes,
    ...splitLegacyEvidence(evidence, lexemes),
    authorities,
    aliasTombstones,
    lexemeTombstones,
  }));
}

type LegacyLexeme = Omit<WikiLexeme, "scope">;

function parseLegacyLexeme(value: unknown): LegacyLexeme | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "id", "locale", "canonical", "provenance", "confirmedAtRevision",
  ]) || !isLexemeId(value.id) || typeof value.locale !== "string" ||
      !isMatterLocale(value.locale) || !isWikiCanonical(value.canonical)) return null;
  if (value.provenance === "human-confirmed") {
    if (!isRevision(value.confirmedAtRevision)) return null;
  } else if (value.provenance !== "aggregate-evidence" || value.confirmedAtRevision !== null) {
    return null;
  }
  return Object.freeze({
    id: value.id,
    locale: value.locale,
    canonical: value.canonical,
    provenance: value.provenance,
    confirmedAtRevision: value.confirmedAtRevision,
  }) as LegacyLexeme;
}

function parseLexeme(value: unknown): WikiLexeme | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "id", "locale", "canonical", "scope", "provenance", "confirmedAtRevision",
  ]) || !isLexemeId(value.id) || typeof value.locale !== "string" ||
      !isMatterLocale(value.locale) || !isWikiCanonical(value.canonical) ||
      !isWikiLexemeScope(value.scope)) return null;
  if (value.provenance === "human-confirmed") {
    if (!isRevision(value.confirmedAtRevision)) return null;
  } else if (value.provenance !== "aggregate-evidence" || value.confirmedAtRevision !== null) {
    return null;
  }
  return Object.freeze({
    id: value.id,
    locale: value.locale,
    canonical: value.canonical,
    scope: value.scope,
    provenance: value.provenance,
    confirmedAtRevision: value.confirmedAtRevision,
  }) as WikiLexeme;
}

function parseTermEvidence(value: unknown): WikiTermEvidenceAggregate | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "locale", "canonical", "phase", "support", "quietTurns",
  ]) || typeof value.locale !== "string" || !isMatterLocale(value.locale) ||
      !isWikiCanonical(value.canonical) ||
      (value.phase !== "candidate" && value.phase !== "collected") ||
      !isEvidenceCount(value.support) ||
      !isQuietTurns(value.quietTurns) ||
      (value.phase === "candidate" && value.support >= 2)) return null;
  return Object.freeze({
    locale: value.locale,
    canonical: value.canonical,
    phase: value.phase,
    support: value.support,
    quietTurns: value.quietTurns,
  });
}

function parseAliasEvidence(value: unknown): WikiAliasEvidenceAggregate | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "lexemeId", "channel", "boundary", "form", "producer", "phase", "support",
    "quietTurns",
  ])) return null;
  const descriptor = parseAliasDescriptor(value);
  if (descriptor === null || !isAliasProducer(value.producer) ||
      (value.phase !== "candidate" && value.phase !== "active") ||
      !isEvidenceCount(value.support) ||
      value.support === 0 ||
      (value.phase === "active" && value.support === 0) ||
      !isQuietTurns(value.quietTurns)) return null;
  return Object.freeze({
    ...descriptor,
    producer: value.producer,
    phase: value.phase,
    support: value.support,
    quietTurns: value.quietTurns,
  });
}

function parseLegacyAliasEvidence(value: unknown): LegacyAliasEvidence | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "lexemeId", "channel", "boundary", "form", "counts",
  ])) return null;
  const descriptor = parseAliasDescriptor(value);
  const counts = parseEvidenceCounts(value.counts);
  return descriptor === null || counts === null ? null : Object.freeze({ ...descriptor, counts });
}

function parseAuthority(value: unknown): WikiAuthorityRule | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "lexemeId", "channel", "boundary", "form", "confirmedAtRevision",
  ])) return null;
  const descriptor = parseAliasDescriptor(value);
  return descriptor === null || !isRevision(value.confirmedAtRevision)
    ? null
    : Object.freeze({ ...descriptor, confirmedAtRevision: value.confirmedAtRevision });
}

function parseAliasTombstone(value: unknown): WikiTombstone | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "lexemeId", "channel", "boundary", "form", "rejectedAtRevision",
  ])) return null;
  const descriptor = parseAliasDescriptor(value);
  return descriptor === null || !isRevision(value.rejectedAtRevision)
    ? null
    : Object.freeze({ ...descriptor, rejectedAtRevision: value.rejectedAtRevision });
}

function parseLexemeTombstone(value: unknown): WikiLexemeTombstone | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "locale", "canonical", "rejectedAtRevision",
  ]) || typeof value.locale !== "string" || !isMatterLocale(value.locale) ||
      !isWikiCanonical(value.canonical) || !isRevision(value.rejectedAtRevision)) return null;
  return Object.freeze({
    locale: value.locale,
    canonical: value.canonical,
    rejectedAtRevision: value.rejectedAtRevision,
  });
}

function parseAliasDescriptor(value: Record<string, unknown>): WikiAliasDescriptor | null {
  if (!isLexemeId(value.lexemeId) || !isWikiChannel(value.channel) ||
      !isWikiBoundary(value.boundary) || !isWikiForm(value.form)) return null;
  const descriptor = Object.freeze({
    lexemeId: value.lexemeId,
    channel: value.channel,
    boundary: value.boundary,
    form: value.form,
  });
  return isWikiAliasDescriptor(descriptor) ? descriptor : null;
}

function parseLegacyEvidence(value: unknown): LegacyEvidence | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "channel", "locale", "boundary", "form", "canonical", "counts",
  ])) return null;
  const descriptor = parseDescriptor(value);
  const counts = parseEvidenceCounts(value.counts);
  return descriptor === null || counts === null ? null : Object.freeze({ ...descriptor, counts });
}

function parseLegacyAuthority(value: unknown): LegacyAuthority | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "channel", "locale", "boundary", "form", "canonical", "confirmedAtRevision",
  ])) return null;
  const descriptor = parseDescriptor(value);
  return descriptor === null || !isRevision(value.confirmedAtRevision)
    ? null : Object.freeze({ ...descriptor, confirmedAtRevision: value.confirmedAtRevision });
}

function parseLegacyTombstone(value: unknown): LegacyTombstone | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "channel", "locale", "boundary", "form", "canonical", "rejectedAtRevision",
  ])) return null;
  const descriptor = parseDescriptor(value);
  return descriptor === null || !isRevision(value.rejectedAtRevision)
    ? null : Object.freeze({ ...descriptor, rejectedAtRevision: value.rejectedAtRevision });
}

function parseDescriptor(value: Record<string, unknown>): WikiRuleDescriptor | null {
  if (typeof value.locale !== "string" || !isMatterLocale(value.locale) ||
      !isWikiChannel(value.channel) || !isWikiBoundary(value.boundary) ||
      !isWikiForm(value.form) || !isWikiCanonical(value.canonical)) return null;
  const descriptor = Object.freeze({
    locale: value.locale,
    channel: value.channel,
    boundary: value.boundary,
    form: value.form,
    canonical: value.canonical,
  });
  return isWikiDescriptor(descriptor) ? descriptor : null;
}

function parseEvidenceCounts(value: unknown): WikiEvidenceCounts | null {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "historicalMaterial", "recentMaterial", "machineInference",
  ]) || !isEvidenceCount(value.historicalMaterial) ||
      !isEvidenceCount(value.recentMaterial) || !isEvidenceCount(value.machineInference) ||
      value.historicalMaterial + value.recentMaterial + value.machineInference === 0) return null;
  return Object.freeze({
    historicalMaterial: value.historicalMaterial,
    recentMaterial: value.recentMaterial,
    machineInference: value.machineInference,
  });
}

/** V4 mixed three unrelated signals in one row. Migration keeps recurrence in
 * the term ledger and preserves machine votes only as zero-weight legacy alias
 * evidence, so loading old state can never grant new rewrite authority. */
function splitLegacyEvidence(
  evidence: readonly LegacyAliasEvidence[],
  lexemes: readonly WikiLexeme[],
): Readonly<{
  termEvidence: readonly WikiTermEvidenceAggregate[];
  aliasEvidence: readonly WikiAliasEvidenceAggregate[];
}> {
  const termSupport = new Map<number, number>();
  const aliasEvidence: WikiAliasEvidenceAggregate[] = [];
  for (const entry of evidence) {
    const humanSupport = Math.min(
      MAX_WIKI_EVIDENCE_COUNT,
      entry.counts.historicalMaterial + entry.counts.recentMaterial,
    );
    if (humanSupport > 0) {
      // V4 cannot prove whether two alias rows were observed in independent
      // admissions. Taking the maximum preserves its strongest bounded fact
      // without manufacturing the second vote that makes a term visible.
      termSupport.set(entry.lexemeId, Math.max(
        termSupport.get(entry.lexemeId) ?? 0,
        humanSupport,
      ));
    }
    if (entry.counts.machineInference > 0) {
      // Machine-only V2-V4 rows still need a term-ledger cleanup owner. The
      // zero-support row cannot collect a term, but lets the V5 decay path
      // remove the aggregate lexeme atomically after its last alias expires.
      termSupport.set(entry.lexemeId, termSupport.get(entry.lexemeId) ?? 0);
      aliasEvidence.push(Object.freeze({
        lexemeId: entry.lexemeId,
        channel: entry.channel,
        boundary: entry.boundary,
        form: entry.form,
        producer: "legacy-v1" as const,
        phase: "candidate" as const,
        support: entry.counts.machineInference,
        quietTurns: 0,
      }));
    }
  }
  const identityById = new Map(lexemes
    .filter((lexeme) => lexeme.provenance === "aggregate-evidence")
    .map((lexeme) => [lexeme.id, {
      locale: lexeme.locale,
      canonical: lexeme.canonical,
    }]));
  const termEvidence = [...termSupport.entries()].flatMap(([lexemeId, support]) => {
    const reconciled = reconcileWikiTermEvidence({
      phase: "candidate",
      support,
      quietTurns: 0,
    });
    const identity = identityById.get(lexemeId);
    return identity === undefined ? [] : [Object.freeze({
      ...identity,
      ...reconciled,
    })];
  });
  return Object.freeze({
    termEvidence: Object.freeze(termEvidence),
    aliasEvidence: Object.freeze(aliasEvidence),
  });
}

function validateParsedState(state: WikiState): WikiStateParse {
  const validation = validateWikiState(state);
  return validation.ok ? Object.freeze({ ok: true, state }) : invalidState(validation.message);
}

function parseArray<Value>(
  value: unknown,
  maximum: number,
  parse: (entry: unknown) => Value | null,
): readonly Value[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const result: Value[] = [];
  for (const entry of value) {
    const parsed = parse(entry);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return Object.freeze(result);
}

function isEvidenceSource(value: unknown): value is WikiEvidenceSource {
  return value === "recent-material" || value === "machine-inference";
}

function isEvidenceCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_WIKI_EVIDENCE_COUNT;
}

function isQuietTurns(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) <= MAX_WIKI_LEARNING_QUIET_TURNS;
}

function isAliasProducer(value: unknown): value is WikiAliasEvidenceAggregate["producer"] {
  return typeof value === "string" && Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, value);
}

function isRecentObservationCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) <= WIKI_RECENT_OBSERVATION_WINDOW;
}

function isLexemeId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidState(message: string): WikiStateParse {
  return Object.freeze({ ok: false, message });
}

function invalidEvent(message: string): WikiEventParse {
  return Object.freeze({ ok: false, message });
}

type LegacyDescriptor = WikiRuleDescriptor;
type WikiEvidenceCounts = Readonly<{
  historicalMaterial: number;
  recentMaterial: number;
  machineInference: number;
}>;
type LegacyEvidence = WikiRuleDescriptor & Readonly<{ counts: WikiEvidenceCounts }>;
type LegacyAliasEvidence = WikiAliasDescriptor & Readonly<{ counts: WikiEvidenceCounts }>;
type LegacyAuthority = WikiRuleDescriptor & Readonly<{ confirmedAtRevision: number }>;
type LegacyTombstone = WikiRuleDescriptor & Readonly<{ rejectedAtRevision: number }>;
