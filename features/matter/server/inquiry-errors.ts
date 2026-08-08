import type {
  InquiryErrorCode,
  InquiryErrorEnvelope,
  InquiryFailureReason,
} from "./inquiry-contract";

export class InquiryServerError extends Error {
  constructor(
    readonly code: InquiryErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly reason?: InquiryFailureReason,
  ) {
    super(message);
    this.name = "InquiryServerError";
  }

  envelope(): InquiryErrorEnvelope {
    return Object.freeze({
      error: Object.freeze({
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.reason === undefined ? {} : { reason: this.reason }),
      }),
    });
  }
}

export function invalidInquiryRequest(message: string): InquiryServerError {
  return new InquiryServerError("INVALID_REQUEST", message, false, 400);
}
