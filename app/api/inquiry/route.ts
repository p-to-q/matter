import { handleInquiryRequest, inquiryErrorResponse } from "@/features/matter/server/inquiry-route";

export const runtime = "nodejs";
// An inquiry may spend 16 s with the pool and the browser waits 20 s;
// the platform bound has to sit above both or it truncates the answer into a
// transport failure the paper cannot attribute.
export const maxDuration = 25;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleInquiryRequest(request);
  } catch (error) {
    return inquiryErrorResponse(error);
  }
}
