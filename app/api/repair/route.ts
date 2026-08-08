import { handleRepairRequest, repairErrorResponse } from "@/features/matter/server/repair-route";

export const runtime = "nodejs";
// Repair may spend 6 s with the pool before it admits the words as heard.
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleRepairRequest(request);
  } catch (error) {
    return repairErrorResponse(error);
  }
}
