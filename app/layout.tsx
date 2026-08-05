import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matter — p → q",
  description: "Make thought matter.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
