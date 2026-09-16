import {
  CandidateRejectedError,
  PoolDrainingError,
  ScenarioPolicyError,
  UnusableCompletionError,
  type UnusableCompletionCode,
} from "./completion-outcome";
import type {
  MatterScenarioId,
  ScenarioAdapter,
  ScenarioCall,
  ScenarioCandidateEvent,
} from "./harness";
import { BoundedByteAccumulator } from "../runtime/bounded-byte-accumulator";

/**
 * One ordered pool of OpenAI-compatible endpoints, shared by every scenario.
 *
 * The pool exists because each endpoint is a relay that may disappear without
 * notice. Ordered fallback is therefore normal operation, not an error path.
 *
 * This module owns the managed environment pool. Reviewed user-provider hosts,
 * models, and transports live in the server-only registry; their request-local
 * credentials arrive only through the sealed provider-session boundary. No
 * key enters a log line, error message, material cache key, or browser-visible
 * response. An answer carries no provider identity.
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
  /** Separates disposable health for request-local user credentials. */
  credentialScopeId?: string;
  /** A reviewed provider owns its request shape; arbitrary clients do not. */
  transport?: PoolTransport;
  /** Provider-compatible top-level thinking switch, when explicitly set. */
  enableThinking?: boolean;
}>;

export type PoolTransport = Readonly<{
  id: string;
  /** Custom mirrors use a DNS-pinned HTTPS boundary instead of global fetch. */
  fetch?: typeof fetch;
  /** The reviewed wire profile, not the caller, owns its operation path. */
  completionUrl: (baseUrl: string) => string;
  /** Authentication and provider-version headers never cross into browser code. */
  authHeaders: (apiKey: string) => Readonly<Record<string, string>>;
  /** Status and media type are part of the reviewed provider wire contract. */
  acceptsResponse: (response: Response) => boolean;
  serialize: (
    call: ScenarioCall,
    maximumOutputTokens: number,
    model: string,
  ) => Readonly<Record<string, unknown>>;
  /** The reviewed provider owns the complete response vocabulary. */
  parseCompletion: (payload: unknown) => PoolParsedCompletion;
}>;

export type PoolParsedCompletion = Readonly<{
  content: unknown;
  disposition: PoolCompletionDisposition;
  unusable?: UnusableCompletionCode;
}>;

export type PoolCompletionDisposition =
  | "complete"
  | "missing"
  | UnusableCompletionCode;

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
   * The pool's own ceiling, not a scenario's. It sits at or above the longest
   * answer any current scenario asks for, so a scenario that forgets to state a
   * bound is still bounded, and a scenario that states one always gets the
   * smaller number.
   */
  maxOutputTokens: 1_200,
  maxResponseBytes: 32 * 1_024,
  failuresBeforeCooldown: 2,
  cooldownMs: 60_000,
});

type CandidateHealth = { failures: number; cooldownUntilMs: number; expiresAtMs: number };

// The pool can be reconfigured between requests in a warm server process.
// Health is disposable evidence, so retain it only long enough to influence a
// nearby retry and never let rotated endpoint identities accumulate forever.
const HEALTH_TTL_MS = 5 * 60_000;
const MAX_HEALTH_ENTRIES = 256;

/**
 * Candidate ordering is shared code, but its mutable evidence belongs to the
 * scenario that paid for the call. A repair stall must not silently demote a
 * relay for a label that may use a different budget and prompt shape.
 */
const health = new Map<string, CandidateHealth>();
/**
 * Raw fetches that ignored their attempt abort. A scenario/candidate may own
 * several only when healthy concurrent calls time out together; while any
 * remain, later calls skip that candidate rather than multiplying the drain.
 */
const drainingAttempts = new Map<string, Set<Promise<void>>>();
let drainingAttemptCount = 0;
const MAX_DRAINING_ATTEMPTS = 256;

export function resetPoolHealth(): void {
  health.clear();
  // Drain leases describe resources that still exist. Clearing them would let
  // a caller multiply a transport precisely because it ignored cancellation.
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
    const enableThinkingValue = environment[`${prefix}_ENABLE_THINKING`];
    const enableThinking = parseOptionalBoolean(enableThinkingValue);
    if (baseUrl === undefined || apiKey === undefined) continue;
    if (!isHttpsOrLocal(baseUrl)) continue;
    if (apiKey.length === 0 || models.length === 0) continue;
    // A present but misspelled capability must not silently become absence:
    // strict relays can reject an unsupported field, while thinking-capable
    // models can change latency and output shape when the reviewed value drifts.
    if (enableThinkingValue !== undefined && enableThinking === null) continue;
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
  fetchImpl?: typeof fetch,
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
    let attempted = false;
    let skippedDraining = false;
    let lastRejection: CandidateRejectedError | null = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index]!;
      if (hasDrainingAttempt(healthKey(input.scenario, candidate))) {
        skippedDraining = true;
        continue;
      }
      assertDrainCapacity();
      const remaining = deadlineAtMs - now();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // Starting an attempt that cannot finish spends the caller's deadline on
      // a request nobody will read.
      if (remaining < limits.minimumAttemptMs) break;
      const isLast = !ordered.slice(index + 1).some((later) => (
        !hasDrainingAttempt(healthKey(input.scenario, later))
      ));
      const attemptMs = isLast ? remaining : Math.min(remaining, attemptCeilingMs);
      attempted = true;
      try {
        const text = await completeOnce(candidate, input, signal, limits, attemptMs, fetchImpl);
        recordOutcome(candidate, input.scenario, "answered", limits, now);
        const verdict = input.adjudicateCandidate?.(text);
        if (verdict !== undefined && !verdict.ok) {
          noteCandidate(input, "rejected");
          lastRejection = new CandidateRejectedError(verdict.reason);
          lastError = lastRejection;
          continue;
        }
        noteCandidate(input, "answered");
        return { text };
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof ScenarioPolicyError) throw error;
        if (error instanceof UnusableCompletionError) {
          // A relay that repeatedly returns no usable final text is demoted for
          // this scenario, while the surface-wide governor stays neutral. A
          // second relay may complete the same request with different model
          // behaviour, so fallback remains useful rather than deterministic.
          recordOutcome(candidate, input.scenario, "incomplete", limits, now);
          noteCandidate(input, error.code === "truncated" ? "truncated" : "refused");
          lastError = error;
          continue;
        }
        // A relay that spends its whole attempt and says nothing is worse than
        // one that refuses in 200 ms, and the two used to be recorded
        // identically. The difference is what the next caller pays: a fast
        // refusal costs them nothing, while a hang costs them this ceiling
        // again before the pool can even reach a working relay. Grading the
        // hang harder is what stops one stalled relay from spending every
        // caller's deadline until it happens to fail twice.
        const outcome = error instanceof CandidateAttemptTimeoutError ? "stalled" : "failed";
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
    if (!attempted && skippedDraining) throw new PoolDrainingError();
    if (lastError === lastRejection && lastRejection !== null) throw lastRejection;
    throw lastError;
  };
}

/** Proves one reviewed user candidate before any credential cookie is issued. */
export async function probePoolCandidate(
  candidate: PoolCandidate,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
  attemptMs = 6_000,
): Promise<void> {
  signal.throwIfAborted();
  // A connection check can outlive its route when a third-party transport
  // ignores abort just like an ordinary model attempt. It therefore shares
  // the same process-wide drain ceiling instead of creating an unbounded lane
  // merely because no credential cookie has been issued yet.
  assertDrainCapacity();
  const limits: PoolLimits = Object.freeze({
    minimumAttemptMs: 400,
    maxAttemptShare: 1,
    maxOutputTokens: 12,
    maxResponseBytes: 8 * 1_024,
    failuresBeforeCooldown: 1,
    cooldownMs: 30_000,
  });
  const answer = await completeOnce(candidate, {
    scenario: "matter-inquiry",
    prompt: "Return exactly MATTER_READY. This is a connection check; do not add any other text.",
    locale: "en",
    input: null,
    deadlineMs: attemptMs,
    maxOutputTokens: 12,
  }, signal, limits, attemptMs, fetchImpl);
  // Text providers commonly preserve a final newline even for deterministic
  // output. Ignore surrounding whitespace only; any additional token still
  // fails the capability proof.
  if (answer.trim() !== "MATTER_READY") {
    throw new Error("The provider check did not return the expected capability proof.");
  }
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
  pruneExpiredHealth(nowMs);
  const healthyRequestCredentials: PoolCandidate[] = [];
  const coolingRequestCredentials: PoolCandidate[] = [];
  const healthy: PoolCandidate[] = [];
  const cooling: PoolCandidate[] = [];
  for (const candidate of pool) {
    // A person's selected provider remains first across completed failures.
    // An actually draining attempt is still skipped by the caller loop so an
    // advisory abort cannot multiply live third-party work.
    const entry = health.get(healthKey(scenario, candidate));
    const candidateCooling = entry !== undefined && nowMs < entry.cooldownUntilMs;
    if (candidate.credentialScopeId !== undefined) {
      (candidateCooling ? coolingRequestCredentials : healthyRequestCredentials).push(candidate);
    } else {
      (candidateCooling ? cooling : healthy).push(candidate);
    }
  }
  return [...healthyRequestCredentials, ...healthy, ...coolingRequestCredentials, ...cooling];
}

async function completeOnce(
  candidate: PoolCandidate,
  input: Parameters<ScenarioAdapter>[0],
  signal: AbortSignal,
  limits: PoolLimits,
  attemptMs: number,
  fetchImpl?: typeof fetch,
): Promise<string> {
  // AbortSignal listeners observe only future transitions. Guard the current
  // state too, so no direct caller can spend a request after authority ended.
  signal.throwIfAborted();
  const attempt = new AbortController();
  let attemptTimedOut = false;
  const timer = setTimeout(() => {
    attemptTimedOut = true;
    attempt.abort();
  }, attemptMs);
  const forward = () => attempt.abort();
  signal.addEventListener("abort", forward, { once: true });
  const boundary = rejectOnAbort(attempt.signal);
  const drainKey = healthKey(input.scenario, candidate);
  let request: Promise<Response> | undefined;
  let response: Response | undefined;
  let responseBodyConsumed = false;
  let responseBodyHandedOff = false;
  const handOffResponseBody = (disposer: Promise<void>): void => {
    if (responseBodyHandedOff) return;
    responseBodyHandedOff = true;
    registerDrainLease(drainKey, disposer);
  };
  try {
    // Fetch cancellation is advisory even in server runtimes and third-party
    // adapters. The hard race is what preserves time for the next relay when a
    // transport ignores AbortSignal; the signal still performs best-effort
    // socket and response-body cleanup underneath it.
    const maximumOutputTokens = Math.min(
      limits.maxOutputTokens,
      Number.isSafeInteger(input.maxOutputTokens) && input.maxOutputTokens > 0
        ? input.maxOutputTokens
        : limits.maxOutputTokens,
    );
    const requestFetch = fetchImpl ?? candidate.transport?.fetch ?? fetch;
    const transport = candidate.transport;
    request = requestFetch(transport?.completionUrl(candidate.baseUrl) ?? `${candidate.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...(transport?.authHeaders(candidate.apiKey) ?? { authorization: `Bearer ${candidate.apiKey}` }),
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(transport?.serialize(input, maximumOutputTokens, candidate.model) ??
          serializeManagedOpenAiCompatible(candidate, input, maximumOutputTokens)),
        cache: "no-store",
        redirect: "error",
        signal: attempt.signal,
      });
    response = await Promise.race([request, boundary.promise]);
    if (!response.ok) {
      // Error bodies are neither surfaced nor diagnostic input. Do not let a
      // relay that has already refused hold the fallback lane open by streaming
      // or withholding an irrelevant body.
      handOffResponseBody(cancelResponseBody(response));
      throw new ProviderHttpResponseError(response.status);
    }
    if (transport !== undefined && !transport.acceptsResponse(response)) {
      handOffResponseBody(cancelResponseBody(response));
      throw new Error("The reviewed provider returned an unexpected response envelope.");
    }
    const body = await readBounded(
      response,
      limits.maxResponseBytes,
      attempt.signal,
      handOffResponseBody,
    );
    responseBodyConsumed = true;
    const payload = JSON.parse(body) as unknown;
    const completion = transport?.parseCompletion(payload) ?? parseManagedCompletion(payload);
    const disposition = completion.disposition;
    if (disposition === "unknown-terminator") noteCandidate(input, "unknown-terminator");
    if (completion.unusable !== undefined) throw new UnusableCompletionError(completion.unusable);
    if (typeof completion.content !== "string") {
      throw new Error("The model provider response had no text.");
    }
    if (disposition === "missing") {
      noteCandidate(input, "missing-terminator");
      if (transport !== undefined) {
        throw new UnusableCompletionError("unknown-terminator");
      }
    } else if (disposition !== "complete") {
      throw new UnusableCompletionError(disposition);
    }
    return completion.content;
  } catch (error) {
    if (attemptTimedOut && !signal.aborted) throw new CandidateAttemptTimeoutError();
    throw error;
  } finally {
    if (response === undefined && attempt.signal.aborted && request !== undefined) {
      registerDrainingAttempt(drainKey, request);
    } else if (response !== undefined && !responseBodyConsumed && !responseBodyHandedOff) {
      registerDrainingResponse(drainKey, response);
    }
    clearTimeout(timer);
    signal.removeEventListener("abort", forward);
    boundary.dispose();
  }
}

function serializeManagedOpenAiCompatible(
  candidate: PoolCandidate,
  input: ScenarioCall,
  maximumOutputTokens: number,
): Readonly<Record<string, unknown>> {
  return {
    model: candidate.model,
    // Matter retries must not silently redraw unchanged material.
    temperature: 0,
    max_tokens: maximumOutputTokens,
    stream: false,
    // This extension belongs only to managed relays that declare it. Reviewed
    // user-provider adapters own their own capability vocabulary.
    ...(candidate.enableThinking === undefined
      ? {}
      : { enable_thinking: input.disableThinking === true ? false : candidate.enableThinking }),
    messages: [{ role: "user", content: input.prompt }],
  };
}

function hasDrainingAttempt(key: string): boolean {
  return (drainingAttempts.get(key)?.size ?? 0) > 0;
}

function assertDrainCapacity(): void {
  if (drainingAttemptCount >= MAX_DRAINING_ATTEMPTS) throw new PoolDrainingError();
}

/**
 * Owns a raw request only after its attempt has lost authority. The lease stays
 * present until a late response body has actually accepted cancellation, so a
 * relay that ignores AbortSignal cannot be multiplied by later requests.
 */
function registerDrainingAttempt(key: string, request: Promise<Response>): void {
  registerDrainLease(key, request.then(
    async (response) => {
      try {
        await response.body?.cancel();
      } catch {
        // A rejected disposer is still settled; no response text is observed.
      }
    },
    () => undefined,
  ));
}

function registerDrainingResponse(key: string, response: Response): void {
  registerDrainLease(key, cancelResponseBody(response));
}

function cancelResponseBody(response: Response): Promise<void> {
  return Promise.resolve().then(async () => {
    try {
      await response.body?.cancel();
    } catch {
      // A rejected disposer is settled and therefore no longer owns a lease.
    }
  });
}

function registerDrainLease(key: string, disposer: Promise<void>): void {
  const set = drainingAttempts.get(key) ?? new Set<Promise<void>>();
  if (!drainingAttempts.has(key)) drainingAttempts.set(key, set);
  const cleanup = disposer.finally(() => {
    set.delete(cleanup);
    drainingAttemptCount = Math.max(0, drainingAttemptCount - 1);
    if (set.size === 0 && drainingAttempts.get(key) === set) drainingAttempts.delete(key);
  });
  set.add(cleanup);
  drainingAttemptCount += 1;
  void cleanup;
}

export class CandidateAttemptTimeoutError extends Error {
  constructor() {
    super("The model relay did not answer inside its attempt window.");
    this.name = "CandidateAttemptTimeoutError";
  }
}

class ProviderHttpResponseError extends Error {
  constructor(readonly status: number) {
    super(`The model provider returned HTTP ${status}.`);
    this.name = "ProviderHttpResponseError";
  }
}

/**
 * Every explicit stop reason is fail-closed. Only a known complete value may
 * authorize text; truncation, block/refusal, tool continuation, conflict,
 * malformed metadata, and unknown vocabulary all lose to the product floor.
 * A genuinely absent field remains a counted compatibility path for relays
 * that predate this boundary.
 */
const TRUNCATED_TERMINATORS: ReadonlySet<string> = new Set([
  "length",                        // OpenAI chat completions
  "max_tokens",                    // Anthropic, and relays that forward it
  "max_output_tokens",             // Responses-shaped relays
  "model_context_window_exceeded", // Anthropic
]);

/** Terminators that mean the model finished; anything else is worth counting. */
const COMPLETE_TERMINATORS: ReadonlySet<string> = new Set([
  "stop", "end_turn", "stop_sequence", "eos", "eos_token", "complete", "completed",
]);

const BLOCKED_TERMINATORS: ReadonlySet<string> = new Set([
  "blocked", "content_filter", "guardrail_intervened", "refusal", "safety",
]);

const TOOL_TERMINATORS: ReadonlySet<string> = new Set([
  "function_call", "pause_turn", "tool_calls", "tool_use",
]);

/**
 * Reads both common fields independently. An empty `finish_reason` cannot hide
 * a non-empty `stop_reason`, and two conflicting reports fail closed.
 */
type TerminatorReport = Readonly<{ values: readonly string[]; invalid: boolean }>;

function readTerminators(choice: Record<string, unknown>): TerminatorReport {
  const values: string[] = [];
  let invalid = false;
  for (const key of ["finish_reason", "stop_reason"] as const) {
    const reason = choice[key];
    if (reason === undefined || reason === null) continue;
    if (typeof reason !== "string") {
      invalid = true;
      continue;
    }
    const normalized = reason.trim().toLowerCase();
    if (normalized.length === 0) {
      invalid = true;
      continue;
    }
    if (!values.includes(normalized)) values.push(normalized);
  }
  return Object.freeze({ values: Object.freeze(values), invalid });
}

function classifyTerminators(report: TerminatorReport): "complete" | "missing" | UnusableCompletionCode {
  if (report.invalid) return "unknown-terminator";
  if (report.values.length === 0) return "missing";
  const kinds = report.values.map((reason) => {
    if (COMPLETE_TERMINATORS.has(reason)) return "complete" as const;
    if (TRUNCATED_TERMINATORS.has(reason)) return "truncated" as const;
    if (BLOCKED_TERMINATORS.has(reason)) return "blocked-or-refused" as const;
    if (TOOL_TERMINATORS.has(reason)) return "tool-or-continuation" as const;
    return "unknown-terminator" as const;
  });
  if (kinds.every((kind) => kind === "complete")) return "complete";
  if (kinds.includes("unknown-terminator")) return "unknown-terminator";
  if (kinds.includes("blocked-or-refused")) return "blocked-or-refused";
  if (kinds.includes("tool-or-continuation")) return "tool-or-continuation";
  return "truncated";
}

function parseManagedCompletion(payload: unknown): PoolParsedCompletion {
  const completion = extractCompletion(payload);
  return Object.freeze({
    content: completion.content,
    disposition: classifyTerminators(completion.terminators),
    ...(completion.unusable === undefined ? {} : { unusable: completion.unusable }),
  });
}

function extractCompletion(payload: unknown): Readonly<{
  content: unknown;
  terminators: TerminatorReport;
  unusable?: UnusableCompletionCode;
}> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The model provider response was not an object.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("The model provider response had no choice.");
  }
  const choice = choices[0];
  if (typeof choice !== "object" || choice === null) {
    throw new Error("The model provider response had no choice object.");
  }
  const record = choice as Record<string, unknown>;
  const message = record.message;
  const messageRecord = typeof message === "object" && message !== null
    ? message as Record<string, unknown>
    : null;
  const unusable = hasRefusal(messageRecord?.refusal)
    ? "blocked-or-refused" as const
    : hasToolCalls(messageRecord?.tool_calls) || hasToolCalls(record.tool_calls)
      ? "tool-or-continuation" as const
      : hasFunctionCall(messageRecord?.function_call) || hasFunctionCall(record.function_call)
        ? "tool-or-continuation" as const
        : undefined;
  return Object.freeze({
    content: messageRecord?.content,
    terminators: readTerminators(record),
    ...(unusable === undefined ? {} : { unusable }),
  });
}

function hasRefusal(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function hasToolCalls(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return !Array.isArray(value) || value.length > 0;
}

function hasFunctionCall(value: unknown): boolean {
  return value !== undefined && value !== null;
}

async function readBounded(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  handOffDrain: (disposer: Promise<void>) => void,
): Promise<string> {
  const body = response.body;
  if (body === null) return "";
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > maxBytes) {
    handOffDrain(cancelResponseBody(response));
    throw new Error("The model provider response was too large.");
  }
  signal.throwIfAborted();
  const reader = body.getReader();
  const bytes = new BoundedByteAccumulator(maxBytes);
  let oversized = false;
  const boundary = rejectOnAbort(signal);
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    if (cancellation !== undefined) return;
    cancellation = reader.cancel(signal.reason).catch(() => undefined);
    handOffDrain(cancellation);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), boundary.promise]);
      if (done) break;
      if (value === undefined) continue;
      if (!bytes.append(value)) {
        oversized = true;
        throw new Error("The model provider response was too large.");
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    boundary.dispose();
    if (signal.aborted || oversized) cancel();
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.snapshot());
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

export type CandidateOutcome = "answered" | "failed" | "stalled" | "incomplete";

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
  const nowMs = now();
  pruneExpiredHealth(nowMs);
  let entry = health.get(key);
  if (entry === undefined) {
    makeHealthRoom();
    entry = { failures: 0, cooldownUntilMs: 0, expiresAtMs: 0 };
  }
  // A stall consumes the caller's budget rather than reporting a fault, so it
  // reaches the cooldown threshold on its own. It is still only a demotion:
  // `orderedCandidates` keeps trying cooling relays after the healthy ones, so
  // a pool of stalled relays degrades to slow rather than to empty.
  entry.failures += outcome === "stalled" ? limits.failuresBeforeCooldown : 1;
  if (entry.failures >= limits.failuresBeforeCooldown) {
    entry.cooldownUntilMs = nowMs + limits.cooldownMs;
    entry.failures = 0;
  }
  // Evidence must outlive an active cooldown even when a scenario uses a
  // longer custom cooldown, but expired fast-failure evidence starts fresh.
  entry.expiresAtMs = Math.max(nowMs + HEALTH_TTL_MS, entry.cooldownUntilMs);
  // Refresh insertion order so the capacity bound evicts the least recently
  // updated evidence rather than a relay that is still being observed.
  health.delete(key);
  health.set(key, entry);
}

function pruneExpiredHealth(nowMs: number): void {
  for (const [key, entry] of health) {
    if (nowMs >= entry.expiresAtMs) health.delete(key);
  }
}

function makeHealthRoom(): void {
  while (health.size >= MAX_HEALTH_ENTRIES) {
    const oldest = health.keys().next().value;
    if (oldest === undefined) return;
    health.delete(oldest);
  }
}

/** Identity excludes secret text and user URLs while keeping credentials apart. */
function candidateKey(candidate: PoolCandidate): string {
  if (candidate.credentialScopeId !== undefined) {
    return [
      candidate.station,
      candidate.model,
      candidate.transport?.id ?? "managed-openai-compatible/1",
      candidate.credentialScopeId,
    ].join("\u0000");
  }
  return [
    candidate.station,
    candidate.baseUrl,
    candidate.model,
    candidate.transport?.id ?? "managed-openai-compatible/1",
    "managed",
  ].join("\u0000");
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
