import { imageErrorResponse } from "@/features/matter/server/image-errors";
import { handleImageRequest } from "@/features/matter/server/image-route";

export const runtime = "nodejs";
// Next statically extracts this value and does not accept imported expressions.
// It must equal MODEL_DEADLINES.image.platformSeconds.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleImageRequest(request);
  } catch (error) {
    return imageErrorResponse(error);
  }
}
