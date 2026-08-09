import type { RepairErrorCode, RepairErrorEnvelope } from "../protocol/repair-contract";

/**
 * The only error type that may cross the repair route boundary. Provider
 * messages, stack traces, and transcript content stay on the server; the
 * browser receives a stable code, a human sentence, and whether retrying could
 * help — which it never needs to, because admission continues without repair.
 */
export class RepairServerError extends Error {
  constructor(
    readonly code: RepairErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly operationId?: string,
  ) {
    super(message);
    this.name = "RepairServerError";
  }

  envelope(): RepairErrorEnvelope {
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

export function invalidRepairRequest(message: string, operationId?: string): RepairServerError {
  return new RepairServerError("INVALID_REQUEST", message, false, 400, operationId);
}
