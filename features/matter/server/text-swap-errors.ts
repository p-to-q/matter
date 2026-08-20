import type {
  TextSwapErrorCode,
  TextSwapErrorEnvelope,
  TextSwapFallbackReason,
} from "../protocol/text-swap-contract";

export class TextSwapServerError extends Error {
  constructor(
    readonly code: TextSwapErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly fallbackReason?: TextSwapFallbackReason,
  ) {
    super(message);
    this.name = "TextSwapServerError";
  }

  envelope(): TextSwapErrorEnvelope {
    return Object.freeze({ error: Object.freeze({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.fallbackReason === undefined ? {} : { fallbackReason: this.fallbackReason }),
    }) });
  }
}

export function invalidTextSwapRequest(message: string): TextSwapServerError {
  return new TextSwapServerError("INVALID_REQUEST", message, false, 400);
}
