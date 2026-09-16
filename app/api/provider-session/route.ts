import {
  connectProviderSession,
  getProviderSessionStatus,
  removeProviderSession,
} from "@/features/matter/server/provider-session-route";

export const runtime = "nodejs";
export const maxDuration = 10;

export function GET(request: Request): Promise<Response> {
  return getProviderSessionStatus(request);
}

export function POST(request: Request): Promise<Response> {
  return connectProviderSession(request);
}

export function DELETE(request: Request): Response {
  return removeProviderSession(request);
}
