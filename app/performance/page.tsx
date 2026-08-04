import { notFound } from "next/navigation";
import { PerformanceMatterApp } from "@/features/matter/components/PerformanceMatterApp";

export default function PerformancePage() {
  if (process.env.MATTER_PERFORMANCE_FIXTURE !== "true") notFound();
  return <PerformanceMatterApp />;
}
