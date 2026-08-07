/**
 * The one place Matter talks to a model.
 *
 * Four surfaces need a model — repairing a transcript, naming a thought,
 * answering one bounded question, and transforming a stretched passage — and
 * they are deliberately not four integrations. Each is a *scenario*: an id, a
 * frozen prompt, a budget, and an adjudicator that decides whether the answer
 * may be used at all. `runScenario` is the only function that awaits a
 * provider, so the deadline, the shedding, the backoff, and the refusal to leak
 * a provider's identity are written once rather than four times.
 *
 * Two rules hold across every scenario, and they are what "the AI is folded in
 * lightly" means in code rather than in a deck:
 *
 * 1. **A model answer is a suggestion.** Every scenario has a floor that is
 *    already correct without a model — the words as heard, the deterministic
 *    label, a stated unavailability, the passage unchanged — and adjudication
 *    decides whether the suggestion beats the floor. Nothing here can fail in a
 *    way a person has to handle.
 * 2. **A person's material is reference, never instruction.** It enters a
 *    prompt only through `fence`, which names it, escapes it, and carries the
 *    refusal sentence with it. A scenario cannot forget the line, because the
 *    scenario does not write it.
 */

export type MatterScenarioId =
  | "matter-transcript-repair"
  | "matter-thought-label"
  | "matter-inquiry"
  | "matter-transform";

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
}>;

export async function runScenario<Input, Value>(
  scenario: MatterScenario<Input, Value>,
  input: Input,
  adapter: ScenarioAdapter | null,
  governor: ScenarioGovernor,
  options: RunScenarioOptions = {},
): Promise<ScenarioOutcome<Value>> {
  const now = options.now ?? Date.now;
  const limits = options.limits ?? DEFAULT_GOVERNOR_LIMITS;
  if (options.signal?.aborted) return fallback("MODEL_UNAVAILABLE");
  if (adapter === null) return fallback("MODEL_UNAVAILABLE");
  if (governor.cooling(now())) return fallback("MODEL_UNAVAILABLE");
  if (!governor.admit(limits)) return fallback("MODEL_BUSY");

  // The slot is held until the provider promise itself settles, not until this
  // function returns. A provider that ignores the abort keeps its slot, so
  // repeated timeouts can never amplify real concurrency past the limit.
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
    return fallback("MODEL_UNAVAILABLE");
  }

  try {
    // Aborting is advisory, so the deadline is enforced by racing a boundary
    // that rejects on abort. Without it one provider can hang the route.
    const answer = await Promise.race([work, boundary.promise]);
    const verdict = scenario.adjudicate(answer?.text, input);
    if (!verdict.ok) {
      governor.failed(now(), limits);
      return fallback("MODEL_REJECTED");
    }
    governor.succeeded();
    return Object.freeze({ ok: true, value: verdict.value });
  } catch {
    // An adjudicator that throws is a defect, not a provider failure, but it
    // reaches the person the same way: the floor. Distinguishing them here
    // would only add a code nothing branches on.
    if (!options.signal?.aborted) governor.failed(now(), limits);
    return fallback(
      deadline.signal.aborted && !options.signal?.aborted
        ? "MODEL_TIMEOUT"
        : "MODEL_UNAVAILABLE",
    );
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
