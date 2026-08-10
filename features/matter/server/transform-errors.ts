import type {
  TransformErrorCode,
  TransformErrorEnvelope,
  TransformFallbackReason,
} from "../protocol/transform-contract";

export class TransformServerError extends Error {
  constructor(
    readonly code: TransformErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly fallbackReason?: TransformFallbackReason,
  ) {
    super(message);
    this.name = "TransformServerError";
  }

  envelope(): TransformErrorEnvelope {
    return Object.freeze({ error: Object.freeze({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.fallbackReason === undefined ? {} : { fallbackReason: this.fallbackReason }),
    }) });
  }
}

export function invalidTransformRequest(message: string): TransformServerError {
  return new TransformServerError("INVALID_REQUEST", message, false, 400);
}
