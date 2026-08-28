import { NeutralProviderError } from "./completion-outcome";

/**
 * The one place Matter talks to a model.
 *
 * Five surfaces need a model — repairing a transcript, naming a thought,
 * answering one bounded question, expanding a stretched passage, and swapping
 * one passage's wording — and they are deliberately not five integrations.
 * Each is a *scenario*: an id, a frozen prompt, a budget, and an adjudicator
 * that decides whether the answer may be used at all. `runScenario` is the
 * only function that awaits a provider, so the deadline, the shedding, the
 * backoff, and the refusal to leak a provider's identity are written once.
 *
 * Two rules hold across every scenario, and they are what "the AI is folded in
 * lightly" means in code rather than in a deck:
 *
 * 1. **A model answer is a suggestion.** Every scenario has a floor that is
 *    already correct without a model — the repair request floor, the deterministic
 *    label, a stated unavailability, the passage unchanged — and adjudication
 *    decides whether the suggestion beats the floor. Nothing here can fail in a
 *    way a person has to handle.
 * 2. **A person's material is reference; a person's instruction is bounded.**
 *    Both enter through dedicated tagged constructors, which name and escape
 *    them, and both arrive under a sentence fixing what they may do — the
 *    refusal for material, the bounded grant for an instruction the person
 *    addressed to Matter. This is prompt discipline, not a permission system:
 *    scenario adjudication remains the boundary that decides what may be used.
 */

export type MatterScenarioId =
  | "matter-transcript-repair"
  | "matter-thought-label"
  | "matter-inquiry"
  | "matter-transform"
  | "matter-text-swap";

/**
 * Provider-pool transport facts, deliberately stripped of candidate identity.
 *
 * Completion events describe only whether an anonymous attempt produced usable
 * final text. The relay's raw vocabulary never enters this closed seam.
 */
export type ScenarioCandidateEvent =
  | "pool"
  | "answered"
  | "failed"
  | "stalled"
  | "truncated"
  | "refused"
  | "missing-terminator"
  | "unknown-terminator";

/** What a scenario asks a provider for, once its prompt is compiled. */
export type ScenarioCall = Readonly<{
  scenario: MatterScenarioId;
  prompt: string;
  locale: string;
  /**
   * The scenario's own input, already serialized inside `prompt`. The pool
   * ignores it; only a fixture adapter reads it, so that proving the path does
   * not require parsing a prompt back apart.
   */
  input: unknown;
  /**
   * Milliseconds left before the caller stops reading. An adapter that tries
   * several endpoints needs this to decide whether another attempt can still be
   * delivered; `signal` alone cannot say how long it has.
   */
  deadlineMs: number;
  maxOutputTokens: number;
  /**
   * A server-local scalar seam. Pool adapters report only that a pool was used
   * and how an anonymous candidate attempt settled; no station, model, host,
   * key, prompt, material, or request identity can fit through this type.
   */
  observeCandidate?: (event: ScenarioCandidateEvent) => void;
}>;

export type ScenarioAdapter = (
  call: ScenarioCall,
  signal: AbortSignal,
) => Promise<Readonly<{ text: string }>>;

/**
 * Why a scenario settled on its floor. Every value here means the same thing to
 * the person — nothing changed — and they are distinguished only so a
 * deployment can tell a cold provider from a rejected answer.
 */
export type ScenarioFallback =
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_REJECTED"
  | "MODEL_BUSY";

export type ScenarioVerdict<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; reason: string }>;

export type ScenarioOutcome<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; fallback: ScenarioFallback }>;

export type ScenarioBudget = Readonly<{ deadlineMs: number; maxOutputTokens: number }>;

/**
 * A scenario owns its prompt, its budget, and its judgement of an answer — and
 * nothing else. It never sees transport, credentials, caches, or React.
 */
export type MatterScenario<Input, Value> = Readonly<{
  id: MatterScenarioId;
  /**
   * Bumping this invalidates every cached answer and every peer that declares
   * it, without a schema change.
   */
  promptVersion: string;
  locale: (input: Input) => string;
  compile: (input: Input) => string;
  budget: (input: Input) => ScenarioBudget;
  /**
   * Decides whether the answer may be used. This is where a scenario's real
   * guarantee lives: the prompt raises the share of answers that are what was
   * asked for, and adjudication makes the rest cost nothing.
   */
  adjudicate: (answer: unknown, input: Input) => ScenarioVerdict<Value>;
}>;

export type ScenarioGovernorLimits = Readonly<{
  maxConcurrentModelCalls: number;
  failuresBeforeCooldown: number;
  cooldownMs: number;
}>;

export const DEFAULT_GOVERNOR_LIMITS: ScenarioGovernorLimits = Object.freeze({
  maxConcurrentModelCalls: 4,
  failuresBeforeCooldown: 3,
  cooldownMs: 15_000,
});

/**
 * Process-local health for one scenario. It is a counter, never authority:
 * every replica may hold a different view without changing what a person sees,
 * because the floor is always available.
 */
export class ScenarioGovernor {
  private active = 0;
  private consecutiveFailures = 0;
  private cooldownUntilMs = 0;

  reset(): void {
    this.active = 0;
    this.consecutiveFailures = 0;
    this.cooldownUntilMs = 0;
  }

  /** True while a known-bad provider should not be paid for again. */
  cooling(nowMs: number): boolean {
    return nowMs < this.cooldownUntilMs;
  }

  /**
   * Shedding rather than queueing. A queued call can only spend the browser's
   * remaining deadline, and the person already has an answer that works.
   *
   * Limits arrive per call rather than at construction: one scenario has one
   * governor for the life of the process, so a caller that passes a fresh
   * limits object — a test, a per-deployment override — must not silently get a
   * fresh, empty health counter with it.
   */
  admit(limits: ScenarioGovernorLimits): boolean {
    if (this.active >= limits.maxConcurrentModelCalls) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  succeeded(): void {
    this.consecutiveFailures = 0;
  }

  failed(nowMs: number, limits: ScenarioGovernorLimits): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures < limits.failuresBeforeCooldown) return;
    // Repeated failure is a provider signal, not a per-request one. Backing off
    // stops the next person from paying a full deadline for a known-bad relay.
    this.cooldownUntilMs = nowMs + limits.cooldownMs;
    this.consecutiveFailures = 0;
  }
}

/**
 * Runs one scenario against one adapter. Returns a value or a reason to use the
 * floor; it throws only when the caller's own signal aborts, because that is
 * the single case where nobody is waiting for an answer any more.
 */
export type RunScenarioOptions = Readonly<{
  now?: () => number;
  limits?: ScenarioGovernorLimits;
  /** The request boundary that owns this provider call, when one exists. */
  signal?: AbortSignal;
  /**
   * A deadline the caller must not exceed, whatever the scenario would prefer.
   * The shorter of the two wins: a scenario knows how long its answer takes,
   * but only the caller knows how long anyone is still waiting.
   */
  deadlineCeilingMs?: number;
  /**
   * Optional scenario-policy observer for a settled fallback. Production's
   * content-free terminal performance receipt is owned separately below.
   */
  observe?: (observation: ScenarioObservation) => void;
  /** One content-free terminal performance receipt for a provider-backed call. */
  observePerformance?: (observation: ScenarioPerformanceObservation) => void;
}>;

/**
 * One settled fallback, as the deployment sees it. It carries no material, no
 * prompt, no provider identity, and no credential — only which surface fell
 * back, why, how long it waited, and an optional scenario-owned rejection code.
 */
export type ScenarioObservation = Readonly<{
  scenario: MatterScenarioId;
  reason: ScenarioFallback;
  /** Exact scenario-owned policy code; present only for an adjudicator rejection. */
  rejectionReason?: string;
  elapsedMs: number;
}>;

export type ScenarioPerformanceOutcome =
  | "answered"
  | "unavailable"
  | "timeout"
  | "busy"
  | "rejected";

export type ScenarioPerformanceObservation = Readonly<{
  scenario: MatterScenarioId;
  outcome: ScenarioPerformanceOutcome;
  elapsedMs: number;
  /** `pool` proves the shared pool emitted attempt facts; `unreported` does not guess. */
  candidateTelemetry: "pool" | "unreported";
  candidateAttempts: number;
  candidateTimeouts: number;
  candidateFailures: number;
  /** Attempts refused because the relay said it stopped early. */
  candidateTruncations: number;
  /** Attempts that ended in a guardrail, refusal, tool call, or unknown state. */
  candidateRefusals: number;
  /** Explicit stop vocabulary this build cannot name, for compatibility audits. */
  candidateUnknownTerminators: number;
  /** Accepted compatibility responses whose relay omitted a stop reason. */
  candidateMissingTerminators: number;
}>;

/**
 * Development fallback sink. Production uses the structured performance sink
 * below so one failed invocation never creates two operational log records.
 */
export function recordScenarioFallback(observation: ScenarioObservation): void {
  const rejection = observation.reason === "MODEL_REJECTED" && observation.rejectionReason !== undefined
    ? ` ${observation.rejectionReason}`
    : "";
  console.warn(
    `matter.scenario ${observation.scenario} ${observation.reason}${rejection} ${Math.round(observation.elapsedMs)}ms`,
  );
}

/**
 * The production default is one structured scalar line per provider-backed
 * scenario invocation. Exact durations remain numeric measurements rather than
 * metric labels; every string field is a closed enum. Provider cold/warm is
 * intentionally absent because this process cannot prove provider cache state.
 */
export function recordScenarioPerformance(observation: ScenarioPerformanceObservation): void {
  const receipt = Object.freeze({
    scenario: safeScenarioId(observation.scenario),
    outcome: safePerformanceOutcome(observation.outcome),
    elapsedMs: boundedScalar(observation.elapsedMs, 120_000),
    candidateTelemetry: observation.candidateTelemetry === "pool" ? "pool" : "unreported",
    candidateAttempts: boundedScalar(observation.candidateAttempts, 255),
    candidateTimeouts: boundedScalar(observation.candidateTimeouts, 255),
    candidateFailures: boundedScalar(observation.candidateFailures, 255),
    candidateTruncations: boundedScalar(observation.candidateTruncations, 255),
    candidateRefusals: boundedScalar(observation.candidateRefusals, 255),
    candidateUnknownTerminators: boundedScalar(observation.candidateUnknownTerminators, 255),
    candidateMissingTerminators: boundedScalar(observation.candidateMissingTerminators, 255),
  });
  console.info(`matter.scenario-performance ${JSON.stringify(receipt)}`);
}

export async function runScenario<Input, Value>(
  scenario: MatterScenario<Input, Value>,
  input: Input,
  adapter: ScenarioAdapter | null,
  governor: ScenarioGovernor,
  options: RunScenarioOptions = {},
): Promise<ScenarioOutcome<Value>> {
  const now = options.now ?? Date.now;
  const limits = options.limits ?? DEFAULT_GOVERNOR_LIMITS;
  const startedAtMs = now();
  const observeFallback = options.observe
    ?? (process.env.NODE_ENV === "production" ? undefined : recordScenarioFallback);
  const observePerformance = options.observePerformance
    ?? (process.env.NODE_ENV === "production" ? recordScenarioPerformance : undefined);
  let performanceSettled = false;
  let candidateTelemetry: ScenarioPerformanceObservation["candidateTelemetry"] = "unreported";
  let candidateAttempts = 0;
  let candidateTimeouts = 0;
  let candidateFailures = 0;
  let candidateTruncations = 0;
  let candidateRefusals = 0;
  let candidateUnknownTerminators = 0;
  let candidateMissingTerminators = 0;
  const noteCandidate = (event: ScenarioCandidateEvent): void => {
    if (event === "pool") {
      candidateTelemetry = "pool";
      return;
    }
    // These two modify an attempt rather than ending one. Every other event is
    // exactly one terminal candidate attempt.
    if (event === "unknown-terminator") {
      candidateUnknownTerminators = boundedIncrement(candidateUnknownTerminators);
      return;
    }
    if (event === "missing-terminator") {
      candidateMissingTerminators = boundedIncrement(candidateMissingTerminators);
      return;
    }
    candidateAttempts = boundedIncrement(candidateAttempts);
    if (event === "stalled") candidateTimeouts = boundedIncrement(candidateTimeouts);
    if (event === "failed") candidateFailures = boundedIncrement(candidateFailures);
    if (event === "truncated") candidateTruncations = boundedIncrement(candidateTruncations);
    if (event === "refused") candidateRefusals = boundedIncrement(candidateRefusals);
  };
  const notePerformance = (outcome: ScenarioPerformanceOutcome): void => {
    if (performanceSettled || observePerformance === undefined) return;
    performanceSettled = true;
    const observation = Object.freeze({
      scenario: scenario.id,
      outcome,
      elapsedMs: safeElapsed(now() - startedAtMs),
      candidateTelemetry,
      candidateAttempts,
      candidateTimeouts,
      candidateFailures,
      candidateTruncations,
      candidateRefusals,
      candidateUnknownTerminators,
      candidateMissingTerminators,
    });
    try {
      observePerformance(observation);
    } catch {
      // Metrics are never allowed to change a model floor or accepted answer.
    }
  };
  // Only outcomes that say something about the relay or the governor are
  // recorded. A surface with no adapter is a configuration fact and would
  // otherwise log once per request forever; a caller that walked away is a fact
  // about the caller. Logging either would bury the outage they surround.
  const settle = <T,>(reason: ScenarioFallback, rejectionReason?: string): ScenarioOutcome<T> => {
    const observation = Object.freeze({
      scenario: scenario.id,
      reason,
      ...(reason === "MODEL_REJECTED" && rejectionReason !== undefined ? { rejectionReason } : {}),
      elapsedMs: safeElapsed(now() - startedAtMs),
    });
    if (observeFallback !== undefined) {
      try {
        observeFallback(observation);
      } catch {
        // Policy observation is diagnostic and cannot own scenario settlement.
      }
    }
    notePerformance(performanceOutcome(reason));
    return fallback(reason);
  };
  if (options.signal?.aborted) return fallback("MODEL_UNAVAILABLE");
  if (adapter === null) return fallback("MODEL_UNAVAILABLE");
  if (governor.cooling(now())) return settle("MODEL_UNAVAILABLE");
  if (!governor.admit(limits)) return settle("MODEL_BUSY");

  // The slot is held until the adapter promise itself settles, not until this
  // function returns. The shared pool hard-bounds each candidate and cools a
  // stalled one; transport cleanup beneath that boundary remains best-effort.
  //
  // Everything that can throw before that promise exists — sizing the budget,
  // compiling the prompt, an adapter that rejects synchronously — must give the
  // slot back on the way out. Otherwise one bad input costs the scenario a
  // permanent fraction of its concurrency for the life of the process, and the
  // symptom is every later request answering MODEL_BUSY for no visible reason.
  const deadline = new AbortController();
  const cancel = () => deadline.abort(new DOMException("Aborted", "AbortError"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let boundary: { promise: Promise<never>; dispose: () => void } | undefined;
  let work: Promise<Readonly<{ text: string }>>;
  try {
    const budget = withCeiling(scenario.budget(input), options.deadlineCeilingMs);
    const call: ScenarioCall = Object.freeze({
      scenario: scenario.id,
      prompt: scenario.compile(input),
      locale: scenario.locale(input),
      input,
      deadlineMs: budget.deadlineMs,
      maxOutputTokens: budget.maxOutputTokens,
      observeCandidate: noteCandidate,
    });
    timer = setTimeout(() => deadline.abort(), budget.deadlineMs);
    boundary = rejectOnAbort(deadline.signal);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    work = adapter(call, deadline.signal);
    const release = () => governor.release();
    work.then(release, release);
  } catch {
    governor.release();
    if (timer !== undefined) clearTimeout(timer);
    boundary?.dispose();
    options.signal?.removeEventListener("abort", cancel);
    if (!options.signal?.aborted) governor.failed(now(), limits);
    return options.signal?.aborted ? fallback("MODEL_UNAVAILABLE") : settle("MODEL_UNAVAILABLE");
  }

  try {
    // Aborting is advisory, so the deadline is enforced by racing a boundary
    // that rejects on abort. Without it one provider can hang the route.
    const answer = await Promise.race([work, boundary.promise]);
    const verdict = scenario.adjudicate(answer?.text, input);
    if (!verdict.ok) {
      // A rejection is a fact about this request, not about the relay. The
      // relay answered, inside the deadline, and the adjudicator declined what
      // it said — usually because the bound, the sibling set, or the material
      // made no valid answer available. Counting that toward the cooldown
      // conflates the two things the counter exists to separate: it is here so
      // nobody pays a full deadline for a dead relay, and a rejection costs a
      // fast answer instead. Three refusable requests in a row would otherwise
      // take the whole surface off a live provider for the cooldown, for every
      // person on that instance, while the provider was answering all along.
      governor.succeeded();
      return settle("MODEL_REJECTED", verdict.reason);
    }
    governor.succeeded();
    notePerformance("answered");
    return Object.freeze({ ok: true, value: verdict.value });
  } catch (error) {
    if (options.signal?.aborted) return fallback("MODEL_UNAVAILABLE");
    if (error instanceof NeutralProviderError) {
      // An unusable completion or a pool-owned drain lease is unavailable, not
      // scenario-policy rejection. Both are already bounded below the harness
      // and neither is evidence that the whole surface should enter cooldown.
      return settle("MODEL_UNAVAILABLE");
    }
    governor.failed(now(), limits);
    return settle(deadline.signal.aborted ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    boundary.dispose();
    options.signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Races work against the caller's own abort. Used by every route so that a
 * browser that walked away stops a request rather than settling it.
 */
export async function withRequestSignal<Value>(
  work: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let rejectInterruption!: (error: DOMException) => void;
  const abort = () => rejectInterruption(new DOMException("Aborted", "AbortError"));
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterruption = reject;
  });
  interrupted.catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work, interrupted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function withCeiling(budget: ScenarioBudget, ceilingMs?: number): ScenarioBudget {
  if (ceilingMs === undefined || !Number.isFinite(ceilingMs) || ceilingMs <= 0) return budget;
  return Object.freeze({ ...budget, deadlineMs: Math.min(budget.deadlineMs, ceilingMs) });
}

function fallback<Value>(reason: ScenarioFallback): ScenarioOutcome<Value> {
  return Object.freeze({ ok: false, fallback: reason });
}

function performanceOutcome(reason: ScenarioFallback): ScenarioPerformanceOutcome {
  switch (reason) {
    case "MODEL_TIMEOUT": return "timeout";
    case "MODEL_BUSY": return "busy";
    case "MODEL_REJECTED": return "rejected";
    case "MODEL_UNAVAILABLE": return "unavailable";
  }
}

function safeElapsed(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function boundedIncrement(value: number): number {
  return Math.min(255, value + 1);
}

function boundedScalar(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(value)));
}

function safeScenarioId(value: MatterScenarioId): MatterScenarioId | "unknown" {
  switch (value) {
    case "matter-transcript-repair":
    case "matter-thought-label":
    case "matter-inquiry":
    case "matter-transform":
    case "matter-text-swap":
      return value;
    default:
      return "unknown";
  }
}

function safePerformanceOutcome(
  value: ScenarioPerformanceOutcome,
): ScenarioPerformanceOutcome | "unknown" {
  switch (value) {
    case "answered":
    case "unavailable":
    case "timeout":
    case "busy":
    case "rejected":
      return value;
    default:
      return "unknown";
  }
}

function rejectOnAbort(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let rejectPromise!: (error: DOMException) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  // An unobserved rejection would surface as an unhandled rejection when the
  // provider wins the race, so the boundary is always consumed by `Promise.race`.
  promise.catch(() => undefined);
  const reject = () => rejectPromise(new DOMException("Aborted", "AbortError"));
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return { promise, dispose: () => signal.removeEventListener("abort", reject) };
}
