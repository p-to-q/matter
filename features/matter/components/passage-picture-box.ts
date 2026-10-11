import type { ImagePointer } from "../tree/image-pointer";

/**
 * The box a picture occupies is a fact about its pointer alone, so layout is
 * identical whether the bytes are loading, resident, damaged, or absent. Width
 * is the stylesheet's (`min(100%, 320px)`); only the ratio belongs to the
 * pointer.
 */
export function pictureBoxStyle(
  pointer: Pick<ImagePointer, "width" | "height">,
): Readonly<{ aspectRatio: string }> {
  return Object.freeze({ aspectRatio: `${pointer.width} / ${pointer.height}` });
}

/**
 * Everything about a pointer that changes the height of its passage. A measured
 * height is reusable only while this is equal, so attaching, replacing, or
 * removing a picture can never be mistaken for an unchanged passage.
 */
export function pictureLayoutKey(
  pointer: Pick<ImagePointer, "contentHash" | "width" | "height"> | undefined,
): string | null {
  return pointer === undefined ? null : `${pointer.contentHash}:${pointer.width}x${pointer.height}`;
}
