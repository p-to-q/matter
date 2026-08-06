import type { MetadataRoute } from "next";
import {
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_NAME,
  MATTER_SITE_URL,
  matterUrl,
} from "@/features/matter/seo/site";

/**
 * Installability is claimed at the manifest layer only. `standalone` plus a
 * 192 and a 512 icon is what Chrome reads to offer "Install app"; no service
 * worker is registered, so the installed window is the same online surface in
 * its own frame, not an offline copy. Durability already lives in IndexedDB,
 * and a cache layer would add its own versioning and update story for a product
 * whose mobile/web split is still undecided.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: MATTER_PRODUCT_NAME,
    short_name: "Matter",
    description: MATTER_PRODUCT_DESCRIPTION,
    start_url: MATTER_SITE_URL,
    scope: `${MATTER_SITE_URL}/`,
    id: MATTER_SITE_URL,
    display: "standalone",
    background_color: "#d9dcde",
    // The address bar meets the top of the page, so this follows the field
    // rather than the icon's ink.
    theme_color: "#d9dcde",
    icons: [
      {
        src: matterUrl("/icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: matterUrl("/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: matterUrl("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // The mark sits well inside the central 80% a launcher may crop to, so
      // the same square serves as the maskable icon.
      {
        src: matterUrl("/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    related_applications: [],
  };
}
