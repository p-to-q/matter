import type { ScenarioAdapter } from "./harness";
import { resolvePoolAdapter } from "./model-pool";

/**
 * The inquiry preview deliberately shares the existing server-side model pool.
 * The separate switch keeps naming, repair, and inquiry authority independently
 * gated; credentials and provider identity never cross the route boundary.
 *
 * There is no fixture adapter here, unlike labelling and repair. Those two have
 * a correct answer without a model, so a fixture only proves plumbing. An
 * inquiry does not: a fixture answer would be invented prose arriving in the
 * one place this product refuses to invent prose, and "the model is not
 * configured" is the honest thing to show instead.
 */
export function resolveInquiryAdapter(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScenarioAdapter | null {
  if (environment.MATTER_INQUIRY_ADAPTER !== "live") return null;
  return resolvePoolAdapter(environment, {
    minimumAttemptMs: 600,
    maxOutputTokens: 720,
    maxResponseBytes: 32 * 1_024,
    failuresBeforeCooldown: 2,
    cooldownMs: 60_000,
  });
}
