import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getMatterSchemaOrgGraph } from "@/features/matter/seo/schema-org";
import {
  MATTER_MANIFEST_URL,
  MATTER_OG_IMAGE_URL,
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_KEYWORDS,
  MATTER_PRODUCT_NAME,
  MATTER_PRODUCT_TITLE,
  MATTER_PUBLIC_ORIGIN,
  MATTER_SITE_URL,
} from "@/features/matter/seo/site";

const departureMono = localFont({
  display: "swap",
  src: "../public/matter-ui/DepartureMono-Regular.woff2",
  variable: "--font-departure-mono",
  weight: "400",
});

const plantinNow = localFont({
  display: "swap",
  preload: false,
  src: "../public/matter-ui/PlantinNowVariable-Upright.woff2",
  variable: "--font-plantin-now",
  weight: "200 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(MATTER_PUBLIC_ORIGIN),
  title: {
    default: MATTER_PRODUCT_TITLE,
    template: "%s | Matter",
  },
  description: MATTER_PRODUCT_DESCRIPTION,
  manifest: MATTER_MANIFEST_URL,
  applicationName: MATTER_PRODUCT_NAME,
  keywords: [...MATTER_PRODUCT_KEYWORDS],
  authors: [{ name: "[p → q]", url: "https://www.ptoq.io" }],
  creator: "[p → q]",
  publisher: "[p → q]",
  category: "design",
  formatDetection: { telephone: false },
  referrer: "no-referrer",
  openGraph: {
    type: "website",
    siteName: MATTER_PRODUCT_NAME,
    locale: "en_US",
    title: MATTER_PRODUCT_TITLE,
    description: MATTER_PRODUCT_DESCRIPTION,
    url: MATTER_SITE_URL,
    images: [{
      url: MATTER_OG_IMAGE_URL,
      width: 1200,
      height: 630,
      alt: MATTER_PRODUCT_TITLE,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: MATTER_PRODUCT_TITLE,
    description: MATTER_PRODUCT_DESCRIPTION,
    images: [MATTER_OG_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#d9dcde",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const schema = getMatterSchemaOrgGraph();

  return (
    <html
      className={`${departureMono.variable} ${plantinNow.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
