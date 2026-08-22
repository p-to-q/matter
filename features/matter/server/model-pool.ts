import type {
  MatterScenarioId,
  ScenarioAdapter,
  ScenarioCall,
  ScenarioCandidateEvent,
} from "./harness";

/**
 * One ordered pool of OpenAI-compatible endpoints, shared by every scenario.
 *
 * The pool exists because each endpoint is a relay that may disappear without
 * notice. Ordered fallback is therefore normal operation, not an error path.
 *
 * This module is the only place an endpoint host, a model name, or a key
 * appears. Keys are read from the environment at call time and never enter a
 * request that reaches the browser, a log line, an error message, or a cache
 * key. An answer carries no provider identity, so a person cannot tell — and
 * does not need to tell — which relay named their thought.
 *
 * New deployments use the scenario-neutral `MATTER_MODEL_*` namespace. The
 * deployed `MATTER_LABEL_*` layout remains a complete legacy fallback so a
 * source release cannot silently lose production credentials. Setting both
 * namespaces is rejected as ambiguous instead of combining two authority sets.
 */

export type PoolCandidate = Readonly<{
  /** Pool entry name. Diagnostic only; it never leaves the server. */
  station: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Provider-compatible top-level thinking switch, when explicitly set. */
  enableThinking?: boolean;
}>;

export type PoolLimits = Readonly<{
  /** Below this, a further attempt cannot finish inside the caller's deadline. */
  minimumAttemptMs: number;
  /**
   * The largest share of one caller's deadline a single relay may hold.
   *
   * A relay that answers slowly, or hangs until the deadline, is the ordinary
   * failure here — far more common than one that refuses quickly. Letting that
   * relay wait out the whole deadline turns ordered fallback into no fallback
   * at all: the second candidate is never reached, and the caller pays a full
   * deadline to learn nothing. Bounding one attempt guarantees that at least
   * one other relay is tried before the floor is used. The last candidate is
   * exempt, because there is no one left for it to starve.
   */
  maxAttemptShare: number;
  maxOutputTokens: number;
  maxResponseBytes: number;
  failuresBeforeCooldown: number;
  cooldownMs: number;
}>;

export const DEFAULT_POOL_LIMITS: PoolLimits = Object.freeze({
  minimumAttemptMs: 400,
  maxAttemptShare: 0.5,
  /**
   * The pool's own ceiling, not a scenario's. It sits above the longest answer
   * any scenario asks for, so a scenario that forgets to state a bound is still
   * bounded, and a scenario that states one always gets the smaller number.
   */
  maxOutputTokens: 1_200,
  maxResponseBytes: 32 * 1_024,
  failuresBeforeCooldown: 2,
  cooldownMs: 60_000,
});

type CandidateHealth = { failures: number; cooldownUntilMs: number };

/**
 * Candidate ordering is shared code, but its mutable evidence belongs to the
 * scenario that paid for the call. A repair stall must not silently demote a
 * relay for a label that may use a different budget and prompt shape.
 */
const health = new Map<string, CandidateHealth>();

export function resetPoolHealth(): void {
  health.clear();
}

/**
 * Reads the pool from the environment.
 *
 * ```text
 * MATTER_MODEL_POOL=abc,backup
 * MATTER_MODEL_ABC_BASE_URL=https://…/v1
 * MATTER_MODEL_ABC_API_KEY=…
 * MATTER_MODEL_ABC_MODELS=Qwen-flash,DeepSeek-V3
 * ```
 *
 * Numbered variables rather than one JSON blob: a secret is easier to rotate,
 * grep, and redact when it is its own variable, and a malformed pool degrades
 * to a shorter pool instead of throwing at request time.
 */
export function readModelPool(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly PoolCandidate[] {
  const namespace = poolNamespace(environment);
  if (namespace === null) return Object.freeze([]);
  const stations = [...new Set(
    (environment[`MATTER_${namespace}_POOL`] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => /^[A-Za-z0-9_-]{1,32}$/.test(entry)),
  )];

  const candidates: PoolCandidate[] = [];
  for (const station of stations) {
    const prefix = `MATTER_${namespace}_${station.toUpperCase().replaceAll("-", "_")}`;
    const baseUrl = environment[`${prefix}_BASE_URL`]?.trim();
    const apiKey = environment[`${prefix}_API_KEY`]?.trim();
    const models = [...new Set(
      (environment[`${prefix}_MODELS`] ?? "")
        .split(",")
        .map((model) => model.trim())
        .filter((model) => model.length > 0),
    )];
    const enableThinking = parseOptionalBoolean(environment[`${prefix}_ENABLE_THINKING`]);
    if (baseUrl === undefined || apiKey === undefined) continue;
    if (!isHttpsOrLocal(baseUrl)) continue;
    if (apiKey.length === 0 || models.length === 0) continue;
    for (const model of models) {
      candidates.push(Object.freeze({
        station,
        baseUrl: baseUrl.replace(/\/+$/u, ""),
        apiKey,
        model,
        ...(enableThinking === null ? {} : { enableThinking }),
      }));
    }
  }
  return Object.freeze(candidates);
}

function poolNamespace(
  environment: Readonly<Record<string, string | undefined>>,
): "MODEL" | "LABEL" | null {
  const canonical = environment.MATTER_MODEL_POOL?.trim() ?? "";
  const legacy = environment.MATTER_LABEL_POOL?.trim() ?? "";
  // Two complete namespaces must never be merged: candidate order determines
  // cost and latency, and silently preferring one can strand a rotated key.
  if (canonical.length > 0 && legacy.length > 0) return null;
  if (canonical.length > 0) return "MODEL";
  if (legacy.length > 0) return "LABEL";
  return null;
}

export function resolvePoolAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  limits: PoolLimits = DEFAULT_POOL_LIMITS,
  now: () => number = Date.now,
): ScenarioAdapter | null {
  const pool = readModelPool(environment);
  if (pool.length === 0) return null;
  return createPoolAdapter(pool, limits, now);
}

export function createPoolAdapter(
  pool: readonly PoolCandidate[],
  limits: PoolLimits = DEFAULT_POOL_LIMITS,
  now: () => number = Date.now,
  fetchImpl: typeof fetch = fetch,
): ScenarioAdapter {
  return async (input, signal) => {
    noteCandidate(input, "pool");
    const deadlineAtMs = now() + input.deadlineMs;
    let lastError: unknown = new Error("The model pool is empty.");

    const ordered = orderedCandidates(pool, input.scenario, now());
    const attemptCeilingMs = Math.max(
      limits.minimumAttemptMs,
      Math.round(input.deadlineMs * limits.maxAttemptShare),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index]!;
      const remaining = deadlineAtMs - now();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // Starting an attempt that cannot finish spends the caller's deadline on
      // a request nobody will read.
      if (remaining < limits.minimumAttemptMs) break;
      const isLast = index === ordered.length - 1;
      const attemptMs = isLast ? remaining : Math.min(remaining, attemptCeilingMs);
      const startedAt = now();
      try {
        const text = await completeOnce(candidate, input, signal, limits, attemptMs, fetchImpl);
        recordOutcome(candidate, input.scenario, "answered", limits, now);
        noteCandidate(input, "answered");
        return { text };
      } catch (error) {
        if (signal.aborted) throw error;
        // A relay that spends its whole attempt and says nothing is worse than
        // one that refuses in 200 ms, and the two used to be recorded
        // identically. The difference is what the next caller pays: a fast
        // refusal costs them nothing, while a hang costs them this ceiling
        // again before the pool can even reach a working relay. Grading the
        // hang harder is what stops one stalled relay from spending every
        // caller's deadline until it happens to fail twice.
        const outcome = now() - startedAt >= attemptMs ? "stalled" : "failed";
        recordOutcome(
          candidate,
          input.scenario,
          outcome,
          limits,
          now,
        );
        noteCandidate(input, outcome);
        lastError = error;
      }
    }
    throw lastError;
  };
}

/**
 * Healthy candidates keep pool order; cooling ones are tried only after them,
 * so a relay that failed recently costs nothing while another still answers,
 * but is never permanently abandoned.
 */
function orderedCandidates(
  pool: readonly PoolCandidate[],
  scenario: MatterScenarioId,
  nowMs: number,
): readonly PoolCandidate[] {
  const healthy: PoolCandidate[] = [];
  const cooling: PoolCandidate[] = [];
  for (const candidate of pool) {
    const entry = health.get(healthKey(scenario, candidate));
    if (entry !== undefined && nowMs < entry.cooldownUntilMs) cooling.push(candidate);
    else healthy.push(candidate);
  }
  return [...healthy, ...cooling];
}

async function completeOnce(
  candidate: PoolCandidate,
  input: Parameters<ScenarioAdapter>[0],
  signal: AbortSignal,
  limits: PoolLimits,
  attemptMs: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const attempt = new AbortController();
  const timer = setTimeout(() => attempt.abort(), attemptMs);
  const forward = () => attempt.abort();
  signal.addEventListener("abort", forward, { once: true });
  const boundary = rejectOnAbort(attempt.signal);
  try {
    // Fetch cancellation is advisory even in server runtimes and third-party
    // adapters. The hard race is what preserves time for the next relay when a
    // transport ignores AbortSignal; the signal still performs best-effort
    // socket and response-body cleanup underneath it.
    const response = await Promise.race([
      fetchImpl(`${candidate.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${candidate.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: candidate.model,
          // Every Matter scenario is deterministic by intent: an unchanged node
          // must not rename itself on a cache miss, and one utterance must not be
          // repaired differently on a retry. Sampling has nothing to offer here.
          temperature: 0,
          // The scenario's own ceiling wins when it asked for one. A short thought
          // must not buy a long generation, and a long one must not be cut off
          // mid-sentence and then rejected for it.
          max_tokens: Math.min(
            limits.maxOutputTokens,
            Number.isSafeInteger(input.maxOutputTokens) && input.maxOutputTokens > 0
              ? input.maxOutputTokens
              : limits.maxOutputTokens,
          ),
          stream: false,
          ...(candidate.enableThinking === undefined
            ? {}
            : { enable_thinking: candidate.enableThinking }),
          messages: [{ role: "user", content: input.prompt }],
        }),
        cache: "no-store",
        redirect: "error",
        signal: attempt.signal,
      }),
      boundary.promise,
    ]);
    const body = await readBounded(response, limits.maxResponseBytes, attempt.signal);
    if (!response.ok) {
      // The status is diagnostic; the body may quote the provider and never
      // reaches the browser, which only ever sees a deterministic label.
      throw new Error(`Model provider returned HTTP ${response.status}.`);
    }
    return extractContent(JSON.parse(body) as unknown);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forward);
    boundary.dispose();
  }
}

function extractContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The model provider response was not an object.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("The model provider response had no choice.");
  }
  const message = (choices[0] as { message?: unknown }).message;
  const content = typeof message === "object" && message !== null
    ? (message as { content?: unknown }).content
    : undefined;
  if (typeof content !== "string") {
    throw new Error("The model provider response had no text.");
  }
  return content;
}

async function readBounded(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const body = response.body;
  if (body === null) return "";
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > maxBytes) {
    void body.cancel().catch(() => undefined);
    throw new Error("The model provider response was too large.");
  }
  signal.throwIfAborted();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let oversized = false;
  const boundary = rejectOnAbort(signal);
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), boundary.promise]);
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        oversized = true;
        throw new Error("The model provider response was too large.");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    boundary.dispose();
    if (signal.aborted || oversized) cancel();
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

function rejectOnAbort(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let rejectPromise!: (error: DOMException) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  // The provider can win the race. Consume the later abort so it never becomes
  // an unhandled rejection after a successful response.
  promise.catch(() => undefined);
  const reject = () => rejectPromise(new DOMException("Aborted", "AbortError"));
  if (signal.aborted) reject();
  else signal.addEventListener("abort", reject, { once: true });
  return { promise, dispose: () => signal.removeEventListener("abort", reject) };
}

export type CandidateOutcome = "answered" | "failed" | "stalled";

function noteCandidate(input: ScenarioCall, event: ScenarioCandidateEvent): void {
  try {
    input.observeCandidate?.(event);
  } catch {
    // A metrics sink cannot change candidate order, fallback, or an answer.
  }
}

function recordOutcome(
  candidate: PoolCandidate,
  scenario: MatterScenarioId,
  outcome: CandidateOutcome,
  limits: PoolLimits,
  now: () => number,
): void {
  const key = healthKey(scenario, candidate);
  if (outcome === "answered") {
    health.delete(key);
    return;
  }
  const entry = health.get(key) ?? { failures: 0, cooldownUntilMs: 0 };
  // A stall consumes the caller's budget rather than reporting a fault, so it
  // reaches the cooldown threshold on its own. It is still only a demotion:
  // `orderedCandidates` keeps trying cooling relays after the healthy ones, so
  // a pool of stalled relays degrades to slow rather than to empty.
  entry.failures += outcome === "stalled" ? limits.failuresBeforeCooldown : 1;
  if (entry.failures >= limits.failuresBeforeCooldown) {
    entry.cooldownUntilMs = now() + limits.cooldownMs;
    entry.failures = 0;
  }
  health.set(key, entry);
}

/** Identity excludes the key, so rotating a key does not reset health. */
function candidateKey(candidate: PoolCandidate): string {
  return `${candidate.station}\u0000${candidate.baseUrl}\u0000${candidate.model}`;
}

function healthKey(scenario: MatterScenarioId, candidate: PoolCandidate): string {
  return `${scenario}\u0000${candidateKey(candidate)}`;
}

function isHttpsOrLocal(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    // A plain-HTTP relay is only acceptable on the loopback interface, where a
    // key cannot be read off the wire by a third party.
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
