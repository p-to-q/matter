import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: "Matter — p → q",
  description: "Make thought matter.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${departureMono.variable} ${plantinNow.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
