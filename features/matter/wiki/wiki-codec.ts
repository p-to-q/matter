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
  type WikiAuthorityRule,
  type WikiEvent,
  type WikiEvidenceAggregate,
  type WikiEvidenceCounts,
  type WikiEvidenceSource,
  type WikiLexeme,
  type WikiLexemeTombstone,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTombstone,
} from "./wiki-model";

const LEGACY_RELATION_SCHEMA_VERSION = 2;
const LEGACY_LEXEME_SCHEMA_VERSION = 3;

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

/** Strictly parses V4 or deterministically migrates a valid V2/V3 state. */
export function parseWikiState(value: unknown): WikiStateParse {
  if (!isPlainObject(value)) return invalidState("The Wiki state is not an object.");
  if (value.schemaVersion === LEGACY_RELATION_SCHEMA_VERSION) return parseLegacyWikiState(value);
  if (value.schemaVersion === LEGACY_LEXEME_SCHEMA_VERSION) {
    return parseLegacyLexemeWikiState(value);
  }
  if (value.schemaVersion !== WIKI_SCHEMA_VERSION || !hasExactKeys(value, [
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
  ])) return invalidState("The Wiki state fields are invalid.");
  if (
    value.scoringVersion !== WIKI_SCORING_VERSION ||
    value.fittingVersion !== WIKI_FITTING_VERSION ||
    !isRevision(value.revision) ||
    !isLexemeId(value.nextLexemeId) ||
    !isRecentObservationCount(value.recentObservationCount) ||
    typeof value.automaticLearningSaturated !== "boolean"
  ) return invalidState("The Wiki state version or revision is invalid.");

  const lexemes = parseArray(value.lexemes, MAX_WIKI_LEXEMES, parseLexeme);
  const evidence = parseArray(value.evidence, MAX_WIKI_EVIDENCE_RECORDS, parseEvidence);
  const authorities = parseArray(value.authorities, MAX_WIKI_AUTHORITY_RULES, parseAuthority);
  const aliasTombstones = parseArray(value.aliasTombstones, MAX_WIKI_TOMBSTONES,
    parseAliasTombstone);
  const lexemeTombstones = parseArray(value.lexemeTombstones,
    MAX_WIKI_LEXEME_TOMBSTONES, parseLexemeTombstone);
  if (lexemes === null || evidence === null || authorities === null ||
      aliasTombstones === null || lexemeTombstones === null) {
    return invalidState("A Wiki collection is invalid.");
  }
  return validateParsedState(freezeWikiState({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: value.revision,
    nextLexemeId: value.nextLexemeId,
    recentObservationCount: value.recentObservationCount,
    automaticLearningSaturated: value.automaticLearningSaturated,
    lexemes,
    evidence,
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
  ]) || value.scoringVersion !== WIKI_SCORING_VERSION ||
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
    recentObservationCount: value.recentObservationCount,
    automaticLearningSaturated: false,
    lexemes,
    evidence: evidence.map((entry) => Object.freeze({ ...aliasOf(entry), counts: entry.counts })),
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
  ]) || value.scoringVersion !== WIKI_SCORING_VERSION ||
      value.fittingVersion !== WIKI_FITTING_VERSION ||
      !isRevision(value.revision) || !isLexemeId(value.nextLexemeId) ||
      !isRecentObservationCount(value.recentObservationCount) ||
      typeof value.automaticLearningSaturated !== "boolean") {
    return invalidState("The legacy Wiki lexeme state is invalid.");
  }
  const legacyLexemes = parseArray(value.lexemes, MAX_WIKI_LEXEMES, parseLegacyLexeme);
  const evidence = parseArray(value.evidence, MAX_WIKI_EVIDENCE_RECORDS, parseEvidence);
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
    recentObservationCount: value.recentObservationCount,
    automaticLearningSaturated: value.automaticLearningSaturated,
    lexemes,
    evidence,
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

function parseEvidence(value: unknown): WikiEvidenceAggregate | null {
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
type LegacyEvidence = WikiRuleDescriptor & Readonly<{ counts: WikiEvidenceCounts }>;
type LegacyAuthority = WikiRuleDescriptor & Readonly<{ confirmedAtRevision: number }>;
type LegacyTombstone = WikiRuleDescriptor & Readonly<{ rejectedAtRevision: number }>;
