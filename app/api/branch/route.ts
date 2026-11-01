import { handleBranchRequest } from "@/features/matter/server/branch-route";
export const runtime = "nodejs";
export const maxDuration = 25;
export async function POST(request: Request): Promise<Response> {
  return handleBranchRequest(request);
}
