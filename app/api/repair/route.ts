import { handleRepairRequest, repairErrorResponse } from "@/features/matter/server/repair-route";

export const runtime = "nodejs";
// Repair may spend 8 s with the pool; durable admitted words already exist.
// Next statically extracts this value and does not accept imported expressions.
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleRepairRequest(request);
  } catch (error) {
    return repairErrorResponse(error);
  }
}
