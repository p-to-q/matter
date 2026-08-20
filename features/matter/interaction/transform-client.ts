import {
  TRANSFORM_CLIENT_TIMEOUT_MS,
  parseTransformError,
  parseTransformPlan,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import { clientMatterBasePath } from "../config/base-path";

export class TransformClientError extends Error {
  constructor(readonly retryable: boolean, message: string) {
    super(message);
    this.name = "TransformClientError";
  }
}

/** The browser only transports one already-validated envelope and accepts one plan. */
export async function requestTransform(
  envelope: TransformEnvelope,
  signal: AbortSignal,
): Promise<TransformPlan> {
  const deadline = AbortSignal.timeout(TRANSFORM_CLIENT_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, deadline]);
  let response: Response;
  try {
    response = await fetch(`${clientMatterBasePath()}/api/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: combined,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (deadline.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new TransformClientError(true, "Matter took too long to change this passage.");
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new TransformClientError(true, "Matter could not reach this change.");
  }
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw readError(payload);
  const plan = parseTransformPlan(payload, envelope);
  if (plan === null) throw new TransformClientError(false, "Matter returned an invalid change.");
  return plan;
}

function readError(value: unknown): TransformClientError {
  const parsed = parseTransformError(value);
  return parsed === null
    ? new TransformClientError(false, "Matter returned an invalid refusal.")
    : new TransformClientError(parsed.retryable, parsed.message);
}
