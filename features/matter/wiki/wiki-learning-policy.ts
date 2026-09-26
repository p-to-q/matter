/**
 * Pure calibration policy for automatic Wiki learning.
 *
 * The policy has no persistence, locale data, runtime feature gate, or human
 * authority. A caller supplies release-qualified producers and committed human
 * observations. Generated and protected material never adds or ages evidence.
 */

export const MAX_WIKI_LEARNING_COUNT = 255;
export const MAX_WIKI_LEARNING_QUIET_TURNS = 31;
export const WIKI_LEARNING_POLICY_VERSION = 3 as const;
export const MAX_WIKI_LEARNING_REPLAY_STEPS = 4_096;
export const MAX_WIKI_LEARNING_CANDIDATES = 5_000;
export const MAX_WIKI_LEARNING_REPLAY_OBSERVATIONS_PER_STEP = 32;
export const MAX_WIKI_LEARNING_CANDIDATE_ID_CODE_POINTS = 512;

export const WIKI_TERM_SCORE_POLICY = Object.freeze({
  collectionSupport: 2,
  retentionSupport: 1,
});

export const WIKI_ALIAS_SCORE_POLICY = Object.freeze({
  activationScore: 8,
  retentionScore: 5,
  activationMargin: 4,
  retentionMargin: 3,
});

export type WikiAliasEvidenceProducer =
  | "legacy-v1"
  | "latin-internal-edit-v2"
  | "en-exact-homophone-v1"
  | "zh-exact-homophone-v1"
  | "zh-final-pair-v1";

export const WIKI_ALIAS_PRODUCER_WEIGHTS: Readonly<
  Record<WikiAliasEvidenceProducer, number>
> = Object.freeze({
  "legacy-v1": 0,
  "latin-internal-edit-v2": 2,
  "en-exact-homophone-v1": 3,
  "zh-exact-homophone-v1": 3,
  "zh-final-pair-v1": 2,
});

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

export type WikiAliasCandidate = Readonly<{
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

export type WikiSoftCandidateAdmission = "insert" | "update" | "drop";

export type WikiLearningEvaluationCase = Readonly<{
  expectedActionId: string | null;
  appliedActionId: string | null;
  protectedOrGenerated?: boolean;
  activationLatencyTurns?: number;
  demotionLatencyTurns?: number;
  phaseTransitions?: number;
}>;

export type WikiLearningReward = readonly [
  negativeFalseApplications: number,
  negativeProtectedApplications: number,
  correctApplications: number,
  negativeActivationLatency: number,
  negativeDemotionLatency: number,
  negativePhaseTransitions: number,
];

export type WikiLearningEvaluation = Readonly<{
  caseCount: number;
  correctApplications: number;
  falseApplications: number;
  missedApplications: number;
  protectedOrGeneratedApplications: number;
  activationLatencyTurns: number;
  demotionLatencyTurns: number;
  phaseTransitions: number;
  reward: WikiLearningReward;
}>;

export function isWikiLearningCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_WIKI_LEARNING_COUNT;
}

export function scoreWikiTermEvidence(evidence: WikiTermEvidence): number {
  assertTermEvidence(evidence);
  return evidence.support;
}

/** An observation wins over pending quiet-time decay on the same human tick. */
export function observeWikiTermEvidence(
  evidence: WikiTermEvidence,
): WikiTermEvidence {
  assertTermEvidence(evidence);
  return freezeTermEvidence({
    ...evidence,
    support: saturatingIncrement(evidence.support),
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

/** Advances one successful human tick on which this term was not observed. */
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

export function scoreWikiAliasCandidate(candidate: WikiAliasCandidate): number {
  assertAliasCandidate(candidate);
  return WIKI_ALIAS_PRODUCER_WEIGHTS[candidate.producer] * candidate.support;
}

/** An observation wins over pending quiet-time decay on the same human tick. */
export function observeWikiAliasCandidate(
  candidate: WikiAliasCandidate,
): WikiAliasCandidate {
  assertAliasCandidate(candidate);
  return freezeAliasCandidate({
    ...candidate,
    support: saturatingIncrement(candidate.support),
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

/** Advances one successful human tick on which this alias was not observed. */
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
 * Resolves one ambiguity set. Competitors are immediate counter-evidence.
 * A release must explicitly qualify a producer; presence in the weight table
 * alone never grants activation authority. Corrupt multi-active input fails
 * closed for this resolution rather than borrowing a retention threshold.
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
      score: scoreWikiAliasCandidate(candidate),
    }))
    .filter(({ candidate, score }) =>
      score > 0 && releaseQualifiedProducers.has(candidate.producer)
    )
    .sort((left, right) =>
      right.score - left.score ||
      left.candidate.candidateId.localeCompare(right.candidate.candidateId)
    );

  if (eligible.length === 0) return demoteAndFreezeAliasCandidates(candidates);

  const leader = eligible[0];
  const runnerUpScore = eligible[1]?.score ?? 0;
  const margin = leader.score - runnerUpScore;
  const isRetaining = leader.candidate.phase === "active";
  const minimumScore = isRetaining
    ? WIKI_ALIAS_SCORE_POLICY.retentionScore
    : WIKI_ALIAS_SCORE_POLICY.activationScore;
  const minimumMargin = isRetaining
    ? WIKI_ALIAS_SCORE_POLICY.retentionMargin
    : WIKI_ALIAS_SCORE_POLICY.activationMargin;
  const winningIndex = leader.score >= minimumScore && margin >= minimumMargin
    ? leader.index
    : -1;

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
  if (currentCandidateCount > capacity) return "drop";
  if (candidateExists) return "update";
  return currentCandidateCount < capacity ? "insert" : "drop";
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

  const pendingIds = new Set(observedCanonicalIds);
  let admittedObservationCount = 0;
  let candidates = initialCandidates.map((candidate) => {
    const observed = pendingIds.has(candidate.canonicalId);
    pendingIds.delete(candidate.canonicalId);
    if (observed && decideWikiSoftCandidateAdmission(
      true,
      initialCandidates.length,
      capacity,
    ) === "update") {
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
    if (decideWikiSoftCandidateAdmission(
      false,
      candidates.length,
      capacity,
    ) !== "insert") continue;
    candidates.push(freezeTermCandidate({
      canonicalId,
      phase: "candidate",
      support: 1,
      quietTurns: 0,
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
      if (!uniqueIds.has(candidate.candidateId) ||
        duplicatedCandidateIds.has(candidate.candidateId)) {
        return advanceWikiAliasQuietTurn(candidate);
      }
      admittedObservationCount += 1;
      return observeWikiAliasCandidate(candidate);
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

export function evaluateWikiLearning(
  cases: readonly WikiLearningEvaluationCase[],
): WikiLearningEvaluation {
  assertReplayBounds(cases.length, "cases");
  let correctApplications = 0;
  let falseApplications = 0;
  let missedApplications = 0;
  let protectedOrGeneratedApplications = 0;
  let activationLatencyTurns = 0;
  let demotionLatencyTurns = 0;
  let phaseTransitions = 0;

  for (const item of cases) {
    assertEvaluationCase(item);
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

  const reward: WikiLearningReward = Object.freeze([
    negateCount(falseApplications),
    negateCount(protectedOrGeneratedApplications),
    correctApplications,
    negateCount(activationLatencyTurns),
    negateCount(demotionLatencyTurns),
    negateCount(phaseTransitions),
  ]);
  return Object.freeze({
    caseCount: cases.length,
    correctApplications,
    falseApplications,
    missedApplications,
    protectedOrGeneratedApplications,
    activationLatencyTurns,
    demotionLatencyTurns,
    phaseTransitions,
    reward,
  });
}

/** Lexicographic comparison keeps safety ahead of recall and latency. */
export function compareWikiLearningReward(
  left: WikiLearningReward,
  right: WikiLearningReward,
): -1 | 0 | 1 {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
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
  assertCount(evidence.support, "term support");
  assertQuietTurns(evidence.quietTurns);
}

function assertAliasCandidate(candidate: WikiAliasCandidate): void {
  assertIdentifier(candidate.candidateId, "candidateId");
  if (!(candidate.producer in WIKI_ALIAS_PRODUCER_WEIGHTS)) {
    throw new TypeError("alias producer is invalid");
  }
  if (candidate.phase !== "candidate" && candidate.phase !== "active") {
    throw new TypeError("alias phase is invalid");
  }
  assertCount(candidate.support, "alias support");
  assertQuietTurns(candidate.quietTurns);
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

function assertEvaluationCase(item: WikiLearningEvaluationCase): void {
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

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0 ||
    [...value].length > MAX_WIKI_LEARNING_CANDIDATE_ID_CODE_POINTS) {
    throw new RangeError(`${label} is outside its bounded identity`);
  }
}

function assertCount(value: number, label: string): void {
  if (!isWikiLearningCount(value)) throw new RangeError(`${label} is invalid`);
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

function saturatingIncrement(value: number): number {
  return Math.min(MAX_WIKI_LEARNING_COUNT, value + 1);
}

function negateCount(value: number): number {
  return value === 0 ? 0 : -value;
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
