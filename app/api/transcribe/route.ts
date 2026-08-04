import { handleTranscriptionRequest } from "@/features/matter/server/transcription-route";
import { transcriptionErrorResponse } from "@/features/matter/server/transcription-errors";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleTranscriptionRequest(request);
  } catch (error) {
    return transcriptionErrorResponse(error);
  }
}
