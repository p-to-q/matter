import { matterIconImage } from "@/features/matter/brand/icon-image";

/** Fixed artwork: prerender it once at build rather than per request. */
export const dynamic = "force-static";

/**
 * The manifest's install icons are their own routes rather than Next's icon
 * file convention, because the manifest has to name them by URL and that URL
 * must carry the deployment's base path. `matterUrl` owns that; the convention
 * does not expose it.
 */
export function GET() {
  return matterIconImage(192);
}
