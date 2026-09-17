/** Human-readable identity for provider completion settlement. */
export const COMPLETION_OUTCOME_POLICY_VERSION = "completion-outcome/1";

/** Closed provider-completion outcomes that can never become Matter text. */
export type UnusableCompletionCode =
  | "truncated"
  | "blocked-or-refused"
  | "tool-or-continuation"
  | "unknown-terminator";

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
