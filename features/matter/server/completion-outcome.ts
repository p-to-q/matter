/** Human-readable identity for provider completion settlement. */
export const COMPLETION_OUTCOME_POLICY_VERSION = "completion-outcome/1";

/** Closed provider-completion outcomes that can never become Matter text. */
export type UnusableCompletionCode =
  | "truncated"
  | "blocked-or-refused"
  | "tool-or-continuation"
  | "unknown-terminator";

/**
 * How a relay says one completion stopped. `missing` means no stop field at
 * all; its caller decides whether that compatibility path may return text.
 */
export type CompletionDisposition = "complete" | "missing" | UnusableCompletionCode;

/**
 * The one OpenAI-compatible stop vocabulary. The managed pool and every
 * reviewed compatible user transport read relays of the same families, so a
 * terminator that authorizes text on one lane must authorize it on the other;
 * two lists had drifted until a mirror's `eos` answered on the managed lane and
 * was refused on a person's own key.
 *
 * Every explicit stop reason is fail-closed. Only a known complete value may
 * authorize text; truncation, block/refusal, tool continuation, conflict,
 * malformed metadata, and unknown vocabulary all lose to the product floor.
 * The official OpenAI, DeepSeek, Anthropic, and Responses wires keep their own
 * narrower vocabularies; Gemini's official transport is OpenAI-compatible by
 * design and uses this one.
 */
const TRUNCATED_TERMINATORS: ReadonlySet<string> = new Set([
  "length",                        // OpenAI chat completions
  "max_tokens",                    // Anthropic, and relays that forward it
  "max_output_tokens",             // Responses-shaped relays
  "model_context_window_exceeded", // Anthropic
]);

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
 * Reads both common fields of one choice independently. An empty
 * `finish_reason` cannot hide a non-empty `stop_reason`, a non-string or blank
 * report is unknown, and two conflicting reports fail closed.
 */
export function classifyCompletionTerminators(
  choice: Readonly<Record<string, unknown>>,
): CompletionDisposition {
  const reasons: string[] = [];
  for (const key of ["finish_reason", "stop_reason"] as const) {
    const reason = choice[key];
    if (reason === undefined || reason === null) continue;
    if (typeof reason !== "string") return "unknown-terminator";
    const normalized = reason.trim().toLowerCase();
    if (normalized.length === 0) return "unknown-terminator";
    reasons.push(normalized);
  }
  if (reasons.length === 0) return "missing";
  const kinds = reasons.map((reason) => {
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

/**
 * A provider-side settlement that should use the product floor without
 * advancing the scenario-wide failure governor.
 */
export class NeutralProviderError extends Error {}

/**
 * A provider attempt exhausted the window assigned to that attempt.
 *
 * The pool and scenario each enforce their own deadline because either layer
 * may be used independently. When both timers represent the same final
 * boundary, their callback order is deliberately not part of the contract. If
 * this error escapes the pool, no candidate produced an answer the scenario
 * could accept inside the usable request budget. Infrastructure already has
 * stable precedence over a later semantic rejection, so either timer observer
 * must settle that escaping timeout as MODEL_TIMEOUT.
 */
export class CandidateAttemptTimeoutError extends Error {
  constructor() {
    super("The model relay did not answer inside its attempt window.");
    this.name = "CandidateAttemptTimeoutError";
  }
}

export class UnusableCompletionError extends NeutralProviderError {
  constructor(readonly code: UnusableCompletionCode) {
    super(`The relay returned no usable final text: ${code}.`);
    this.name = "UnusableCompletionError";
  }
}

/** No new attempt may start while cancelled transports for the pool drain. */
export class PoolDrainingError extends NeutralProviderError {
  constructor() {
    super("The model pool is still draining cancelled transport work.");
    this.name = "PoolDrainingError";
  }
}

/** Every transport answered, but no candidate satisfied scenario policy. */
export class CandidateRejectedError extends NeutralProviderError {
  constructor(readonly reason: string) {
    super("No model candidate satisfied the scenario policy.");
    this.name = "CandidateRejectedError";
  }
}

/** A local adjudicator defect is not evidence against any provider. */
export class ScenarioPolicyError extends NeutralProviderError {
  constructor() {
    super("The scenario policy could not adjudicate a provider answer.");
    this.name = "ScenarioPolicyError";
  }
}
