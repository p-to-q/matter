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
