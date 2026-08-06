import type { MetadataRoute } from "next";
import {
  MATTER_SITE_LAST_UPDATED_ISO,
  MATTER_SITE_URL,
} from "@/features/matter/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: MATTER_SITE_URL,
    lastModified: MATTER_SITE_LAST_UPDATED_ISO,
    changeFrequency: "monthly",
    priority: 1,
  }];
}
