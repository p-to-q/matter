import { normalizeMatterBasePath } from "../config/base-path";

export const MATTER_PRODUCT_NAME = "Matter";
export const MATTER_PRODUCT_TITLE =
  "Matter — An interface for unfinished thought";
export const MATTER_PRODUCT_DESCRIPTION =
  "Matter gives unfinished thought a material form: speak it into a rooted field, touch exact language, and make one local, reversible change.";
export const MATTER_PRODUCT_TAGLINE =
  "AI gives language intelligence. Matter gives thought a body.";
export const MATTER_SITE_LAST_UPDATED_ISO = "2026-08-24";

/**
 * Search terms describe the product's category and language without replacing
 * its canonical definition with a generic AI-writing label.
 */
export const MATTER_PRODUCT_KEYWORDS = Object.freeze([
  "unfinished thought",
  "material interface",
  "thinking with AI",
  "spatial AI interface",
  "voice and gesture interface",
  "material thinking",
  "AI thinking tool",
]);

export type MatterPublicEnvironment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_MATTER_PUBLIC_ORIGIN = "https://www.ptoq.io";
export const LOCAL_MATTER_PUBLIC_ORIGIN = "http://localhost:3000";

function parseOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function parseHost(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return parseOrigin(candidate);
}

export function resolveMatterPublicOrigin(
  environment: MatterPublicEnvironment = process.env,
): string {
  const explicit =
    parseOrigin(environment.MATTER_PUBLIC_ORIGIN) ??
    parseOrigin(environment.NEXT_PUBLIC_BASE_URL);
  if (explicit) return explicit;

  if (environment.VERCEL_ENV === "production") {
    return parseHost(environment.VERCEL_PROJECT_PRODUCTION_URL) ?? DEFAULT_MATTER_PUBLIC_ORIGIN;
  }

  return parseHost(environment.VERCEL_URL) ?? LOCAL_MATTER_PUBLIC_ORIGIN;
}

export function resolveMatterSiteUrl(
  environment: MatterPublicEnvironment = process.env,
  basePath = normalizeMatterBasePath(undefined),
): string {
  const origin = resolveMatterPublicOrigin(environment);
  const normalizedBasePath = normalizeMatterBasePath(basePath);
  return normalizedBasePath === "" ? origin : `${origin}${normalizedBasePath}`;
}

export function matterUrl(path: string, siteUrl = MATTER_SITE_URL): string {
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${suffix}`;
}

export const MATTER_PUBLIC_ORIGIN = resolveMatterPublicOrigin();
export const MATTER_BASE_PATH = normalizeMatterBasePath(
  process.env.MATTER_BASE_PATH ?? "/matter",
);
export const MATTER_SITE_URL = resolveMatterSiteUrl(process.env, MATTER_BASE_PATH);
export const MATTER_OG_IMAGE_URL = matterUrl("/og");
export const MATTER_MANIFEST_URL = matterUrl("/manifest.webmanifest");
export const MATTER_ROBOTS_URL = matterUrl("/robots.txt");
export const MATTER_SITEMAP_URL = matterUrl("/sitemap.xml");
export const MATTER_LLMS_URL = matterUrl("/llms.txt");
export const MATTER_LLMS_FULL_URL = matterUrl("/llms-full.txt");
