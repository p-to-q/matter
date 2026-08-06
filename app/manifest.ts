import type { MetadataRoute } from "next";
import {
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_NAME,
  MATTER_SITE_URL,
  matterUrl,
} from "@/features/matter/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: MATTER_PRODUCT_NAME,
    short_name: "Matter",
    description: MATTER_PRODUCT_DESCRIPTION,
    start_url: MATTER_SITE_URL,
    scope: `${MATTER_SITE_URL}/`,
    id: MATTER_SITE_URL,
    display: "browser",
    background_color: "#d9dcde",
    theme_color: "#d9dcde",
    icons: [{
      src: matterUrl("/icon.svg"),
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    }],
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    related_applications: [],
  };
}
