import type { ImagePointer } from "../tree/image-pointer";
import { pictureBoxStyle } from "./passage-picture-box";

/**
 * The picture's box before there is anything to show: the same fixed-size frame
 * a loading picture has, derived from the pointer alone. It is both the loading
 * view and the Suspense fallback while the picture code itself loads, so the
 * passage never changes height when either arrives.
 */
export function PicturePlaceholder({ pointer }: Readonly<{ pointer: Pick<ImagePointer, "width" | "height"> }>) {
  return <div aria-hidden="true" className="passage-picture" data-picture-state="loading" style={pictureBoxStyle(pointer)} />;
}
