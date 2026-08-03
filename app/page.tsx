import { Suspense } from "react";
import { ArrowApp } from "@/features/arrow/components/ArrowApp";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ArrowApp />
    </Suspense>
  );
}
