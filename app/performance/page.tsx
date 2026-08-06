import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PerformanceMatterApp } from "@/features/matter/components/PerformanceMatterApp";

export const metadata: Metadata = {
  title: "Performance fixture",
  robots: { index: false, follow: false },
};

export default function PerformancePage() {
  if (process.env.MATTER_PERFORMANCE_FIXTURE !== "true") notFound();
  return <PerformanceMatterApp />;
}
