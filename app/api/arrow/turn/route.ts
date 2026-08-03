import { NextResponse } from "next/server";
import { interactionEnvelopeSchema } from "@/features/arrow/engine/schemas";
import { apiErrorResponse, ArrowServerError } from "@/features/arrow/server/errors";
import { planInteraction } from "@/features/arrow/server/planner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 64 * 1024) {
      throw new ArrowServerError(
        "INVALID_INTERACTION",
        "The canvas turn is too large.",
        false,
        413,
      );
    }
    const parsed = interactionEnvelopeSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ArrowServerError(
        "INVALID_INTERACTION",
        "The canvas turn was incomplete.",
        false,
        400,
      );
    }

    return NextResponse.json(await planInteraction(parsed.data));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
