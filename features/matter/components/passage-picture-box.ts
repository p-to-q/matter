import type { CSSProperties } from "react";
import type { ImagePointer } from "../tree/image-pointer";

/**
 * The box a picture occupies is a fact about its pointer alone, so layout is
 * identical whether the bytes are loading, resident, damaged, or absent. The
 * pointer supplies the ratio; the stylesheet turns it into a width that follows
 * the capped height (`min(320px, 60vh)` in a passage, 248px in the field), so a
 * tall picture is narrower, never taller than the cap, and never cropped.
 */
export function pictureBoxStyle(
  pointer: Pick<ImagePointer, "width" | "height">,
): CSSProperties {
  return Object.freeze({
    aspectRatio: `${pointer.width} / ${pointer.height}`,
    "--picture-w": pointer.width,
    "--picture-h": pointer.height,
  }) as CSSProperties;
}

/**
 * Everything about a pointer that changes the height of its passage. A measured
 * height is reusable only while this is equal, so attaching, replacing, or
 * removing a picture can never be mistaken for an unchanged passage. The
 * viewport's height also bounds the box, but a resize drops every measured
 * height, so the key stays the pointer's alone.
 */
export function pictureLayoutKey(
  pointer: Pick<ImagePointer, "contentHash" | "width" | "height"> | undefined,
): string | null {
  return pointer === undefined ? null : `${pointer.contentHash}:${pointer.width}x${pointer.height}`;
}
