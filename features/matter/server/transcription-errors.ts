import type {
  TranscriptionErrorCode,
  TranscriptionErrorEnvelope,
} from "./transcription-contract";

export class TranscriptionServerError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly interactionId?: string,
    readonly attempt?: number,
  ) {
    super(message);
  }
}

export function transcriptionErrorResponse(error: unknown): Response {
  const known =
    error instanceof TranscriptionServerError
      ? error
      : new TranscriptionServerError(
          "TRANSCRIPTION_FAILED",
          "The recording could not be transcribed.",
          true,
          500,
        );
  const body: TranscriptionErrorEnvelope = {
    error: {
      code: known.code,
      message: known.message,
      retryable: known.retryable,
      ...(known.interactionId === undefined
        ? {}
        : { interactionId: known.interactionId }),
      ...(known.attempt === undefined ? {} : { attempt: known.attempt }),
    },
  };
  return Response.json(body, { status: known.status });
}
