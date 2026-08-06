import { ImageResponse } from "next/og";
import { MATTER_ICON_MARK_RATIO, MATTER_INK, matterMarkDataUri } from "./icon-mark";

/**
 * One ink tile with the mark centred, rendered at whatever square a platform
 * asks for. Corner rounding is deliberately absent: iOS masks its own corners
 * and an Android maskable icon is cropped to the launcher's shape, so a
 * full-bleed square is the only artwork that is correct everywhere. The rounded
 * tile belongs to `app/icon.svg` alone, where the browser draws it as supplied.
 */
export function matterIconImage(size: number): ImageResponse {
  const mark = Math.round(size * MATTER_ICON_MARK_RATIO);
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          backgroundColor: MATTER_INK,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        {/* Satori JSX, not the DOM: `next/image` has nothing to optimise here,
            and the source is an inline data URI that never leaves the build. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" height={mark} src={matterMarkDataUri()} width={mark} />
      </div>
    ),
    { width: size, height: size },
  );
}
