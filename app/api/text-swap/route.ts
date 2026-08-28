import {
  handleTextSwapRequest,
  textSwapErrorResponse,
} from "@/features/matter/server/text-swap-route";

export const runtime = "nodejs";
// Next statically extracts this value and does not accept imported expressions.
export const maxDuration = 25;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleTextSwapRequest(request);
  } catch (error) {
    return textSwapErrorResponse(error);
  }
}
