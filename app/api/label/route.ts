import { handleLabelRequest, labelErrorResponse } from "@/features/matter/server/label-route";

export const runtime = "nodejs";
// A label may spend 6 s with the pool, and nothing on screen waits for it.
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleLabelRequest(request);
  } catch (error) {
    return labelErrorResponse(error);
  }
}
