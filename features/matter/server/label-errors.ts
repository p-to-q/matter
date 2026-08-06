import type { LabelErrorCode, LabelErrorEnvelope } from "./label-contract";

/**
 * The only error type that may cross the label route boundary. Provider
 * messages and stack traces stay on the server; the browser receives a stable
 * code, a human sentence, and whether retrying could help.
 */
export class LabelServerError extends Error {
  constructor(
    readonly code: LabelErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly operationId?: string,
  ) {
    super(message);
    this.name = "LabelServerError";
  }

  envelope(): LabelErrorEnvelope {
    return Object.freeze({
      error: Object.freeze({
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.operationId === undefined ? {} : { operationId: this.operationId }),
      }),
    });
  }
}

export function invalidLabelRequest(message: string, operationId?: string): LabelServerError {
  return new LabelServerError("INVALID_REQUEST", message, false, 400, operationId);
}
