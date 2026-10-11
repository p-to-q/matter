export type ImageErrorCode =
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "IMAGE_REJECTED"
  | "IMAGE_UNAVAILABLE"
  | "IMAGE_FAILED";

export type ImageErrorEnvelope = Readonly<{
  error: Readonly<{
    code: ImageErrorCode;
    message: string;
    retryable: boolean;
  }>;
}>;

/**
 * Errors stay JSON so a client branches on content type: success is the image's
 * own bytes, anything else is this envelope. It carries no passage, brief,
 * prompt, provider identity, or image.
 */
export class ImageServerError extends Error {
  constructor(
    readonly code: ImageErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImageServerError";
  }

  envelope(): ImageErrorEnvelope {
    return Object.freeze({ error: Object.freeze({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    }) });
  }
}

export function invalidImageRequest(message: string): ImageServerError {
  return new ImageServerError("INVALID_REQUEST", message, false, 400);
}

export function imageErrorResponse(error: unknown): Response {
  const known = error instanceof ImageServerError
    ? error
    : new ImageServerError("IMAGE_FAILED", "Matter could not draw this passage just now.", true, 500);
  return Response.json(known.envelope(), {
    status: known.status,
    headers: { "Cache-Control": "no-store" },
  });
}
