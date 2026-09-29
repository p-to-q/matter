/**
 * Pure integer policy for automatic Wiki learning.
 *
 * The policy has no persistence, locale data, runtime feature gate, or human
 * authority. A caller supplies release-qualified producers, committed human
 * observations, and the settled outcome of one exact applied occurrence.
 * Generated and protected material never adds admission evidence or advances
 * the learning clock. Informed implicit acceptance of an applied occurrence is
 * approval: it reinforces retention and competition, but it can never create
 * a relation, activate one, or become human-confirmed authority.
 *
 * Every stored quantity is a saturating integer. Evidence is kept in
 * quarter-observation units so one observation fades 4 -> 2 -> 1 -> 0 across
 * successive half-lives instead of vanishing at its first aging: short-range
 * evidence acts boldly, long-range evidence stays accurate, and newer evidence
 * weighs more while older evidence still counts.
 */

export const WIKI_LEARNING_POLICY_VERSION = 4 as const;
export const WIKI_EVIDENCE_UNITS_PER_OBSERVATION = 4;
const MAX_WIKI_LEARNING_OBSERVATIONS = 255;
/** V6 stored whole observations up to 255; this bound scales them exactly. */
export const MAX_WIKI_LEARNING_UNITS =
  MAX_WIKI_LEARNING_OBSERVATIONS * WIKI_EVIDENCE_UNITS_PER_OBSERVATION;
/** Support halves after 32 comparable quiet human turns (counter 0..31). */
export const MAX_WIKI_LEARNING_QUIET_TURNS = 31;
export const MAX_WIKI_LEARNING_REPLAY_STEPS = 4_096;
export const MAX_WIKI_LEARNING_CANDIDATES = 5_000;
export const MAX_WIKI_LEARNING_REPLAY_OBSERVATIONS_PER_STEP = 32;
export const MAX_WIKI_LEARNING_CANDIDATE_ID_CODE_POINTS = 512;

/** Thresholds in quarter-units; semantically the former 2 and 1 observations. */
export const WIKI_TERM_SCORE_POLICY = Object.freeze({
  collectionSupport: 8,
  retentionSupport: 4,
});

export type WikiTermEvidenceProducer =
  | "shape-specific-v1"
  | "locale-segment-v1";

/** Persisted provenance includes a zero-authority migration marker. New
 * observations can never create it. */
export type WikiStoredTermEvidenceProducer =
  | WikiTermEvidenceProducer
  | "legacy-term-v1";

/** Observations contributed by one turn. Shape-specific terms may surface
 * after one turn; broad lexical segments require recurrence. */
export const WIKI_TERM_PRODUCER_WEIGHTS: Readonly<
  Record<WikiTermEvidenceProducer, 1 | 2>
> = Object.freeze({
  "shape-specific-v1": 2,
  "locale-segment-v1": 1,
});

export function isWikiTermEvidenceProducer(
  value: unknown,
): value is WikiTermEvidenceProducer {
  return typeof value === "string" && Object.hasOwn(WIKI_TERM_PRODUCER_WEIGHTS, value);
}

export function isWikiStoredTermEvidenceProducer(
  value: unknown,
): value is WikiStoredTermEvidenceProducer {
  return value === "legacy-term-v1" || isWikiTermEvidenceProducer(value);
}

/** One aggregate term may become a fitting or rewrite target only while its
 * evidence is still live and its exact producer release remains qualified. */
export function isQualifiedCollectedWikiTermEvidence(
  evidence: Readonly<{
    producer: WikiStoredTermEvidenceProducer;
    phase: WikiAutomaticTermPhase;
    support: number;
  }> | undefined,
  qualifiedProducers: ReadonlySet<WikiTermEvidenceProducer>,
): boolean {
  return evidence !== undefined && evidence.phase === "collected" &&
    evidence.support > 0 && isWikiTermEvidenceProducer(evidence.producer) &&
    qualifiedProducers.has(evidence.producer);
}

/**
 * Relation gates in quarter-units, equivalent to the former activation 8 /
 * margin 4 and retention 5 / margin 3 over whole observations. Exact relations
 * (weight 3) still activate on the third unopposed turn and restricted ones
 * (weight 2) on the fourth.
 */
export const WIKI_ALIAS_SCORE_POLICY = Object.freeze({
  activationScore: 32,
  retentionScore: 20,
  activationMargin: 16,
  retentionMargin: 12,
});

export type WikiAliasEvidenceProducer =
  | "legacy-v1"
  | "latin-internal-edit-v2"
  | "en-metaphone-v1"
  | "en-exact-homophone-v1"
  | "zh-exact-homophone-v1"
  | "zh-final-pair-v1";

export const WIKI_ALIAS_PRODUCER_WEIGHTS: Readonly<
  Record<WikiAliasEvidenceProducer, number>
> = Object.freeze({
  "legacy-v1": 0,
  "latin-internal-edit-v2": 2,
  "en-metaphone-v1": 2,
  "en-exact-homophone-v1": 3,
  "zh-exact-homophone-v1": 3,
  "zh-final-pair-v1": 2,
});

export function isWikiAliasEvidenceProducer(
  value: unknown,
): value is WikiAliasEvidenceProducer {
  return typeof value === "string" && Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, value);
}

/**
 * Explicit, versioned producer precedence. Lower rank wins wherever two
 * producers describe the same thing in one human turn, and orders otherwise
 * tied competitors deterministically; no decision depends on producer-name
 * spelling or on the order in which a caller listed events.
 *
 * Relation rank: a stronger per-observation weight first; among equal weights,
 * the narrower relation first. `claimsCollectionSource` says whether a unique
 * relation from this producer owns its observed source form in the same turn,
 * so broad term collection does not also teach that source as a canonical and
 * make the relation unreachable. Orthographic internal edits claim their
 * source because such a form is a misspelling, not a word. Pronunciation
 * producers do not: their sources are frequently real words, and letting such
 * a word become canonical is a deliberate no-op veto on a risky rewrite.
 */
export const WIKI_PRODUCER_PRECEDENCE_VERSION = 1 as const;

export const WIKI_ALIAS_PRODUCER_PRECEDENCE: Readonly<Record<
  WikiAliasEvidenceProducer,
  Readonly<{ rank: number; claimsCollectionSource: boolean }>
>> = Object.freeze({
  "en-exact-homophone-v1": Object.freeze({ rank: 1, claimsCollectionSource: false }),
  "zh-exact-homophone-v1": Object.freeze({ rank: 2, claimsCollectionSource: false }),
  "latin-internal-edit-v2": Object.freeze({ rank: 3, claimsCollectionSource: true }),
  "zh-final-pair-v1": Object.freeze({ rank: 4, claimsCollectionSource: false }),
  "en-metaphone-v1": Object.freeze({ rank: 5, claimsCollectionSource: false }),
  "legacy-v1": Object.freeze({ rank: 6, claimsCollectionSource: false }),
});

/** A distinctive shape is more specific evidence than a broad locale segment. */
export const WIKI_TERM_PRODUCER_PRECEDENCE: Readonly<Record<
  WikiStoredTermEvidenceProducer,
  number
>> = Object.freeze({
  "shape-specific-v1": 1,
  "locale-segment-v1": 2,
  "legacy-term-v1": 3,
});

export function compareWikiAliasProducerPrecedence(
  left: WikiAliasEvidenceProducer,
  right: WikiAliasEvidenceProducer,
): number {
  return WIKI_ALIAS_PRODUCER_PRECEDENCE[left].rank -
    WIKI_ALIAS_PRODUCER_PRECEDENCE[right].rank;
}

export function compareWikiTermProducerPrecedence(
  left: WikiStoredTermEvidenceProducer,
  right: WikiStoredTermEvidenceProducer,
): number {
  return WIKI_TERM_PRODUCER_PRECEDENCE[left] - WIKI_TERM_PRODUCER_PRECEDENCE[right];
}

export function wikiAliasProducerClaimsCollectionSource(
  producer: WikiAliasEvidenceProducer,
): boolean {
  return WIKI_ALIAS_PRODUCER_PRECEDENCE[producer].claimsCollectionSource;
}

/**
 * Outcome weights and memories for one exact applied occurrence. Weights are
 * quarter-units and are calibration candidates, not measured product truth.
 * Every duration counts comparable human turns on the existing quiet clock,
 * never wall time; a tombstone is permanent human authority.
 *
 * `countGeneratedImplicitAcceptance` is the single switch for informed
 * implicit acceptance of an occurrence in generated text. It defaults to
 * counting (the owner's "都算赞成"). The risk it accepts: a person may leave a
 * generated passage unread although it was disclosed, so its silence is weaker
 * evidence than silence over their own dictation. Explicit outcomes on
 * generated text always count.
 */
export const WIKI_OCCURRENCE_OUTCOME_POLICY = Object.freeze({
  implicitAcceptanceUnits: 4,
  inspectedKeepUnits: 8,
  maximumKeptUnits: 24,
  keptHalfLifeTurns: 32,
  revertStrikeMemoryTurns: 128,
  countGeneratedImplicitAcceptance: true,
  furtherHumanAdmissionsToSettle: 2,
  foregroundDwellMillisecondsToSettle: 60_000,
});

/** Kept evidence reaches zero after this many comparable turns at most. */
export const MAX_WIKI_KEPT_QUIET_TURNS = WIKI_OCCURRENCE_OUTCOME_POLICY
  .keptHalfLifeTurns * halvingsToZero(WIKI_OCCURRENCE_OUTCOME_POLICY.maximumKeptUnits) - 1;
export const MAX_WIKI_REVERT_STRIKE_QUIET_TURNS =
  WIKI_OCCURRENCE_OUTCOME_POLICY.revertStrikeMemoryTurns - 1;

export type WikiAutomaticTermPhase = "candidate" | "collected";

export type WikiTermEvidence = Readonly<{
  phase: WikiAutomaticTermPhase;
  support: number;
  quietTurns: number;
}>;

export type WikiTermCandidate = WikiTermEvidence & Readonly<{
  canonicalId: string;
}>;

export type WikiAutomaticAliasPhase = "candidate" | "active";

/** Informed acceptance of applied occurrences, separate from producer support. */
export type WikiKeptEvidence = Readonly<{
  kept: number;
  keptQuietTurns: number;
}>;

export type WikiAliasCandidate = WikiKeptEvidence & Readonly<{
  candidateId: string;
  producer: WikiAliasEvidenceProducer;
  phase: WikiAutomaticAliasPhase;
  support: number;
  quietTurns: number;
}>;

export type WikiAliasReleaseQualification = ReadonlySet<WikiAliasEvidenceProducer>;

export type WikiLearningReplayEnvironment =
  | "human-admission"
  | "generated-output"
  | "protected-text";

export type WikiAliasLearningReplayStep = Readonly<{
  environment: WikiLearningReplayEnvironment;
  observedCandidateIds: readonly string[];
}>;

export type WikiAliasLearningReplayReceipt = Readonly<{
  environment: WikiLearningReplayEnvironment;
  admittedObservationCount: number;
  ignoredObservationCount: number;
  activeCandidateId: string | null;
}>;

export type WikiAliasLearningReplay = Readonly<{
  policyVersion: typeof WIKI_LEARNING_POLICY_VERSION;
  candidates: readonly WikiAliasCandidate[];
  receipts: readonly WikiAliasLearningReplayReceipt[];
}>;

export type WikiTermLearningTick = Readonly<{
  candidates: readonly WikiTermCandidate[];
  admittedObservationCount: number;
  ignoredObservationCount: number;
}>;

export type WikiTermLearningReplayStep = Readonly<{
  environment: WikiLearningReplayEnvironment;
  observedCanonicalIds: readonly string[];
}>;

export type WikiTermLearningReplayReceipt = Readonly<{
  environment: WikiLearningReplayEnvironment;
  admittedObservationCount: number;
  ignoredObservationCount: number;
  collectedCanonicalIds: readonly string[];
}>;

export type WikiTermLearningReplay = Readonly<{
  policyVersion: typeof WIKI_LEARNING_POLICY_VERSION;
  candidates: readonly WikiTermCandidate[];
  receipts: readonly WikiTermLearningReplayReceipt[];
}>;

export type WikiSoftCandidateAdmission = "insert" | "update" | "evict";

/** Soft evidence that nothing else depends on, as the eviction order sees it. */
export type WikiEvictionCandidate = Readonly<{
  /** Collected terms and relations that carry kept evidence leave last. */
  established: boolean;
  support: number;
  quietTurns: number;
  identity: string;
}>;

export type WikiLearningCorpusCase = Readonly<{
  caseId: string;
  expectedActionId: string | null;
  appliedActionId: string | null;
  protectedOrGenerated?: boolean;
  activationLatencyTurns?: number;
  demotionLatencyTurns?: number;
  phaseTransitions?: number;
}>;

export type WikiLearningCorpusScore = readonly [
  negativeFalseApplications: number,
  negativeProtectedApplications: number,
  negativeMissedApplications: number,
  correctApplications: number,
  negativeActivationLatency: number,
  negativeDemotionLatency: number,
  negativePhaseTransitions: number,
];

export type WikiLearningCorpusEvaluation = Readonly<{
  corpusId: string;
  caseIds: readonly string[];
  caseSignatures: readonly string[];
  caseCount: number;
  correctApplications: number;
  falseApplications: number;
  missedApplications: number;
  protectedOrGeneratedApplications: number;
  activationLatencyTurns: number;
  demotionLatencyTurns: number;
  phaseTransitions: number;
  score: WikiLearningCorpusScore;
}>;

/**
 * Terminal state of one exact applied occurrence. Each occurrence settles
 * exactly once; copy, export, dwell, or leaving only settle it and never stack.
 */
export const WIKI_OCCURRENCE_OUTCOMES = Object.freeze([
  "accepted-implicit",
  "inspected-kept",
  "explicit-confirm",
  "explicit-reject",
  "reverted",
  "explicit-replace",
  "censored",
] as const);

export type WikiOccurrenceOutcome = (typeof WIKI_OCCURRENCE_OUTCOMES)[number];

/** Material that received the occurrence, as recorded by its attribution. */
export type WikiOccurrenceOrigin = "human-admission" | "generated";

export function isWikiOccurrenceOutcome(value: unknown): value is WikiOccurrenceOutcome {
  return typeof value === "string" &&
    (WIKI_OCCURRENCE_OUTCOMES as readonly string[]).includes(value);
}

/**
 * Facts one occurrence owner accumulates without reading text. `perceived`
 * means the change was disclosed and perceivable at least once: visible in the
 * foreground and announced to assistive technology. `addressIntact` means the
 * unchanged applied word still exists at its committed address; any material
 * change that removed or rewrote it, including Material Undo, clears it.
 */
export type WikiImplicitSettlementFacts = Readonly<{
  perceived: boolean;
  addressIntact: boolean;
  furtherHumanAdmissions: number;
  foregroundDwellMilliseconds: number;
  copiedOrExported: boolean;
  pageExit: boolean;
}>;

export type WikiImplicitSettlement = "pending" | "accepted-implicit" | "censored";

/**
 * Silence counts only when informed. An occurrence that was never perceived,
 * or whose address no longer holds the unchanged word, is censored: neutral,
 * never a failure. Any single informed trigger settles it once.
 */
export function settleWikiImplicitOccurrence(
  facts: WikiImplicitSettlementFacts,
): WikiImplicitSettlement {
  assertImplicitSettlementFacts(facts);
  if (!facts.addressIntact) return "censored";
  if (!facts.perceived) return facts.pageExit ? "censored" : "pending";
  return facts.furtherHumanAdmissions >=
      WIKI_OCCURRENCE_OUTCOME_POLICY.furtherHumanAdmissionsToSettle ||
    facts.foregroundDwellMilliseconds >=
      WIKI_OCCURRENCE_OUTCOME_POLICY.foregroundDwellMillisecondsToSettle ||
    facts.copiedOrExported || facts.pageExit
    ? "accepted-implicit"
    : "pending";
}

export type WikiOccurrenceEffect =
  | Readonly<{ kind: "neutral" }>
  | Readonly<{ kind: "kept"; units: number; implicit: boolean }>
  | Readonly<{ kind: "strike" }>
  | Readonly<{ kind: "confirm" }>
  | Readonly<{ kind: "reject" }>
  | Readonly<{ kind: "replace" }>;

/**
 * The complete outcome table. Explicit decisions take the existing human
 * authority paths. Confirmed human rules and tombstones stay outside scoring,
 * so implicit acceptance, inspection, and reversion of a confirmed rule are
 * neutral; changing that authority is an explicit Wiki decision.
 */
export function decideWikiOccurrenceEffect(
  outcome: WikiOccurrenceOutcome,
  authority: "confirmed" | "provisional",
  origin: WikiOccurrenceOrigin,
): WikiOccurrenceEffect {
  if (!isWikiOccurrenceOutcome(outcome) ||
      (authority !== "confirmed" && authority !== "provisional") ||
      (origin !== "human-admission" && origin !== "generated")) {
    throw new TypeError("occurrence outcome is invalid");
  }
  if (outcome === "explicit-confirm") return EFFECT_CONFIRM;
  if (outcome === "explicit-reject") return EFFECT_REJECT;
  if (outcome === "explicit-replace") return EFFECT_REPLACE;
  if (outcome === "censored" || authority === "confirmed") return EFFECT_NEUTRAL;
  if (outcome === "reverted") return EFFECT_STRIKE;
  if (outcome === "inspected-kept") {
    return Object.freeze({
      kind: "kept",
      units: WIKI_OCCURRENCE_OUTCOME_POLICY.inspectedKeepUnits,
      implicit: false,
    });
  }
  if (origin === "generated" &&
      !WIKI_OCCURRENCE_OUTCOME_POLICY.countGeneratedImplicitAcceptance) {
    return EFFECT_NEUTRAL;
  }
  return Object.freeze({
    kind: "kept",
    units: WIKI_OCCURRENCE_OUTCOME_POLICY.implicitAcceptanceUnits,
    implicit: true,
  });
}

export type WikiLearningInteractionAttribution =
  | "exact-occurrence"
  | "unattributed";

export type WikiLearningInteractionEnvironment =
  | "human-material"
  | "generated-output"
  | "protected-text";

export type WikiLearningExpectedDisposition =
  | "accepted"
  | "rejected"
  | "unknown";

export type WikiLearningTerminalOutcome = WikiOccurrenceOutcome;

export type WikiLearningInteractionCase = Readonly<{
  occurrenceId: string;
  environment: WikiLearningInteractionEnvironment;
  expectedDisposition: WikiLearningExpectedDisposition;
  terminalOutcome: WikiLearningTerminalOutcome;
  attribution: WikiLearningInteractionAttribution;
  decisionLatencyTurns?: number;
}>;

export type WikiLearningRate = Readonly<{
  numerator: number;
  denominator: number;
}>;

export type WikiLearningInteractionEvaluation = Readonly<{
  outcomeCount: number;
  explicitAcceptances: number;
  inspectedAcceptances: number;
  explicitRejections: number;
  implicitAcceptances: number;
  censoredOutcomes: number;
  eligibleCensoredOutcomes: number;
  unsafeOutcomes: number;
  unattributedOutcomes: number;
  generatedExcludedOutcomes: number;
  implicitExposureCount: number;
  falseImplicitPositives: number;
  incorrectExplicitDecisions: number;
  decisionLatencyTurns: number;
  explicitRejectRate: WikiLearningRate;
  censorRate: WikiLearningRate;
}>;

export type WikiLearningInteractionPolicy = Readonly<{
  countGeneratedImplicitAcceptance: boolean;
}>;

export function isWikiLearningUnits(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_WIKI_LEARNING_UNITS;
}

/** A reachable kept pair: bounded, halved with its age, and zero-aged at zero. */
export function isWikiKeptEvidence(value: WikiKeptEvidence): boolean {
  const { kept, keptQuietTurns } = value;
  return Number.isSafeInteger(kept) && kept >= 0 &&
    Number.isSafeInteger(keptQuietTurns) && keptQuietTurns >= 0 &&
    keptQuietTurns <= MAX_WIKI_KEPT_QUIET_TURNS &&
    kept <= WIKI_OCCURRENCE_OUTCOME_POLICY.maximumKeptUnits >>
      Math.floor(keptQuietTurns / WIKI_OCCURRENCE_OUTCOME_POLICY.keptHalfLifeTurns) &&
    (kept > 0 || keptQuietTurns === 0);
}

export function scoreWikiTermEvidence(evidence: WikiTermEvidence): number {
  assertTermEvidence(evidence);
  return evidence.support;
}

/** An observation wins over pending quiet-time decay on the same human tick. */
export function observeWikiTermEvidence(
  evidence: WikiTermEvidence,
  observations: 1 | 2 = 1,
): WikiTermEvidence {
  assertTermEvidence(evidence);
  return freezeTermEvidence({
    ...evidence,
    support: saturatingAdd(
      evidence.support,
      observations * WIKI_EVIDENCE_UNITS_PER_OBSERVATION,
    ),
    quietTurns: 0,
  });
}

/** Applies one completed 32-quiet-turn decay. */
export function ageWikiTermEvidence(
  evidence: WikiTermEvidence,
): WikiTermEvidence {
  assertTermEvidence(evidence);
  return freezeTermEvidence({
    ...evidence,
    support: Math.floor(evidence.support / 2),
    quietTurns: 0,
  });
}

/** Advances one comparable human tick on which this term was not observed. */
export function advanceWikiTermQuietTurn(
  evidence: WikiTermEvidence,
): WikiTermEvidence {
  assertTermEvidence(evidence);
  return evidence.quietTurns === MAX_WIKI_LEARNING_QUIET_TURNS
    ? ageWikiTermEvidence(evidence)
    : freezeTermEvidence({
        ...evidence,
        quietTurns: evidence.quietTurns + 1,
      });
}

export function reconcileWikiTermEvidence(
  evidence: WikiTermEvidence,
): WikiTermEvidence {
  assertTermEvidence(evidence);
  const requiredSupport = evidence.phase === "collected"
    ? WIKI_TERM_SCORE_POLICY.retentionSupport
    : WIKI_TERM_SCORE_POLICY.collectionSupport;
  return freezeTermEvidence({
    ...evidence,
    phase: evidence.support >= requiredSupport ? "collected" : "candidate",
  });
}

export function isWikiTermCandidateEvictable(
  evidence: WikiTermEvidence,
  hasDependentState: boolean,
): boolean {
  assertTermEvidence(evidence);
  return evidence.phase === "candidate" && evidence.support === 0 &&
    !hasDependentState;
}

/** Producer relation score. Only this score may activate a relation. */
export function scoreWikiAliasCandidate(candidate: WikiAliasCandidate): number {
  assertAliasCandidate(candidate);
  return WIKI_ALIAS_PRODUCER_WEIGHTS[candidate.producer] * candidate.support;
}

/** Relation score plus informed acceptance; used for retention and margins. */
export function scoreWikiAliasRetention(candidate: WikiAliasCandidate): number {
  return scoreWikiAliasCandidate(candidate) + candidate.kept;
}

/** An observation wins over pending quiet-time decay on the same human tick. */
export function observeWikiAliasCandidate(
  candidate: WikiAliasCandidate,
): WikiAliasCandidate {
  assertAliasCandidate(candidate);
  return freezeAliasCandidate({
    ...candidate,
    support: saturatingAdd(candidate.support, WIKI_EVIDENCE_UNITS_PER_OBSERVATION),
    quietTurns: 0,
  });
}

/** Applies one completed 32-quiet-turn decay. */
export function ageWikiAliasCandidate(
  candidate: WikiAliasCandidate,
): WikiAliasCandidate {
  assertAliasCandidate(candidate);
  return freezeAliasCandidate({
    ...candidate,
    support: Math.floor(candidate.support / 2),
    quietTurns: 0,
  });
}

/** Advances one comparable human tick on which this alias was not observed. */
export function advanceWikiAliasQuietTurn(
  candidate: WikiAliasCandidate,
): WikiAliasCandidate {
  assertAliasCandidate(candidate);
  return candidate.quietTurns === MAX_WIKI_LEARNING_QUIET_TURNS
    ? ageWikiAliasCandidate(candidate)
    : freezeAliasCandidate({
        ...candidate,
        quietTurns: candidate.quietTurns + 1,
      });
}

/**
 * True after a settlement until the alias's next comparable human turn. The
 * kept counter returns to zero only by settlement; aging never lands on zero
 * while kept evidence remains, so this cannot be confused with decay.
 */
export function hasWikiKeptSettlementSinceTurn(evidence: WikiKeptEvidence): boolean {
  assertKeptEvidence(evidence);
  return evidence.kept > 0 && evidence.keptQuietTurns === 0;
}

/** Adds one settlement's units and restarts the kept half-life. */
export function settleWikiKeptEvidence(
  evidence: WikiKeptEvidence,
  units: number,
): WikiKeptEvidence {
  assertKeptEvidence(evidence);
  if (!Number.isSafeInteger(units) || units < 1 ||
      units > WIKI_OCCURRENCE_OUTCOME_POLICY.maximumKeptUnits) {
    throw new RangeError("kept units are invalid");
  }
  return Object.freeze({
    kept: Math.min(WIKI_OCCURRENCE_OUTCOME_POLICY.maximumKeptUnits, evidence.kept + units),
    keptQuietTurns: 0,
  });
}

/** Advances one comparable human tick; kept halves every half-life. */
export function advanceWikiKeptQuietTurn(evidence: WikiKeptEvidence): WikiKeptEvidence {
  assertKeptEvidence(evidence);
  if (evidence.kept === 0) return EMPTY_KEPT;
  const keptQuietTurns = evidence.keptQuietTurns + 1;
  if (keptQuietTurns % WIKI_OCCURRENCE_OUTCOME_POLICY.keptHalfLifeTurns !== 0) {
    return Object.freeze({ kept: evidence.kept, keptQuietTurns });
  }
  const kept = Math.floor(evidence.kept / 2);
  return kept === 0 ? EMPTY_KEPT : Object.freeze({ kept, keptQuietTurns });
}

/** Advances one strike by one comparable human turn; null when it expires. */
export function advanceWikiRevertStrikeTurn(quietTurns: number): number | null {
  if (!Number.isSafeInteger(quietTurns) || quietTurns < 0 ||
      quietTurns > MAX_WIKI_REVERT_STRIKE_QUIET_TURNS) {
    throw new RangeError("strike quietTurns is outside its bounded range");
  }
  return quietTurns === MAX_WIKI_REVERT_STRIKE_QUIET_TURNS ? null : quietTurns + 1;
}

/**
 * Resolves one ambiguity set. Competitors are immediate counter-evidence.
 * A release must explicitly qualify a producer; presence in the weight table
 * alone never grants activation authority. An active relation keeps authority
 * while its retention score (producer evidence plus informed acceptance)
 * clears the retention floor and leads every rival's retention score by the
 * retention margin. Otherwise candidates are ranked, and the activation floor
 * and margin are measured, on producer relation scores alone, so informed
 * acceptance can retain and defend a rule in use but can never activate one.
 * Corrupt multi-active input fails closed for this resolution rather than
 * borrowing a retention threshold.
 */
export function resolveWikiAliasCompetition(
  candidates: readonly WikiAliasCandidate[],
  releaseQualifiedProducers: WikiAliasReleaseQualification,
): readonly WikiAliasCandidate[] {
  assertCandidateCollection(candidates);
  assertReleaseQualification(releaseQualifiedProducers);

  const activeCount = candidates.filter((candidate) =>
    candidate.phase === "active"
  ).length;
  if (activeCount > 1 || findDuplicatedCandidateIds(candidates).size > 0) {
    return demoteAndFreezeAliasCandidates(candidates);
  }

  const eligible = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      relationScore: scoreWikiAliasCandidate(candidate),
      retentionScore: scoreWikiAliasRetention(candidate),
    }))
    .filter(({ candidate, relationScore }) =>
      relationScore > 0 && releaseQualifiedProducers.has(candidate.producer)
    );

  if (eligible.length === 0) return demoteAndFreezeAliasCandidates(candidates);

  let winningIndex = -1;
  const incumbent = eligible.find(({ candidate }) => candidate.phase === "active");
  if (incumbent !== undefined) {
    const strongestRival = Math.max(0, ...eligible
      .filter((entry) => entry !== incumbent)
      .map((entry) => entry.retentionScore));
    if (incumbent.retentionScore >= WIKI_ALIAS_SCORE_POLICY.retentionScore &&
        incumbent.retentionScore - strongestRival >=
          WIKI_ALIAS_SCORE_POLICY.retentionMargin) {
      winningIndex = incumbent.index;
    }
  }
  if (winningIndex === -1) {
    const ranked = [...eligible].sort((left, right) =>
      right.relationScore - left.relationScore ||
      compareWikiAliasProducerPrecedence(left.candidate.producer, right.candidate.producer) ||
      compareCodeUnits(left.candidate.candidateId, right.candidate.candidateId));
    const leader = ranked[0]!;
    const margin = leader.relationScore - (ranked[1]?.relationScore ?? 0);
    if (leader.relationScore >= WIKI_ALIAS_SCORE_POLICY.activationScore &&
        margin >= WIKI_ALIAS_SCORE_POLICY.activationMargin) {
      winningIndex = leader.index;
    }
  }

  return freezeAliasCandidates(candidates.map((candidate, index) => ({
    ...candidate,
    phase: index === winningIndex ? "active" as const : "candidate" as const,
  })));
}

export function isWikiAliasCandidateEvictable(
  candidate: WikiAliasCandidate,
): boolean {
  assertAliasCandidate(candidate);
  return candidate.phase === "candidate" && candidate.support === 0;
}

/**
 * A full reservoir never refuses a newcomer while an independent row can
 * leave: learning must stay live after a person changes locale, script, or
 * vocabulary, even though absent rows in another context never age. The
 * caller evicts the weakest independent row first; with none it drops the
 * newcomer.
 */
export function decideWikiSoftCandidateAdmission(
  candidateExists: boolean,
  currentCandidateCount: number,
  capacity: number = MAX_WIKI_LEARNING_CANDIDATES,
): WikiSoftCandidateAdmission {
  assertReplayBounds(
    currentCandidateCount,
    "currentCandidateCount",
    MAX_WIKI_LEARNING_CANDIDATES,
  );
  assertCandidateCapacity(capacity);
  if (candidateExists) return "update";
  return currentCandidateCount < capacity ? "insert" : "evict";
}

/**
 * Orders independent soft evidence weakest first: candidates before
 * established rows, lower support, longer quiet, then code-unit identity.
 */
export function compareWikiEvictionOrder(
  left: WikiEvictionCandidate,
  right: WikiEvictionCandidate,
): number {
  return Number(left.established) - Number(right.established) ||
    left.support - right.support ||
    right.quietTurns - left.quietTurns ||
    compareCodeUnits(left.identity, right.identity);
}

/**
 * Applies one committed human term turn through the only bounded safe entry.
 * A canonical identifier contributes at most once per tick.
 */
export function applyWikiTermLearningTick(
  initialCandidates: readonly WikiTermCandidate[],
  observedCanonicalIds: readonly string[],
  capacity: number = MAX_WIKI_LEARNING_CANDIDATES,
): WikiTermLearningTick {
  assertTermCandidateCollection(initialCandidates);
  assertReplayObservations(observedCanonicalIds, "observedCanonicalIds");
  assertCandidateCapacity(capacity);

  const observedIds = new Set(observedCanonicalIds);
  const pendingIds = new Set(observedCanonicalIds);
  let admittedObservationCount = 0;
  let candidates = initialCandidates.map((candidate) => {
    const observed = pendingIds.has(candidate.canonicalId);
    pendingIds.delete(candidate.canonicalId);
    if (observed) {
      admittedObservationCount += 1;
      return freezeTermCandidate({
        ...candidate,
        ...observeWikiTermEvidence(candidate),
      });
    }
    return freezeTermCandidate({
      ...candidate,
      ...advanceWikiTermQuietTurn(candidate),
    });
  });

  for (const canonicalId of pendingIds) {
    const admission = decideWikiSoftCandidateAdmission(
      false,
      candidates.length,
      capacity,
    );
    if (admission === "evict") {
      // Rows observed in this turn are never the victims of its own newcomers.
      const victim = candidates
        .filter((candidate) => !observedIds.has(candidate.canonicalId))
        .sort((left, right) => compareWikiEvictionOrder(
          termEvictionCandidate(left),
          termEvictionCandidate(right),
        ))[0];
      if (victim === undefined) continue;
      candidates = candidates.filter((candidate) => candidate !== victim);
    }
    candidates.push(freezeTermCandidate({
      canonicalId,
      ...observeWikiTermEvidence({ phase: "candidate", support: 0, quietTurns: 0 }),
    }));
    admittedObservationCount += 1;
  }

  candidates = candidates.map((candidate) => freezeTermCandidate({
    ...candidate,
    ...reconcileWikiTermEvidence(candidate),
  }));

  return Object.freeze({
    candidates: Object.freeze(candidates),
    admittedObservationCount,
    ignoredObservationCount: observedCanonicalIds.length - admittedObservationCount,
  });
}

export function replayWikiTermLearning(
  initialCandidates: readonly WikiTermCandidate[],
  steps: readonly WikiTermLearningReplayStep[],
  capacity: number = MAX_WIKI_LEARNING_CANDIDATES,
): WikiTermLearningReplay {
  assertTermCandidateCollection(initialCandidates);
  assertReplayBounds(steps.length, "steps");
  assertCandidateCapacity(capacity);

  let candidates = initialCandidates.map((candidate) => freezeTermCandidate({
    ...candidate,
    ...reconcileWikiTermEvidence(candidate),
  }));
  const receipts: WikiTermLearningReplayReceipt[] = [];

  for (const step of steps) {
    assertReplayEnvironment(step.environment);
    assertReplayObservations(step.observedCanonicalIds, "observedCanonicalIds");
    if (step.environment !== "human-admission") {
      receipts.push(Object.freeze({
        environment: step.environment,
        admittedObservationCount: 0,
        ignoredObservationCount: step.observedCanonicalIds.length,
        collectedCanonicalIds: Object.freeze([]),
      }));
      continue;
    }

    const tick = applyWikiTermLearningTick(
      candidates,
      step.observedCanonicalIds,
      capacity,
    );
    candidates = [...tick.candidates];
    receipts.push(Object.freeze({
      environment: step.environment,
      admittedObservationCount: tick.admittedObservationCount,
      ignoredObservationCount: tick.ignoredObservationCount,
      collectedCanonicalIds: Object.freeze(candidates
        .filter((candidate) => candidate.phase === "collected")
        .map((candidate) => candidate.canonicalId)),
    }));
  }

  return Object.freeze({
    policyVersion: WIKI_LEARNING_POLICY_VERSION,
    candidates: Object.freeze(candidates.map(freezeTermCandidate)),
    receipts: Object.freeze(receipts),
  });
}

/** Replays one ambiguity set in which every human step is comparable. */
export function replayWikiAliasLearning(
  initialCandidates: readonly WikiAliasCandidate[],
  steps: readonly WikiAliasLearningReplayStep[],
  releaseQualifiedProducers: WikiAliasReleaseQualification,
): WikiAliasLearningReplay {
  assertCandidateCollection(initialCandidates);
  assertReleaseQualification(releaseQualifiedProducers);
  assertReplayBounds(steps.length, "steps");

  let candidates = [...resolveWikiAliasCompetition(
    initialCandidates,
    releaseQualifiedProducers,
  )];
  const receipts: WikiAliasLearningReplayReceipt[] = [];

  for (const step of steps) {
    assertReplayEnvironment(step.environment);
    assertReplayObservations(step.observedCandidateIds, "observedCandidateIds");
    if (step.environment !== "human-admission") {
      receipts.push(Object.freeze({
        environment: step.environment,
        admittedObservationCount: 0,
        ignoredObservationCount: step.observedCandidateIds.length,
        activeCandidateId: activeCandidateId(candidates),
      }));
      continue;
    }

    const uniqueIds = new Set(step.observedCandidateIds);
    const duplicatedCandidateIds = findDuplicatedCandidateIds(candidates);
    let admittedObservationCount = 0;
    candidates = candidates.map((candidate) => {
      const kept = advanceWikiKeptQuietTurn(candidate);
      if (!uniqueIds.has(candidate.candidateId) ||
        duplicatedCandidateIds.has(candidate.candidateId)) {
        return freezeAliasCandidate({ ...advanceWikiAliasQuietTurn(candidate), ...kept });
      }
      admittedObservationCount += 1;
      return freezeAliasCandidate({ ...observeWikiAliasCandidate(candidate), ...kept });
    });
    candidates = [...resolveWikiAliasCompetition(
      candidates,
      releaseQualifiedProducers,
    )];
    receipts.push(Object.freeze({
      environment: step.environment,
      admittedObservationCount,
      ignoredObservationCount: step.observedCandidateIds.length -
        admittedObservationCount,
      activeCandidateId: activeCandidateId(candidates),
    }));
  }

  return Object.freeze({
    policyVersion: WIKI_LEARNING_POLICY_VERSION,
    candidates: Object.freeze(candidates.map(freezeAliasCandidate)),
    receipts: Object.freeze(receipts),
  });
}

export function evaluateWikiLearningCorpus(
  corpusId: string,
  cases: readonly WikiLearningCorpusCase[],
): WikiLearningCorpusEvaluation {
  assertIdentifier(corpusId, "corpusId");
  assertReplayBounds(cases.length, "cases");
  let correctApplications = 0;
  let falseApplications = 0;
  let missedApplications = 0;
  let protectedOrGeneratedApplications = 0;
  let activationLatencyTurns = 0;
  let demotionLatencyTurns = 0;
  let phaseTransitions = 0;
  const caseIds = new Set<string>();
  const caseSignatures: string[] = [];

  for (const item of cases) {
    assertEvaluationCase(item);
    if (caseIds.has(item.caseId)) {
      throw new TypeError("learning corpus case ids must be unique");
    }
    caseIds.add(item.caseId);
    caseSignatures.push(JSON.stringify({
      caseId: item.caseId,
      expectedActionId: item.expectedActionId,
      protectedOrGenerated: item.protectedOrGenerated === true,
    }));
    activationLatencyTurns += item.activationLatencyTurns ?? 0;
    demotionLatencyTurns += item.demotionLatencyTurns ?? 0;
    phaseTransitions += item.phaseTransitions ?? 0;

    if (item.protectedOrGenerated && item.appliedActionId !== null) {
      protectedOrGeneratedApplications += 1;
      falseApplications += 1;
      continue;
    }
    if (item.appliedActionId === item.expectedActionId &&
      item.appliedActionId !== null) {
      correctApplications += 1;
    } else if (item.appliedActionId !== null) {
      falseApplications += 1;
    } else if (item.expectedActionId !== null) {
      missedApplications += 1;
    }
  }

  const score: WikiLearningCorpusScore = Object.freeze([
    negateCount(falseApplications),
    negateCount(protectedOrGeneratedApplications),
    negateCount(missedApplications),
    correctApplications,
    negateCount(activationLatencyTurns),
    negateCount(demotionLatencyTurns),
    negateCount(phaseTransitions),
  ]);
  return Object.freeze({
    corpusId,
    caseIds: Object.freeze([...caseIds].sort(compareCodeUnits)),
    caseSignatures: Object.freeze(caseSignatures.sort(compareCodeUnits)),
    caseCount: cases.length,
    correctApplications,
    falseApplications,
    missedApplications,
    protectedOrGeneratedApplications,
    activationLatencyTurns,
    demotionLatencyTurns,
    phaseTransitions,
    score,
  });
}

/** Compares only evaluations from the same frozen opportunity set. */
export function compareWikiLearningCorpusEvaluations(
  left: WikiLearningCorpusEvaluation,
  right: WikiLearningCorpusEvaluation,
): -1 | 0 | 1 {
  if (left.corpusId !== right.corpusId ||
      left.caseSignatures.length !== right.caseSignatures.length ||
      left.caseSignatures.some((signature, index) =>
        signature !== right.caseSignatures[index])) {
    throw new TypeError("learning corpus evaluations must share one frozen case set");
  }
  for (let index = 0; index < left.score.length; index += 1) {
    if (left.score[index] > right.score[index]) return 1;
    if (left.score[index] < right.score[index]) return -1;
  }
  return 0;
}

/**
 * Evaluates a fixed, labelled interaction corpus one terminal occurrence at a
 * time. Censoring is neutral and reported with its denominator, so evaluation
 * cannot improve by manufacturing attribution or by counting an uninformed
 * exposure as either acceptance or rejection.
 */
export function evaluateWikiLearningInteractions(
  outcomes: readonly WikiLearningInteractionCase[],
  policy: WikiLearningInteractionPolicy = WIKI_OCCURRENCE_OUTCOME_POLICY,
): WikiLearningInteractionEvaluation {
  assertReplayBounds(outcomes.length, "outcomes");
  if (typeof policy?.countGeneratedImplicitAcceptance !== "boolean") {
    throw new TypeError("interaction policy is invalid");
  }
  let explicitAcceptances = 0;
  let inspectedAcceptances = 0;
  let explicitRejections = 0;
  let implicitAcceptances = 0;
  let censoredOutcomes = 0;
  let eligibleCensoredOutcomes = 0;
  let unsafeOutcomes = 0;
  let unattributedOutcomes = 0;
  let generatedExcludedOutcomes = 0;
  let falseImplicitPositives = 0;
  let incorrectExplicitDecisions = 0;
  let decisionLatencyTurns = 0;
  const occurrenceIds = new Set<string>();

  for (const outcome of outcomes) {
    assertInteractionOutcome(outcome);
    if (occurrenceIds.has(outcome.occurrenceId)) {
      throw new TypeError("interaction occurrence must settle exactly once");
    }
    occurrenceIds.add(outcome.occurrenceId);

    const terminal = outcome.terminalOutcome;
    const isCensored = terminal === "censored";
    const isImplicit = terminal === "accepted-implicit";
    const isAcceptance = terminal === "explicit-confirm" || terminal === "inspected-kept";
    const isRejection = terminal === "explicit-reject" ||
      terminal === "explicit-replace" || terminal === "reverted";
    if (outcome.environment === "protected-text") {
      if (isCensored) censoredOutcomes += 1;
      else unsafeOutcomes += 1;
      continue;
    }
    if (outcome.environment === "generated-output" &&
        !policy.countGeneratedImplicitAcceptance && (isImplicit || isCensored)) {
      generatedExcludedOutcomes += 1;
      if (isCensored) censoredOutcomes += 1;
      continue;
    }
    if (outcome.attribution !== "exact-occurrence") {
      unattributedOutcomes += 1;
      if (isCensored) censoredOutcomes += 1;
      else unsafeOutcomes += 1;
      continue;
    }

    if (isAcceptance || isRejection) {
      decisionLatencyTurns += outcome.decisionLatencyTurns ?? 0;
      if (isAcceptance) {
        if (terminal === "inspected-kept") inspectedAcceptances += 1;
        else explicitAcceptances += 1;
        if (outcome.expectedDisposition === "rejected") {
          incorrectExplicitDecisions += 1;
        }
      } else {
        explicitRejections += 1;
        if (outcome.expectedDisposition === "accepted") {
          incorrectExplicitDecisions += 1;
        }
      }
      continue;
    }
    if (isCensored) {
      censoredOutcomes += 1;
      eligibleCensoredOutcomes += 1;
      continue;
    }
    implicitAcceptances += 1;
    if (outcome.expectedDisposition === "rejected") {
      falseImplicitPositives += 1;
    }
  }

  const explicitDecisionCount = explicitAcceptances + inspectedAcceptances +
    explicitRejections;
  const implicitOpportunityCount = implicitAcceptances + eligibleCensoredOutcomes;
  return Object.freeze({
    outcomeCount: outcomes.length,
    explicitAcceptances,
    inspectedAcceptances,
    explicitRejections,
    implicitAcceptances,
    censoredOutcomes,
    eligibleCensoredOutcomes,
    unsafeOutcomes,
    unattributedOutcomes,
    generatedExcludedOutcomes,
    implicitExposureCount: implicitOpportunityCount,
    falseImplicitPositives,
    incorrectExplicitDecisions,
    decisionLatencyTurns,
    explicitRejectRate: freezeRate(explicitRejections, explicitDecisionCount),
    censorRate: freezeRate(eligibleCensoredOutcomes, implicitOpportunityCount),
  });
}

const EMPTY_KEPT: WikiKeptEvidence = Object.freeze({ kept: 0, keptQuietTurns: 0 });
const EFFECT_NEUTRAL: WikiOccurrenceEffect = Object.freeze({ kind: "neutral" });
const EFFECT_STRIKE: WikiOccurrenceEffect = Object.freeze({ kind: "strike" });
const EFFECT_CONFIRM: WikiOccurrenceEffect = Object.freeze({ kind: "confirm" });
const EFFECT_REJECT: WikiOccurrenceEffect = Object.freeze({ kind: "reject" });
const EFFECT_REPLACE: WikiOccurrenceEffect = Object.freeze({ kind: "replace" });

function halvingsToZero(value: number): number {
  let remaining = value;
  let halvings = 0;
  while (remaining > 0) {
    remaining = Math.floor(remaining / 2);
    halvings += 1;
  }
  return halvings;
}

function termEvictionCandidate(candidate: WikiTermCandidate): WikiEvictionCandidate {
  return {
    established: candidate.phase === "collected",
    support: candidate.support,
    quietTurns: candidate.quietTurns,
    identity: candidate.canonicalId,
  };
}

function activeCandidateId(
  candidates: readonly WikiAliasCandidate[],
): string | null {
  return candidates.find((candidate) => candidate.phase === "active")
    ?.candidateId ?? null;
}

function assertTermEvidence(evidence: WikiTermEvidence): void {
  if (evidence.phase !== "candidate" && evidence.phase !== "collected") {
    throw new TypeError("term phase is invalid");
  }
  assertUnits(evidence.support, "term support");
  assertQuietTurns(evidence.quietTurns);
}

function assertKeptEvidence(evidence: WikiKeptEvidence): void {
  if (!isWikiKeptEvidence(evidence)) throw new RangeError("kept evidence is invalid");
}

function assertAliasCandidate(candidate: WikiAliasCandidate): void {
  assertIdentifier(candidate.candidateId, "candidateId");
  if (!Object.hasOwn(WIKI_ALIAS_PRODUCER_WEIGHTS, candidate.producer)) {
    throw new TypeError("alias producer is invalid");
  }
  if (candidate.phase !== "candidate" && candidate.phase !== "active") {
    throw new TypeError("alias phase is invalid");
  }
  assertUnits(candidate.support, "alias support");
  assertQuietTurns(candidate.quietTurns);
  assertKeptEvidence(candidate);
}

function assertCandidateCollection(
  candidates: readonly WikiAliasCandidate[],
): void {
  assertReplayBounds(candidates.length, "candidates", MAX_WIKI_LEARNING_CANDIDATES);
  for (const candidate of candidates) assertAliasCandidate(candidate);
}

function assertTermCandidateCollection(
  candidates: readonly WikiTermCandidate[],
): void {
  assertReplayBounds(candidates.length, "candidates", MAX_WIKI_LEARNING_CANDIDATES);
  const canonicalIds = new Set<string>();
  for (const candidate of candidates) {
    assertIdentifier(candidate.canonicalId, "canonicalId");
    assertTermEvidence(candidate);
    if (canonicalIds.has(candidate.canonicalId)) {
      throw new TypeError("term candidate identity must be unique");
    }
    canonicalIds.add(candidate.canonicalId);
  }
}

function assertReleaseQualification(
  qualification: WikiAliasReleaseQualification,
): void {
  if (typeof qualification?.has !== "function") {
    throw new TypeError("release qualification must be an explicit producer set");
  }
}

function assertReplayEnvironment(
  environment: WikiLearningReplayEnvironment,
): void {
  if (environment !== "human-admission" &&
    environment !== "generated-output" && environment !== "protected-text") {
    throw new TypeError("replay environment is invalid");
  }
}

function assertReplayObservations(
  observations: readonly string[],
  label: string,
): void {
  if (!Array.isArray(observations) ||
    observations.length > MAX_WIKI_LEARNING_REPLAY_OBSERVATIONS_PER_STEP) {
    throw new RangeError(`${label} exceeds its bounded batch`);
  }
  for (const observation of observations) assertIdentifier(observation, label);
}

function assertImplicitSettlementFacts(facts: WikiImplicitSettlementFacts): void {
  if (typeof facts !== "object" || facts === null ||
      typeof facts.perceived !== "boolean" ||
      typeof facts.addressIntact !== "boolean" ||
      typeof facts.copiedOrExported !== "boolean" ||
      typeof facts.pageExit !== "boolean") {
    throw new TypeError("implicit settlement facts are invalid");
  }
  assertBoundedInteger(facts.furtherHumanAdmissions, "furtherHumanAdmissions");
  assertBoundedInteger(facts.foregroundDwellMilliseconds, "foregroundDwellMilliseconds");
}

function assertEvaluationCase(item: WikiLearningCorpusCase): void {
  assertIdentifier(item.caseId, "caseId");
  if (item.expectedActionId !== null) {
    assertIdentifier(item.expectedActionId, "expectedActionId");
  }
  if (item.appliedActionId !== null) {
    assertIdentifier(item.appliedActionId, "appliedActionId");
  }
  assertOptionalReplayMetric(item.activationLatencyTurns, "activationLatencyTurns");
  assertOptionalReplayMetric(item.demotionLatencyTurns, "demotionLatencyTurns");
  assertOptionalReplayMetric(item.phaseTransitions, "phaseTransitions");
}

function assertInteractionOutcome(outcome: WikiLearningInteractionCase): void {
  assertIdentifier(outcome.occurrenceId, "occurrenceId");
  if (outcome.attribution !== "exact-occurrence" &&
    outcome.attribution !== "unattributed") {
    throw new TypeError("interaction attribution is invalid");
  }
  if (outcome.environment !== "human-material" &&
    outcome.environment !== "generated-output" &&
    outcome.environment !== "protected-text") {
    throw new TypeError("interaction environment is invalid");
  }
  if (outcome.expectedDisposition !== "accepted" &&
    outcome.expectedDisposition !== "rejected" &&
    outcome.expectedDisposition !== "unknown") {
    throw new TypeError("interaction expected disposition is invalid");
  }
  if (!isWikiOccurrenceOutcome(outcome.terminalOutcome)) {
    throw new TypeError("interaction terminal outcome is invalid");
  }
  assertOptionalReplayMetric(outcome.decisionLatencyTurns, "decisionLatencyTurns");
  const isDecision = outcome.terminalOutcome !== "accepted-implicit" &&
    outcome.terminalOutcome !== "censored";
  if (!isDecision && outcome.decisionLatencyTurns !== undefined) {
    throw new TypeError("only explicit decisions carry decision latency");
  }
}

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0 ||
    [...value].length > MAX_WIKI_LEARNING_CANDIDATE_ID_CODE_POINTS) {
    throw new RangeError(`${label} is outside its bounded identity`);
  }
}

function assertUnits(value: number, label: string): void {
  if (!isWikiLearningUnits(value)) throw new RangeError(`${label} is invalid`);
}

function assertQuietTurns(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 ||
    value > MAX_WIKI_LEARNING_QUIET_TURNS) {
    throw new RangeError("quietTurns is outside its bounded range");
  }
}

function assertCandidateCapacity(value: number): void {
  assertReplayBounds(value, "capacity", MAX_WIKI_LEARNING_CANDIDATES);
}

function assertOptionalReplayMetric(
  value: number | undefined,
  label: string,
): void {
  if (value !== undefined) assertReplayBounds(value, label);
}

function assertBoundedInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertReplayBounds(
  value: number,
  label: string,
  maximum: number = MAX_WIKI_LEARNING_REPLAY_STEPS,
): void {
  assertBoundedInteger(value, label);
  if (value > maximum) throw new RangeError(`${label} exceeds its bound`);
}

function saturatingAdd(value: number, units: number): number {
  return Math.min(MAX_WIKI_LEARNING_UNITS, value + units);
}

function negateCount(value: number): number {
  return value === 0 ? 0 : -value;
}

function freezeRate(numerator: number, denominator: number): WikiLearningRate {
  return Object.freeze({ numerator, denominator });
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function findDuplicatedCandidateIds(
  candidates: readonly WikiAliasCandidate[],
): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) duplicated.add(candidate.candidateId);
    seen.add(candidate.candidateId);
  }
  return duplicated;
}

function demoteAndFreezeAliasCandidates(
  candidates: readonly WikiAliasCandidate[],
): readonly WikiAliasCandidate[] {
  return freezeAliasCandidates(candidates.map((candidate) => ({
    ...candidate,
    phase: "candidate" as const,
  })));
}

function freezeTermEvidence(evidence: WikiTermEvidence): WikiTermEvidence {
  return Object.freeze({ ...evidence });
}

function freezeTermCandidate(candidate: WikiTermCandidate): WikiTermCandidate {
  return Object.freeze({ ...candidate });
}

function freezeAliasCandidate(candidate: WikiAliasCandidate): WikiAliasCandidate {
  return Object.freeze({ ...candidate });
}

function freezeAliasCandidates(
  candidates: readonly WikiAliasCandidate[],
): readonly WikiAliasCandidate[] {
  return Object.freeze(candidates.map(freezeAliasCandidate));
}
