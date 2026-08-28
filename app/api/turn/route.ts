import { handleTransformRequest, transformErrorResponse } from "@/features/matter/server/transform-route";

export const runtime = "nodejs";
// Transform may use the complete bounded scenario budget; the platform must
// leave room for the route to translate a terminal result into one plan.
// Next statically extracts this value and does not accept imported expressions.
export const maxDuration = 25;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleTransformRequest(request);
  } catch (error) {
    return transformErrorResponse(error);
  }
}
