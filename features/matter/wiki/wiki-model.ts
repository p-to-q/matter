/**
 * Wiki keeps bounded lexical decisions and aggregate evidence. It never owns
 * material, raw excerpts, model context, or a history of where a term appeared.
 */

import type { MatterLocale } from "../config/locales";
import type {
  WikiAliasEvidenceProducer,
  WikiAutomaticAliasPhase,
  WikiAutomaticTermPhase,
  WikiOccurrenceOrigin,
  WikiOccurrenceOutcome,
  WikiStoredTermEvidenceProducer,
  WikiTermEvidenceProducer,
} from "./wiki-learning-policy";
import type { WikiScriptClass } from "./wiki-script";

export const WIKI_SCHEMA_VERSION = 7 as const;
/** Scoring V4 stores quarter-observation units; V6 stored whole observations. */
export const WIKI_SCORING_VERSION = 4 as const;
export const WIKI_FITTING_VERSION = 1 as const;

export const MAX_WIKI_FORM_CODE_POINTS = 64;
export const MAX_WIKI_CANONICAL_CODE_POINTS = 128;
export const MAX_WIKI_EVIDENCE_RECORDS = 5_000;
/** V2-V5 recovery accepts 5,000 rows; new automatic learning deliberately
 * keeps a smaller active reservoir that can be qualified on the UI thread. */
export const MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS = 512;
/** Pronunciation fitting is a disposable hot index, not the durable Wiki.
 * Explicit rules remain available up to their independent 5,000-rule bound. */
export const MAX_WIKI_FITTING_TARGETS = 512;
/** New human-owned dictionary entries have their own product limit. The wider
 * structural lexeme bound below exists only so every valid V2-V5 state remains
 * recoverable before a person decides what to keep. */
export const MAX_WIKI_HUMAN_CONFIRMED_LEXEMES = 5_000;
export const MAX_WIKI_AUTHORITY_RULES = 5_000;
export const MAX_WIKI_TOMBSTONES = 5_000;
// A valid V2 state could contain disjoint canonical identities in each of its
// three independently bounded relation collections. V3 must be able to load
// every previously valid state before any compaction policy is applied.
export const MAX_WIKI_LEXEMES = MAX_WIKI_EVIDENCE_RECORDS +
  MAX_WIKI_AUTHORITY_RULES + MAX_WIKI_TOMBSTONES;
export const MAX_WIKI_LEXEME_TOMBSTONES = 5_000;
/** Whole-observation bound of V2-V6 records; V7 stores quarter-units. */
export const MAX_WIKI_EVIDENCE_COUNT = 255;
// Legacy V2-V4 quiet window; V7 cadence lives in the learning policy.
export const WIKI_RECENT_OBSERVATION_WINDOW = 32;
/** Each producer scans at most this many distinct observations per turn. */
export const MAX_WIKI_OBSERVATIONS_PER_LEDGER = 32;
/** One batch carries at most one full term ledger and one full alias ledger. */
export const MAX_WIKI_OBSERVATIONS_PER_BATCH = 2 * MAX_WIKI_OBSERVATIONS_PER_LEDGER;
/** Revert strikes belong to automatic aliases, bounded by their reservoir. */
export const MAX_WIKI_REVERT_STRIKES = MAX_WIKI_AUTOMATIC_EVIDENCE_RECORDS;
// The lexeme schema may transiently represent every relation from a valid 4 MiB
// V2 state as both a stable lexeme and an id-based alias. V4 adds one bounded
// scope field to every V3 lexeme; 9 MiB keeps every formerly valid V2-V4 row
// saveable. V6 adds one fixed producer field to at most 5,000 V5 term rows;
// 256 KiB is a proved migration allowance, not an unbounded growth reserve.
// V7 adds two fixed kept fields to at most 5,000 alias rows, one quarter-unit
// digit to at most 10,000 evidence rows, and one empty strike collection;
// 160 KiB is the proved V6-to-V7 allowance.
export const MAX_LEGACY_WIKI_STATE_BYTES = 9 * 1_024 * 1_024;
export const MAX_WIKI_MIGRATION_HEADROOM_BYTES = 256 * 1_024;
export const MAX_WIKI_V6_STATE_BYTES = MAX_LEGACY_WIKI_STATE_BYTES +
  MAX_WIKI_MIGRATION_HEADROOM_BYTES;
export const MAX_WIKI_V7_MIGRATION_HEADROOM_BYTES = 160 * 1_024;
export const MAX_WIKI_STATE_BYTES = MAX_WIKI_V6_STATE_BYTES +
  MAX_WIKI_V7_MIGRATION_HEADROOM_BYTES;
export const MAX_WIKI_APPLICABLE_RULES = 5_000;
export const MAX_WIKI_APPLICABLE_CODE_POINTS = 256_000;

export const WIKI_STARTER_LEXEMES = Object.freeze([
  Object.freeze({ locale: "en-US" as const, canonical: "Engelbart", scope: "both" as const }),
  Object.freeze({ locale: "en-US" as const, canonical: "Morphogenesis", scope: "both" as const }),
  Object.freeze({ locale: "en-US" as const, canonical: "KFC", scope: "both" as const }),
  Object.freeze({ locale: "zh-CN" as const, canonical: "[p → q]", scope: "both" as const }),
]);

/** Product starter identity is locale-bound; a same-spelling custom entry in
 * another locale remains an ordinary term candidate. */
export function isWikiStarterLexemeIdentity(
  value: Readonly<{ locale: MatterLocale; canonical: string }>,
): boolean {
  return WIKI_STARTER_LEXEMES.some((starter) =>
    starter.locale === value.locale && starter.canonical === value.canonical);
}

export type WikiChannel = "spoken" | "written";
export type WikiLexemeScope = WikiChannel | "both";
export type WikiBoundary = "literal" | "word";
export type WikiRuleAuthority = "confirmed" | "provisional";
export type WikiRuleProvenance = "human-confirmed" | "aggregate-evidence";
export type WikiEvidenceSource =
  | "recent-material"
  | "machine-inference";

export type WikiRuleDescriptor = Readonly<{
  locale: MatterLocale;
  channel: WikiChannel;
  boundary: WikiBoundary;
  form: string;
  canonical: string;
}>;

export type WikiLexemeProvenance = "human-confirmed" | "aggregate-evidence";

export type WikiLexeme = Readonly<{
  id: number;
  locale: MatterLocale;
  canonical: string;
  scope: WikiLexemeScope;
  provenance: WikiLexemeProvenance;
  confirmedAtRevision: number | null;
}>;

export type WikiAliasDescriptor = Readonly<{
  lexemeId: number;
  channel: WikiChannel;
  boundary: WikiBoundary;
  form: string;
}>;

/** Canonical recurrence and relation evidence are separate durable facts.
 * A frequent term can never lend authority to an alias relation. */
export type WikiTermEvidenceAggregate = Readonly<{
  locale: MatterLocale;
  canonical: string;
  producer: WikiStoredTermEvidenceProducer;
  phase: WikiAutomaticTermPhase;
  support: number;
  quietTurns: number;
}>;

/** Support is producer evidence; kept is informed acceptance of applied
 * occurrences. Both are quarter-units; only support can activate. */
export type WikiAliasEvidenceAggregate = WikiAliasDescriptor & Readonly<{
  producer: WikiAliasEvidenceProducer;
  phase: WikiAutomaticAliasPhase;
  support: number;
  quietTurns: number;
  kept: number;
  keptQuietTurns: number;
}>;

export type WikiAuthorityRule = WikiAliasDescriptor & Readonly<{
  confirmedAtRevision: number;
}>;

export type WikiTombstone = WikiAliasDescriptor & Readonly<{
  rejectedAtRevision: number;
}>;

export type WikiLexemeTombstone = Readonly<{
  locale: MatterLocale;
  canonical: string;
  rejectedAtRevision: number;
}>;

/** One reverted automatic alias, remembered for a bounded number of
 * comparable turns. A second revert inside that memory becomes a tombstone. */
export type WikiRevertStrike = Readonly<{
  lexemeId: number;
  channel: WikiChannel;
  form: string;
  quietTurns: number;
}>;

export type WikiState = Readonly<{
  schemaVersion: typeof WIKI_SCHEMA_VERSION;
  scoringVersion: typeof WIKI_SCORING_VERSION;
  fittingVersion: typeof WIKI_FITTING_VERSION;
  revision: number;
  nextLexemeId: number;
  automaticLearningSaturated: boolean;
  lexemes: readonly WikiLexeme[];
  termEvidence: readonly WikiTermEvidenceAggregate[];
  aliasEvidence: readonly WikiAliasEvidenceAggregate[];
  authorities: readonly WikiAuthorityRule[];
  aliasTombstones: readonly WikiTombstone[];
  lexemeTombstones: readonly WikiLexemeTombstone[];
  revertStrikes: readonly WikiRevertStrike[];
}>;

export type WikiMatchRule = WikiRuleDescriptor & Readonly<{
  authority: WikiRuleAuthority;
  provenance: WikiRuleProvenance;
  /** Internal activation receipt. Matchers and presentation must not rank with it. */
  score: number;
}>;

export type WikiObserveTermEvidenceEvent = Readonly<{
  type: "observe-evidence";
  source: "recent-material";
  locale: MatterLocale;
  canonical: string;
  producer: WikiTermEvidenceProducer;
}>;

export type WikiObserveAliasEvidenceEvent = WikiRuleDescriptor & Readonly<{
  type: "observe-evidence";
  source: "machine-inference";
  producer: WikiAliasEvidenceProducer;
}>;

export type WikiObserveEvidenceEvent =
  | WikiObserveTermEvidenceEvent
  | WikiObserveAliasEvidenceEvent;

/**
 * What one successful human admission offered a ledger. Only a complete scan
 * of eligible content (`observed` or `quiet`) is an opportunity to age an
 * absent candidate, and only for candidates it could have contained: the same
 * locale and channel, and every script the candidate needs. A `partial` scan
 * scores what it saw and ages nothing. `paused` and `censored` do neither.
 */
export type WikiEvidenceOpportunity = Readonly<{
  locale: MatterLocale;
  channel: WikiChannel;
  scripts: readonly WikiScriptClass[];
}>;

export type WikiLedgerTick =
  | Readonly<{
      disposition: "observed" | "quiet";
      opportunity: WikiEvidenceOpportunity;
    }>
  | Readonly<{ disposition: "partial" | "paused" | "censored" }>;

export type WikiEvidenceTickDisposition = WikiLedgerTick["disposition"];

export type WikiObservationTick = Readonly<{
  term: WikiLedgerTick;
  alias: WikiLedgerTick;
}>;

/** Exact rule identity captured when one occurrence was applied. */
export type WikiAppliedRule = WikiRuleDescriptor & Readonly<{
  authority: WikiRuleAuthority;
}>;

/**
 * The one settlement of one applied occurrence. The occurrence owner settles
 * each occurrence exactly once and carries no surrounding text.
 */
export type WikiOccurrenceSettlement =
  | Readonly<{
      outcome: Exclude<WikiOccurrenceOutcome, "explicit-replace">;
      rule: WikiAppliedRule;
      origin: WikiOccurrenceOrigin;
    }>
  | Readonly<{
      outcome: "explicit-replace";
      rule: WikiAppliedRule;
      origin: WikiOccurrenceOrigin;
      replacement: WikiRuleDescriptor;
    }>;

export type WikiConfirmRuleEvent = WikiRuleDescriptor & Readonly<{
  type: "confirm-rule";
}>;

export type WikiRejectRuleEvent = WikiRuleDescriptor & Readonly<{
  type: "reject-rule";
}>;

export type WikiReplaceRuleEvent = Readonly<{
  type: "replace-rule";
  before: WikiRuleDescriptor;
  after: WikiRuleDescriptor;
}>;

export type WikiCreateLexemeEvent = Readonly<{
  type: "create-lexeme";
  locale: MatterLocale;
  canonical: string;
  scope: WikiLexemeScope;
}>;

export type WikiRenameLexemeEvent = Readonly<{
  type: "rename-lexeme";
  lexemeId: number;
  locale: MatterLocale;
  canonical: string;
  scope: WikiLexemeScope;
}>;

export type WikiRemoveLexemeEvent = Readonly<{
  type: "remove-lexeme";
  lexemeId: number;
}>;

export type WikiEvent =
  | WikiObserveEvidenceEvent
  | WikiConfirmRuleEvent
  | WikiRejectRuleEvent
  | WikiReplaceRuleEvent
  | WikiCreateLexemeEvent
  | WikiRenameLexemeEvent
  | WikiRemoveLexemeEvent;

export type WikiTransitionErrorCode =
  | "INVALID_STATE"
  | "INVALID_EVENT"
  | "BOUND_EXCEEDED";

export type WikiTransitionResult =
  | Readonly<{ ok: true; state: WikiState; changed: boolean }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: WikiTransitionErrorCode; message: string }>;
    }>;
