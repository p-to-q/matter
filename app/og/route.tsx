import { ImageResponse } from "next/og";
import {
  MATTER_PRODUCT_TAGLINE,
  MATTER_PRODUCT_TITLE,
} from "@/features/matter/seo/site";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          backgroundColor: "#d9dcde",
          color: "#161d27",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "70px 76px 62px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 1 }}>
          matter
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 56, lineHeight: 1.08 }}>
            <div style={{ display: "flex" }}>An interface for</div>
            <div style={{ display: "flex" }}>unfinished thought</div>
          </div>
          <div style={{ color: "#58616a", display: "flex", fontSize: 27 }}>
            {MATTER_PRODUCT_TAGLINE}
          </div>
        </div>
        <div style={{ color: "#58616a", display: "flex", fontSize: 21 }}>
          {MATTER_PRODUCT_TITLE}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
