import type { LabelModelAdapter } from "./label-generator";

/**
 * Resolves the label model from an ordered pool of OpenAI-compatible endpoints.
 *
 * The pool exists because each endpoint is a relay that may disappear without
 * notice. Ordered fallback is therefore normal operation, not an error path.
 *
 * This module is the only place an endpoint host, a model name, or a key
 * appears. Keys are read from the environment at call time and never enter a
 * request that reaches the browser, a log line, an error message, or a cache
 * key. A label answer carries no provider identity, so a person cannot tell —
 * and does not need to tell — which relay named their thought.
 */

export type LabelCandidate = Readonly<{
  /** Pool entry name. Diagnostic only; it never leaves the server. */
  station: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}>;

export type LabelProviderLimits = Readonly<{
  /** Below this, a further attempt cannot finish inside the caller's deadline. */
  minimumAttemptMs: number;
  maxOutputTokens: number;
  maxResponseBytes: number;
  failuresBeforeCooldown: number;
  cooldownMs: number;
}>;

export const DEFAULT_PROVIDER_LIMITS: LabelProviderLimits = Object.freeze({
  minimumAttemptMs: 400,
  maxOutputTokens: 32,
  maxResponseBytes: 16 * 1_024,
  failuresBeforeCooldown: 2,
  cooldownMs: 60_000,
});

type CandidateHealth = { failures: number; cooldownUntilMs: number };

const health = new Map<string, CandidateHealth>();

export function resetLabelProviderHealth(): void {
  health.clear();
}

/**
 * Reads the pool from the environment.
 *
 * ```text
 * MATTER_LABEL_POOL=abc,backup
 * MATTER_LABEL_ABC_BASE_URL=https://…/v1
 * MATTER_LABEL_ABC_API_KEY=…
 * MATTER_LABEL_ABC_MODELS=Qwen-flash,DeepSeek-V3
 * ```
 *
 * Numbered variables rather than one JSON blob: a secret is easier to rotate,
 * grep, and redact when it is its own variable, and a malformed pool degrades
 * to a shorter pool instead of throwing at request time.
 */
export function readLabelPool(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly LabelCandidate[] {
  const stations = (environment.MATTER_LABEL_POOL ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Za-z0-9_-]{1,32}$/.test(entry));

  const candidates: LabelCandidate[] = [];
  for (const station of stations) {
    const prefix = `MATTER_LABEL_${station.toUpperCase().replaceAll("-", "_")}`;
    const baseUrl = environment[`${prefix}_BASE_URL`]?.trim();
    const apiKey = environment[`${prefix}_API_KEY`]?.trim();
    const models = (environment[`${prefix}_MODELS`] ?? "")
      .split(",")
      .map((model) => model.trim())
      .filter((model) => model.length > 0);
    if (baseUrl === undefined || apiKey === undefined) continue;
    if (!isHttpsOrLocal(baseUrl)) continue;
    if (apiKey.length === 0 || models.length === 0) continue;
    for (const model of models) {
      candidates.push(Object.freeze({
        station,
        baseUrl: baseUrl.replace(/\/+$/u, ""),
        apiKey,
        model,
      }));
    }
  }
  return Object.freeze(candidates);
}

export function resolvePoolLabelAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  limits: LabelProviderLimits = DEFAULT_PROVIDER_LIMITS,
  now: () => number = Date.now,
): LabelModelAdapter | null {
  const pool = readLabelPool(environment);
  if (pool.length === 0) return null;
  return createPoolLabelAdapter(pool, limits, now);
}

export function createPoolLabelAdapter(
  pool: readonly LabelCandidate[],
  limits: LabelProviderLimits = DEFAULT_PROVIDER_LIMITS,
  now: () => number = Date.now,
  fetchImpl: typeof fetch = fetch,
): LabelModelAdapter {
  return async (input, signal) => {
    const deadlineAtMs = now() + input.deadlineMs;
    let lastError: unknown = new Error("The label pool is empty.");

    for (const candidate of orderedCandidates(pool, now())) {
      const remaining = deadlineAtMs - now();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // Starting an attempt that cannot finish spends the caller's deadline on
      // a request nobody will read.
      if (remaining < limits.minimumAttemptMs) break;
      try {
        const text = await completeOnce(candidate, input, signal, limits, remaining, fetchImpl);
        recordOutcome(candidate, true, limits, now);
        return { text };
      } catch (error) {
        if (signal.aborted) throw error;
        recordOutcome(candidate, false, limits, now);
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
  pool: readonly LabelCandidate[],
  nowMs: number,
): readonly LabelCandidate[] {
  const healthy: LabelCandidate[] = [];
  const cooling: LabelCandidate[] = [];
  for (const candidate of pool) {
    const entry = health.get(candidateKey(candidate));
    if (entry !== undefined && nowMs < entry.cooldownUntilMs) cooling.push(candidate);
    else healthy.push(candidate);
  }
  return [...healthy, ...cooling];
}

async function completeOnce(
  candidate: LabelCandidate,
  input: Parameters<LabelModelAdapter>[0],
  signal: AbortSignal,
  limits: LabelProviderLimits,
  remainingMs: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const attempt = new AbortController();
  const timer = setTimeout(() => attempt.abort(), remainingMs);
  const forward = () => attempt.abort();
  signal.addEventListener("abort", forward, { once: true });
  try {
    const response = await fetchImpl(`${candidate.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${candidate.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: candidate.model,
        // A label is one short phrase; sampling would make an unchanged node
        // rename itself on every cache miss.
        temperature: 0,
        max_tokens: limits.maxOutputTokens,
        stream: false,
        messages: [{ role: "user", content: input.prompt }],
      }),
      redirect: "error",
      signal: attempt.signal,
    });
    const body = await readBounded(response, limits.maxResponseBytes);
    if (!response.ok) {
      // The status is diagnostic; the body may quote the provider and never
      // reaches the browser, which only ever sees a deterministic label.
      throw new Error(`Label provider returned HTTP ${response.status}.`);
    }
    return extractContent(JSON.parse(body) as unknown);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forward);
  }
}

function extractContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The label provider response was not an object.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("The label provider response had no choice.");
  }
  const message = (choices[0] as { message?: unknown }).message;
  const content = typeof message === "object" && message !== null
    ? (message as { content?: unknown }).content
    : undefined;
  if (typeof content !== "string") {
    throw new Error("The label provider response had no text.");
  }
  return content;
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("The label provider response was too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (total > maxBytes) await body.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

function recordOutcome(
  candidate: LabelCandidate,
  ok: boolean,
  limits: LabelProviderLimits,
  now: () => number,
): void {
  const key = candidateKey(candidate);
  if (ok) {
    health.delete(key);
    return;
  }
  const entry = health.get(key) ?? { failures: 0, cooldownUntilMs: 0 };
  entry.failures += 1;
  if (entry.failures >= limits.failuresBeforeCooldown) {
    entry.cooldownUntilMs = now() + limits.cooldownMs;
    entry.failures = 0;
  }
  health.set(key, entry);
}

/** Identity excludes the key, so rotating a key does not reset health. */
function candidateKey(candidate: LabelCandidate): string {
  return `${candidate.station} ${candidate.baseUrl} ${candidate.model}`;
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
