import { clientMatterBasePath } from "../config/base-path";
import {
  MAX_TEXT_SWAP_RESPONSE_BYTES,
  TEXT_SWAP_CLIENT_TIMEOUT_MS,
  parseTextSwapError,
  parseTextSwapPlan,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";
import { readBoundedJsonResponse } from "./bounded-json-response";
import { createRequestDeadline } from "./request-deadline";

export class TextSwapClientError extends Error {
  constructor(
    readonly retryable: boolean,
    message: string,
    readonly kind: "request-failed" | "invalid-response" = "request-failed",
  ) {
    super(message);
    this.name = "TextSwapClientError";
  }
}

/** One transport attempt. Request ownership, cancellation, and stale authority stay with the caller. */
export async function requestTextSwap(
  envelope: TextSwapEnvelope,
  signal: AbortSignal,
): Promise<TextSwapPlan> {
  signal.throwIfAborted();
  const deadline = createRequestDeadline(
    signal,
    TEXT_SWAP_CLIENT_TIMEOUT_MS,
    "The text swap request timed out.",
  );
  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetch(`${clientMatterBasePath()}/api/text-swap`, {
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
        throw new TextSwapClientError(true, "Matter took too long to swap this passage.");
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new TextSwapClientError(true, "Matter could not reach this wording change.");
    }
    let payload: unknown;
    try {
      payload = await Promise.race([
        readBoundedJsonResponse(response, MAX_TEXT_SWAP_RESPONSE_BYTES, deadline.signal),
        deadline.settlement,
      ]);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (deadline.didTimeout()) {
        throw new TextSwapClientError(true, "Matter took too long to swap this passage.");
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw invalidResponse(response.ok);
    }
    if (!response.ok) throw readError(payload);
    const plan = parseTextSwapPlan(payload, envelope);
    if (plan === null) {
      throw new TextSwapClientError(
        false,
        "Matter returned an invalid wording change.",
        "invalid-response",
      );
    }
    return plan;
  } finally {
    deadline.dispose();
  }
}

function invalidResponse(successStatus: boolean): TextSwapClientError {
  return new TextSwapClientError(
    false,
    successStatus
      ? "Matter returned an invalid wording change."
      : "Matter returned an invalid refusal.",
    "invalid-response",
  );
}

function readError(value: unknown): TextSwapClientError {
  const parsed = parseTextSwapError(value);
  return parsed === null
    ? invalidResponse(false)
    : new TextSwapClientError(parsed.retryable, parsed.message);
}
