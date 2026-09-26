/**
 * Wiki keeps bounded lexical decisions and aggregate evidence. It never owns
 * material, raw excerpts, model context, or a history of where a term appeared.
 */

import type { MatterLocale } from "../config/locales";
import type {
  WikiAliasEvidenceProducer,
  WikiAutomaticAliasPhase,
  WikiAutomaticTermPhase,
} from "./wiki-learning-policy";

export const WIKI_SCHEMA_VERSION = 5 as const;
export const WIKI_SCORING_VERSION = 3 as const;
export const WIKI_FITTING_VERSION = 1 as const;

export const MAX_WIKI_FORM_CODE_POINTS = 64;
export const MAX_WIKI_CANONICAL_CODE_POINTS = 128;
export const MAX_WIKI_EVIDENCE_RECORDS = 5_000;
export const MAX_WIKI_AUTHORITY_RULES = 5_000;
export const MAX_WIKI_TOMBSTONES = 5_000;
// A valid V2 state could contain disjoint canonical identities in each of its
// three independently bounded relation collections. V3 must be able to load
// every previously valid state before any compaction policy is applied.
export const MAX_WIKI_LEXEMES = MAX_WIKI_EVIDENCE_RECORDS +
  MAX_WIKI_AUTHORITY_RULES + MAX_WIKI_TOMBSTONES;
export const MAX_WIKI_LEXEME_TOMBSTONES = 5_000;
export const MAX_WIKI_EVIDENCE_COUNT = 255;
// Evidence-cohort aging cadence. This is not an interaction or user-intent window.
export const WIKI_RECENT_OBSERVATION_WINDOW = 32;
export const MAX_WIKI_OBSERVATIONS_PER_BATCH = 32;
// The lexeme schema may transiently represent every relation from a valid 4 MiB
// V2 state as both a stable lexeme and an id-based alias. V4 adds one bounded
// scope field to every V3 lexeme; the extra MiB keeps every formerly valid V3
// row saveable after migration without weakening any collection bound.
export const MAX_WIKI_STATE_BYTES = 9 * 1_024 * 1_024;
export const MAX_WIKI_APPLICABLE_RULES = 5_000;
export const MAX_WIKI_APPLICABLE_CODE_POINTS = 256_000;

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
  phase: WikiAutomaticTermPhase;
  support: number;
  quietTurns: number;
}>;

export type WikiAliasEvidenceAggregate = WikiAliasDescriptor & Readonly<{
  producer: WikiAliasEvidenceProducer;
  phase: WikiAutomaticAliasPhase;
  support: number;
  quietTurns: number;
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
}>;

export type WikiMatchRule = WikiRuleDescriptor & Readonly<{
  authority: WikiRuleAuthority;
  provenance: WikiRuleProvenance;
  /** Internal activation receipt. Matchers and presentation must not rank with it. */
  score: number;
}>;

export type WikiObserveEvidenceEvent = WikiRuleDescriptor & Readonly<{
  type: "observe-evidence";
  source: WikiEvidenceSource;
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
