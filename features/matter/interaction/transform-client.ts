import {
  MAX_TRANSFORM_RESPONSE_BYTES,
  TRANSFORM_CLIENT_TIMEOUT_MS,
  parseTransformError,
  parseTransformPlan,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import { clientMatterBasePath } from "../config/base-path";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline } from "./request-deadline";

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
  signal.throwIfAborted();
  const deadline = createRequestDeadline(
    signal,
    TRANSFORM_CLIENT_TIMEOUT_MS,
    "The transform request timed out.",
  );
  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetch(`${clientMatterBasePath()}/api/turn`, {
          method: "POST",
          headers: { accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          cache: "no-store",
          redirect: "error",
          signal: deadline.signal,
        }),
        deadline.settlement,
      ]);
    } catch (error) {
      if (signal.aborted) throw error;
      if (deadline.didTimeout()) {
        throw new TransformClientError(true, "Matter took too long to change this passage.");
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new TransformClientError(true, "Matter could not reach this change.");
    }
    let payload: unknown;
    try {
      payload = await Promise.race([
        readBoundedJsonResponse(response, MAX_TRANSFORM_RESPONSE_BYTES, deadline.signal),
        deadline.settlement,
      ]);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (deadline.didTimeout()) {
        throw new TransformClientError(true, "Matter took too long to change this passage.");
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw invalidResponse(response.ok);
    }
    if (!response.ok) throw readError(payload);
    const plan = parseTransformPlan(payload, envelope);
    if (plan === null) throw new TransformClientError(false, "Matter returned an invalid change.");
    return plan;
  } finally {
    deadline.dispose();
  }
}

function invalidResponse(successStatus: boolean): TransformClientError {
  return new TransformClientError(
    false,
    successStatus
      ? "Matter returned an invalid change."
      : "Matter returned an invalid refusal.",
  );
}

function readError(value: unknown): TransformClientError {
  const parsed = parseTransformError(value);
  return parsed === null
    ? invalidResponse(false)
    : new TransformClientError(parsed.retryable, parsed.message);
}
