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
