import { handleInquiryRequest, inquiryErrorResponse } from "@/features/matter/server/inquiry-route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleInquiryRequest(request);
  } catch (error) {
    return inquiryErrorResponse(error);
  }
}
