import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The same provisional mark as `app/icon.svg`, and it must be edited with it:
 * the path data below is that file's `<g>` verbatim. Two differences are
 * deliberate. iOS masks the corners itself, so this tile is full-bleed rather
 * than rounded, and it cannot invert with the system scheme, so it stays ink.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <g fill="none" stroke="#f5f5f2" stroke-width="2.6" stroke-linecap="round">
    <path d="M10 11.2v13.3M10 16.5h9.6M10 24.5h9.6"/>
    <circle cx="10" cy="8.5" r="2.7" fill="#f5f5f2" stroke="none"/>
    <circle cx="22.4" cy="16.5" r="2.7" fill="#f5f5f2" stroke="none"/>
    <circle cx="22.4" cy="24.5" r="2.7" fill="#f5f5f2" stroke="none"/>
  </g>
</svg>`;

export default function appleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          backgroundColor: "#161d27",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <img
          alt=""
          height={124}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`}
          width={124}
        />
      </div>
    ),
    size,
  );
}
