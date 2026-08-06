import { matterIconImage } from "@/features/matter/brand/icon-image";

/** Fixed artwork: prerender it once at build rather than per request. */
export const dynamic = "force-static";

/** See `icon-192.png/route.tsx` for why these are routes and not the convention. */
export function GET() {
  return matterIconImage(512);
}
