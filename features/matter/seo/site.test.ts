import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATTER_PUBLIC_ORIGIN,
  LOCAL_MATTER_PUBLIC_ORIGIN,
  MATTER_PRODUCT_KEYWORDS,
  MATTER_SITE_LAST_UPDATED_ISO,
  MATTER_SITE_URL,
  matterUrl,
  resolveMatterPublicOrigin,
  resolveMatterSiteUrl,
} from "./site";

describe("Matter public URL configuration", () => {
  it("dates public discovery to the current published preview", () => {
    expect(MATTER_SITE_LAST_UPDATED_ISO).toBe("2026-08-24");
  });

  it("publishes one stable entry per search phrase", () => {
    expect(new Set(MATTER_PRODUCT_KEYWORDS).size).toBe(MATTER_PRODUCT_KEYWORDS.length);
  });

  it("prefers an explicit Matter origin and strips no valid origin data", () => {
    expect(resolveMatterPublicOrigin({
      MATTER_PUBLIC_ORIGIN: "https://matter.example",
      NEXT_PUBLIC_BASE_URL: "https://fallback.example",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "fallback.vercel.app",
    })).toBe("https://matter.example");
  });

  it("accepts the reference site's base URL as a fallback", () => {
    expect(resolveMatterPublicOrigin({
      NEXT_PUBLIC_BASE_URL: "https://www.ptoq.io",
    })).toBe("https://www.ptoq.io");
  });

  it("uses the production deployment host before the stable fallback", () => {
    expect(resolveMatterPublicOrigin({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "matter-prod.vercel.app",
    })).toBe("https://matter-prod.vercel.app");
    expect(resolveMatterPublicOrigin({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "https://matter-prod.example",
    })).toBe("https://matter-prod.example");
    expect(resolveMatterPublicOrigin({ VERCEL_ENV: "production" })).toBe(
      DEFAULT_MATTER_PUBLIC_ORIGIN,
    );
  });

  it("uses a preview deployment host, then localhost", () => {
    expect(resolveMatterPublicOrigin({
      VERCEL_ENV: "preview",
      VERCEL_URL: "matter-preview.vercel.app",
    })).toBe("https://matter-preview.vercel.app");
    expect(resolveMatterPublicOrigin({ VERCEL_ENV: "development" })).toBe(
      LOCAL_MATTER_PUBLIC_ORIGIN,
    );
  });

  it("rejects path-bearing or non-http origins instead of making them canonical", () => {
    expect(resolveMatterPublicOrigin({
      MATTER_PUBLIC_ORIGIN: "https://matter.example/matter",
      NEXT_PUBLIC_BASE_URL: "ftp://matter.example",
    })).toBe(LOCAL_MATTER_PUBLIC_ORIGIN);
  });

  it("keeps mount and dedicated-domain URLs on one resolver", () => {
    expect(resolveMatterSiteUrl({ MATTER_PUBLIC_ORIGIN: "https://matter.example" }, "/matter"))
      .toBe("https://matter.example/matter");
    expect(resolveMatterSiteUrl({ MATTER_PUBLIC_ORIGIN: "https://matter.example" }, ""))
      .toBe("https://matter.example");
    expect(resolveMatterSiteUrl({ MATTER_PUBLIC_ORIGIN: "https://matter.example" }, "/matter/"))
      .toBe("https://matter.example/matter");
  });

  it("adds discovery paths without creating double slashes", () => {
    expect(matterUrl("/sitemap.xml", "https://matter.example/matter"))
      .toBe("https://matter.example/matter/sitemap.xml");
    expect(matterUrl("sitemap.xml", "https://matter.example"))
      .toBe("https://matter.example/sitemap.xml");
    expect(MATTER_SITE_URL).not.toMatch(/\/$/);
  });
});
