import { isMatterLocale } from "../config/locales";
import { isWellFormedUnicodeText } from "../tree/unicode-text";
import {
  MAX_WIKI_AUTHORITY_RULES,
  MAX_WIKI_APPLICABLE_CODE_POINTS,
  MAX_WIKI_CANONICAL_CODE_POINTS,
  MAX_WIKI_EVIDENCE_RECORDS,
  MAX_WIKI_FORM_CODE_POINTS,
  MAX_WIKI_LEXEMES,
  MAX_WIKI_LEXEME_TOMBSTONES,
  MAX_WIKI_TOMBSTONES,
  WIKI_FITTING_VERSION,
  WIKI_SCHEMA_VERSION,
  WIKI_SCORING_VERSION,
  type WikiAliasDescriptor,
  type WikiAliasEvidenceAggregate,
  type WikiAuthorityRule,
  type WikiBoundary,
  type WikiChannel,
  type WikiLexeme,
  type WikiLexemeScope,
  type WikiLexemeTombstone,
  type WikiRuleDescriptor,
  type WikiState,
  type WikiTermEvidenceAggregate,
  type WikiTombstone,
} from "./wiki-model";
import {
  MAX_WIKI_LEARNING_QUIET_TURNS,
  WIKI_ALIAS_PRODUCER_WEIGHTS,
  isWikiLearningCount,
} from "./wiki-learning-policy";
import { hasUnsafeWikiFormatControl } from "./wiki-text-safety";

const ASCII_CONTROL = /[\u0000-\u001f\u007f]/u;

export type WikiInvariantResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

export function isWikiChannel(value: unknown): value is WikiChannel {
  return value === "spoken" || value === "written";
}

export function isWikiLexemeScope(value: unknown): value is WikiLexemeScope {
  return value === "spoken" || value === "written" || value === "both";
}

export function isWikiBoundary(value: unknown): value is WikiBoundary {
  return value === "literal" || value === "word";
}

export function isWikiForm(value: unknown): value is string {
  return isWikiText(value, MAX_WIKI_FORM_CODE_POINTS);
}

export function isWikiCanonical(value: unknown): value is string {
  return isWikiText(value, MAX_WIKI_CANONICAL_CODE_POINTS);
}

/** Wire-level descriptor resolved by canonical text at the application edge. */
export function isWikiDescriptor(value: unknown): value is WikiRuleDescriptor {
  return isPlainObject(value) &&
    typeof value.locale === "string" &&
    isMatterLocale(value.locale) &&
    isWikiChannel(value.channel) &&
    isWikiBoundary(value.boundary) &&
    isWikiForm(value.form) &&
    isWikiCanonical(value.canonical) &&
    value.form !== value.canonical;
}

export function isWikiAliasDescriptor(value: unknown): value is WikiAliasDescriptor {
  return isPlainObject(value) &&
    isLexemeId(value.lexemeId) &&
    isWikiChannel(value.channel) &&
    isWikiBoundary(value.boundary) &&
    isWikiForm(value.form);
}

export function validateWikiState(state: WikiState): WikiInvariantResult {
  if (typeof state !== "object" || state === null || Array.isArray(state) ||
      !hasExactKeys(state, [
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
      ])) {
    return invalid("The Wiki state is not an object.");
  }
  if (
    state.schemaVersion !== WIKI_SCHEMA_VERSION ||
    state.scoringVersion !== WIKI_SCORING_VERSION ||
    state.fittingVersion !== WIKI_FITTING_VERSION
  ) return invalid("The Wiki version is unsupported.");
  if (!isRevision(state.revision) || !isLexemeId(state.nextLexemeId)) {
    return invalid("The Wiki revision or lexeme sequence is invalid.");
  }
  if (typeof state.automaticLearningSaturated !== "boolean") {
    return invalid("The Wiki automatic-learning latch is invalid.");
  }
  if (
    !Array.isArray(state.lexemes) ||
    !Array.isArray(state.termEvidence) ||
    !Array.isArray(state.aliasEvidence) ||
    !Array.isArray(state.authorities) ||
    !Array.isArray(state.aliasTombstones) ||
    !Array.isArray(state.lexemeTombstones)
  ) return invalid("The Wiki collections are invalid.");
  if (
    state.lexemes.length > MAX_WIKI_LEXEMES ||
    state.termEvidence.length > MAX_WIKI_EVIDENCE_RECORDS ||
    state.aliasEvidence.length > MAX_WIKI_EVIDENCE_RECORDS ||
    state.authorities.length > MAX_WIKI_AUTHORITY_RULES ||
    state.aliasTombstones.length > MAX_WIKI_TOMBSTONES ||
    state.lexemeTombstones.length > MAX_WIKI_LEXEME_TOMBSTONES
  ) return invalid("The Wiki collection bound is exceeded.");

  const lexemeIds = new Set<number>();
  const lexemeKeys = new Set<string>();
  const lexemesById = new Map<number, WikiLexeme>();
  const lexemesByKey = new Map<string, WikiLexeme>();
  for (const lexeme of state.lexemes) {
    if (!isWikiLexeme(lexeme) || lexeme.id >= state.nextLexemeId) {
      return invalid("A Wiki lexeme is invalid.");
    }
    if (lexeme.confirmedAtRevision !== null && lexeme.confirmedAtRevision > state.revision) {
      return invalid("A Wiki lexeme revision is in the future.");
    }
    const key = lexemeKey(lexeme);
    if (lexemeIds.has(lexeme.id) || lexemeKeys.has(key)) {
      return invalid("Wiki lexemes are duplicated.");
    }
    lexemeIds.add(lexeme.id);
    lexemeKeys.add(key);
    lexemesById.set(lexeme.id, lexeme);
    lexemesByKey.set(key, lexeme);
  }

  const termEvidenceKeys = new Set<string>();
  for (const aggregate of state.termEvidence) {
    if (!isWikiTermEvidenceAggregate(aggregate)) {
      return invalid("A Wiki term evidence record is invalid.");
    }
    const key = lexemeKey(aggregate);
    if (termEvidenceKeys.has(key)) {
      return invalid("Wiki term evidence records are duplicated.");
    }
    if (aggregate.phase === "collected" && !lexemeKeys.has(key)) {
      return invalid("Collected Wiki term evidence has no lexeme.");
    }
    if (lexemesByKey.get(key)?.provenance === "human-confirmed") {
      return invalid("Human-owned Wiki lexemes cannot retain automatic recurrence.");
    }
    termEvidenceKeys.add(key);
  }

  const aliasEvidenceKeys = new Set<string>();
  for (const aggregate of state.aliasEvidence) {
    if (!isWikiAliasEvidenceAggregate(aggregate) ||
        !isValidAliasTarget(aggregate, lexemesById)) {
      return invalid("A Wiki alias evidence record is invalid.");
    }
    const key = aliasEvidenceKey(aggregate);
    if (aliasEvidenceKeys.has(key)) {
      return invalid("Wiki alias evidence records are duplicated.");
    }
    aliasEvidenceKeys.add(key);
  }

  const authorityAliases = new Set<string>();
  const authorityKeys = new Set<string>();
  let confirmedCodePoints = 0;
  for (const authority of state.authorities) {
    if (!hasExactKeys(authority, [
      "lexemeId", "channel", "boundary", "form", "confirmedAtRevision",
    ]) || !isWikiAliasDescriptor(authority) ||
      !("confirmedAtRevision" in authority) ||
      !isRevision(authority.confirmedAtRevision) ||
      !isValidAliasTarget(authority, lexemesById)) {
      return invalid("A Wiki authority rule is invalid.");
    }
    if (authority.confirmedAtRevision > state.revision) {
      return invalid("A Wiki authority revision is in the future.");
    }
    const lexeme = lexemesById.get(authority.lexemeId);
    if (lexeme === undefined) return invalid("A Wiki authority target is missing.");
    const alias = storedAliasKey(authority, lexeme.locale);
    if (authorityAliases.has(alias)) {
      return invalid("A Wiki form has more than one confirmed authority.");
    }
    authorityAliases.add(alias);
    authorityKeys.add(storedDecisionKey(authority));
    confirmedCodePoints += Array.from(authority.form).length +
      Array.from(lexeme.canonical).length;
  }
  if (confirmedCodePoints > MAX_WIKI_APPLICABLE_CODE_POINTS) {
    return invalid("The confirmed Wiki matcher corpus bound is exceeded.");
  }

  const tombstoneKeys = new Set<string>();
  for (const tombstone of state.aliasTombstones) {
    if (!hasExactKeys(tombstone, [
      "lexemeId", "channel", "boundary", "form", "rejectedAtRevision",
    ]) || !isWikiAliasDescriptor(tombstone) ||
      !("rejectedAtRevision" in tombstone) ||
      !isRevision(tombstone.rejectedAtRevision) ||
      !isValidAliasTarget(tombstone, lexemesById)) {
      return invalid("A Wiki alias tombstone is invalid.");
    }
    if (tombstone.rejectedAtRevision > state.revision) {
      return invalid("A Wiki alias tombstone revision is in the future.");
    }
    const key = storedDecisionKey(tombstone);
    if (tombstoneKeys.has(key)) return invalid("Wiki alias tombstones are duplicated.");
    if (authorityKeys.has(key)) {
      return invalid("One Wiki alias cannot be confirmed and rejected.");
    }
    tombstoneKeys.add(key);
  }

  const lexemeTombstoneKeys = new Set<string>();
  for (const tombstone of state.lexemeTombstones) {
    if (!isWikiLexemeTombstone(tombstone) || tombstone.rejectedAtRevision > state.revision) {
      return invalid("A Wiki lexeme tombstone is invalid.");
    }
    const key = lexemeKey(tombstone);
    if (lexemeTombstoneKeys.has(key) || lexemeKeys.has(key)) {
      return invalid("A Wiki lexeme cannot be active and rejected.");
    }
    lexemeTombstoneKeys.add(key);
  }

  return Object.freeze({ ok: true });
}

export function freezeWikiState(state: WikiState): WikiState {
  const lexemes = state.lexemes.map(freezeLexeme).sort(compareLexeme);
  const termEvidence = state.termEvidence.map(freezeTermEvidence)
    .sort(compareLexemeIdentity);
  const aliasEvidence = state.aliasEvidence.map(freezeAliasEvidence)
    .sort(compareAliasEvidence);
  const authorities = state.authorities.map(freezeAuthority).sort(compareAliasDescriptor);
  const aliasTombstones = state.aliasTombstones
    .map(freezeTombstone)
    .sort(compareAliasDescriptor);
  const lexemeTombstones = state.lexemeTombstones
    .map((value) => Object.freeze({
      locale: value.locale,
      canonical: value.canonical,
      rejectedAtRevision: value.rejectedAtRevision,
    }))
    .sort(compareLexemeIdentity);
  return Object.freeze({
    schemaVersion: WIKI_SCHEMA_VERSION,
    scoringVersion: WIKI_SCORING_VERSION,
    fittingVersion: WIKI_FITTING_VERSION,
    revision: state.revision,
    nextLexemeId: state.nextLexemeId,
    automaticLearningSaturated: state.automaticLearningSaturated,
    lexemes: Object.freeze(lexemes),
    termEvidence: Object.freeze(termEvidence),
    aliasEvidence: Object.freeze(aliasEvidence),
    authorities: Object.freeze(authorities),
    aliasTombstones: Object.freeze(aliasTombstones),
    lexemeTombstones: Object.freeze(lexemeTombstones),
  });
}

export function descriptorKey(value: WikiRuleDescriptor): string {
  return JSON.stringify([
    value.locale,
    value.channel,
    value.boundary,
    value.form,
    value.canonical,
  ]);
}

/** Identity a person can perceive and decide; matcher boundary is internal. */
export function decisionKey(value: WikiRuleDescriptor): string {
  return JSON.stringify([value.locale, value.channel, value.form, value.canonical]);
}

export function aliasKey(
  value: Pick<WikiRuleDescriptor, "locale" | "channel" | "form">,
): string {
  return JSON.stringify([value.locale, value.channel, value.form]);
}

export function storedDescriptorKey(value: WikiAliasDescriptor): string {
  return JSON.stringify([value.lexemeId, value.channel, value.boundary, value.form]);
}

export function storedDecisionKey(value: WikiAliasDescriptor): string {
  return JSON.stringify([value.lexemeId, value.channel, value.form]);
}

export function storedAliasKey(
  value: Pick<WikiAliasDescriptor, "channel" | "form">,
  locale: string,
): string {
  return JSON.stringify([locale, value.channel, value.form]);
}

export function lexemeKey(
  value: Pick<WikiLexeme, "locale" | "canonical">,
): string {
  return JSON.stringify([value.locale, value.canonical]);
}

export function compareDescriptor(left: WikiRuleDescriptor, right: WikiRuleDescriptor): number {
  return compareText(left.locale, right.locale) ||
    compareText(left.channel, right.channel) ||
    compareText(left.form, right.form) ||
    compareText(left.canonical, right.canonical) ||
    compareText(left.boundary, right.boundary);
}

function isWikiText(value: unknown, maxCodePoints: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedUnicodeText(value) &&
    !ASCII_CONTROL.test(value) &&
    !hasUnsafeWikiFormatControl(value) &&
    value.trim() === value &&
    value.normalize("NFC") === value &&
    Array.from(value).length <= maxCodePoints;
}

function isWikiLexeme(value: unknown): value is WikiLexeme {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "id", "locale", "canonical", "scope", "provenance", "confirmedAtRevision",
  ])) return false;
  if (!isLexemeId(value.id) || typeof value.locale !== "string" ||
      !isMatterLocale(value.locale) || !isWikiCanonical(value.canonical) ||
      !isWikiLexemeScope(value.scope)) {
    return false;
  }
  if (value.provenance === "human-confirmed") {
    return isRevision(value.confirmedAtRevision);
  }
  return value.provenance === "aggregate-evidence" && value.confirmedAtRevision === null;
}

function isWikiLexemeTombstone(value: unknown): value is WikiLexemeTombstone {
  return isPlainObject(value) &&
    hasExactKeys(value, ["locale", "canonical", "rejectedAtRevision"]) &&
    typeof value.locale === "string" &&
    isMatterLocale(value.locale) &&
    isWikiCanonical(value.canonical) &&
    isRevision(value.rejectedAtRevision);
}

function isValidAliasTarget(
  value: WikiAliasDescriptor,
  lexemesById: ReadonlyMap<number, WikiLexeme>,
): boolean {
  const lexeme = lexemesById.get(value.lexemeId);
  return lexeme !== undefined && value.form !== lexeme.canonical;
}

function isWikiTermEvidenceAggregate(value: unknown): value is WikiTermEvidenceAggregate {
  return isPlainObject(value) &&
    hasExactKeys(value, ["locale", "canonical", "phase", "support", "quietTurns"]) &&
    typeof value.locale === "string" && isMatterLocale(value.locale) &&
    isWikiCanonical(value.canonical) &&
    (value.phase === "candidate" || value.phase === "collected") &&
    isWikiLearningCount(value.support) &&
    isWikiQuietTurns(value.quietTurns) &&
    (value.phase !== "candidate" || value.support < 2) &&
    (value.phase !== "collected" || value.support >= 1);
}

function isWikiAliasEvidenceAggregate(value: unknown): value is WikiAliasEvidenceAggregate {
  return isPlainObject(value) &&
    hasExactKeys(value, [
      "lexemeId", "channel", "boundary", "form", "producer", "phase", "support",
      "quietTurns",
    ]) &&
    typeof value.producer === "string" &&
    Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, value.producer) &&
    (value.phase === "candidate" || value.phase === "active") &&
    isWikiLearningCount(value.support) &&
    value.support > 0 &&
    isWikiQuietTurns(value.quietTurns) &&
    isWikiAliasDescriptor(value);
}

function isWikiQuietTurns(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) <= MAX_WIKI_LEARNING_QUIET_TURNS;
}

function isLexemeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function freezeLexeme(value: WikiLexeme): WikiLexeme {
  return Object.freeze({
    id: value.id,
    locale: value.locale,
    canonical: value.canonical,
    scope: value.scope,
    provenance: value.provenance,
    confirmedAtRevision: value.confirmedAtRevision,
  });
}

function freezeTermEvidence(value: WikiTermEvidenceAggregate): WikiTermEvidenceAggregate {
  return Object.freeze({
    locale: value.locale,
    canonical: value.canonical,
    phase: value.phase,
    support: value.support,
    quietTurns: value.quietTurns,
  });
}

function freezeAliasEvidence(value: WikiAliasEvidenceAggregate): WikiAliasEvidenceAggregate {
  return Object.freeze({
    lexemeId: value.lexemeId,
    channel: value.channel,
    boundary: value.boundary,
    form: value.form,
    producer: value.producer,
    phase: value.phase,
    support: value.support,
    quietTurns: value.quietTurns,
  });
}

function freezeAuthority(value: WikiAuthorityRule): WikiAuthorityRule {
  return Object.freeze({
    lexemeId: value.lexemeId,
    channel: value.channel,
    boundary: value.boundary,
    form: value.form,
    confirmedAtRevision: value.confirmedAtRevision,
  });
}

function freezeTombstone(value: WikiTombstone): WikiTombstone {
  return Object.freeze({
    lexemeId: value.lexemeId,
    channel: value.channel,
    boundary: value.boundary,
    form: value.form,
    rejectedAtRevision: value.rejectedAtRevision,
  });
}

function compareLexeme(left: WikiLexeme, right: WikiLexeme): number {
  return left.id - right.id;
}

function compareLexemeIdentity(
  left: Pick<WikiLexeme, "locale" | "canonical">,
  right: Pick<WikiLexeme, "locale" | "canonical">,
): number {
  return compareText(left.locale, right.locale) || compareText(left.canonical, right.canonical);
}

function compareAliasDescriptor(left: WikiAliasDescriptor, right: WikiAliasDescriptor): number {
  return left.lexemeId - right.lexemeId ||
    compareText(left.channel, right.channel) ||
    compareText(left.form, right.form) ||
    compareText(left.boundary, right.boundary);
}

function aliasEvidenceKey(value: WikiAliasEvidenceAggregate): string {
  return JSON.stringify([storedDescriptorKey(value), value.producer]);
}

function compareAliasEvidence(
  left: WikiAliasEvidenceAggregate,
  right: WikiAliasEvidenceAggregate,
): number {
  return compareAliasDescriptor(left, right) || compareText(left.producer, right.producer);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function invalid(message: string): WikiInvariantResult {
  return Object.freeze({ ok: false, message });
}

function hasExactKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
