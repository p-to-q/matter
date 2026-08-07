import { handleRepairRequest, repairErrorResponse } from "@/features/matter/server/repair-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleRepairRequest(request);
  } catch (error) {
    return repairErrorResponse(error);
  }
}
