import { handleHealthRequest } from "@/features/matter/server/health-route";

export const runtime = "nodejs";

export function GET(): Response {
  return handleHealthRequest();
}
