import type { MetadataRoute } from "next";
import {
  MATTER_BASE_PATH,
  MATTER_PUBLIC_ORIGIN,
  MATTER_SITEMAP_URL,
} from "@/features/matter/seo/site";

const CRAWLER_USER_AGENTS = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-Video",
  "ChatGPT-User",
  "GPTBot",
  "OAI-SearchBot",
  "BingBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Applebot",
  "Bytespider",
  "Bytedance",
  "TikTokBot",
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "DuckAssistBot",
  "PetalBot",
  "YandexBot",
  "Baiduspider",
  "Sogou",
  "360Spider",
  "Yeti",
  "FacebookExternalHit",
  "Twitterbot",
  "LinkedInBot",
  "ia_archiver",
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DeepSeek",
  "Google-Extended",
  "cohere-ai",
] as const;

const matterPath = (suffix: string): string =>
  MATTER_BASE_PATH === "" ? suffix : `${MATTER_BASE_PATH}${suffix}`;

const DISALLOWED_PATHS = [
  matterPath("/api/"),
  matterPath("/performance"),
];

type MatterRobotsRule = {
  userAgent: string;
  allow: string;
  disallow: string[];
};

const rules = (userAgent: string): MatterRobotsRule => ({
  userAgent,
  allow: "/",
  disallow: DISALLOWED_PATHS,
});

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [rules("*"), ...CRAWLER_USER_AGENTS.map(rules)],
    host: MATTER_PUBLIC_ORIGIN,
    sitemap: MATTER_SITEMAP_URL,
  };
}
