import type { Metadata } from "next";
import { MatterApp } from "@/features/matter/components/MatterApp";
import {
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_TITLE,
  MATTER_SITE_URL,
} from "@/features/matter/seo/site";

export const metadata: Metadata = {
  title: { absolute: MATTER_PRODUCT_TITLE },
  description: MATTER_PRODUCT_DESCRIPTION,
  alternates: { canonical: MATTER_SITE_URL },
};

export default function Page() {
  return (
    <>
      <h1 className="visually-hidden">{MATTER_PRODUCT_TITLE}</h1>
      <MatterApp />
    </>
  );
}
