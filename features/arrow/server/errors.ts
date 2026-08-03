import { NextResponse } from "next/server";
import type { ArrowApiError, ArrowApiErrorCode } from "../engine/protocol";

export class ArrowServerError extends Error {
  constructor(
    readonly code: ArrowApiErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly interactionId?: string,
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  const known =
    error instanceof ArrowServerError
      ? error
      : new ArrowServerError(
          "INTERNAL_ERROR",
          "The request could not be completed.",
          true,
          500,
        );

  const body: ArrowApiError = {
    error: {
      code: known.code,
      message: known.message,
      retryable: known.retryable,
      interactionId: known.interactionId,
    },
  };

  return NextResponse.json(body, { status: known.status });
}
