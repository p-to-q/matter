import { handleLabelRequest, labelErrorResponse } from "@/features/matter/server/label-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleLabelRequest(request);
  } catch (error) {
    return labelErrorResponse(error);
  }
}
