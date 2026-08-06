import {
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_KEYWORDS,
  MATTER_PRODUCT_NAME,
  MATTER_SITE_URL,
} from "./site";

const P_TO_Q_URL = "https://www.ptoq.io";
const P_TO_Q_GITHUB_URL = "https://github.com/p-to-q/site";

export type MatterSchemaOrgGraph = Readonly<{
  "@context": "https://schema.org";
  "@graph": readonly Record<string, unknown>[];
}>;

export function getMatterSchemaOrgGraph(
  siteUrl = MATTER_SITE_URL,
): MatterSchemaOrgGraph {
  const organizationId = `${P_TO_Q_URL}/#organization`;
  const websiteId = `${siteUrl}/#website`;
  const applicationId = `${siteUrl}/#application`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "[p → q]",
        legalName: "Wooden Computer Co., Ltd.",
        url: P_TO_Q_URL,
        sameAs: [P_TO_Q_URL, P_TO_Q_GITHUB_URL],
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: MATTER_PRODUCT_NAME,
        url: siteUrl,
        description: MATTER_PRODUCT_DESCRIPTION,
        publisher: { "@id": organizationId },
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": applicationId,
        name: MATTER_PRODUCT_NAME,
        url: siteUrl,
        description: MATTER_PRODUCT_DESCRIPTION,
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires a modern web browser with pointer and microphone support.",
        keywords: MATTER_PRODUCT_KEYWORDS.join(", "),
        publisher: { "@id": organizationId },
        isPartOf: { "@id": websiteId },
      },
    ],
  };
}
