import { clientMatterBasePath } from "../config/base-path";
import {
  TEXT_SWAP_CLIENT_TIMEOUT_MS,
  parseTextSwapError,
  parseTextSwapPlan,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";

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
  const deadline = AbortSignal.timeout(TEXT_SWAP_CLIENT_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, deadline]);
  let response: Response;
  try {
    response = await fetch(`${clientMatterBasePath()}/api/text-swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: combined,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (deadline.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new TextSwapClientError(true, "Matter took too long to swap this passage.");
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new TextSwapClientError(true, "Matter could not reach this wording change.");
  }
  const payload = await response.json().catch(() => null) as unknown;
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
}

function readError(value: unknown): TextSwapClientError {
  const parsed = parseTextSwapError(value);
  return parsed === null
    ? new TextSwapClientError(false, "Matter returned an invalid refusal.", "invalid-response")
    : new TextSwapClientError(parsed.retryable, parsed.message);
}
