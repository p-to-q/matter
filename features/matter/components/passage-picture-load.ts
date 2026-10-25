import type { PictureBytesSource } from "../interaction/picture-bytes-source";
import type { ImagePointer } from "../tree/image-pointer";

export type PictureLoadState =
  | Readonly<{ phase: "resident"; url: string }>
  | Readonly<{ phase: "missing"; reason: "absent" | "damaged" | "unavailable" }>;

export type ObjectUrls = Readonly<{
  create(blob: Blob): string;
  revoke(url: string): void;
}>;

/**
 * The only place a picture's object URL is created. A URL exists from the
 * moment the bytes arrive until the returned disposer runs, and the disposer
 * runs on unmount and on every pointer change, so nothing outlives the passage
 * that showed it. Bytes arriving after disposal create no URL at all.
 *
 * The bytes go into a Blob untouched; a picture is never re-encoded.
 */
export function startPictureLoad(input: Readonly<{
  pointer: ImagePointer;
  source: PictureBytesSource;
  urls: ObjectUrls;
  onChange(state: PictureLoadState): void;
}>): () => void {
  let disposed = false;
  let url: string | null = null;
  input.source.read(input.pointer).then(
    (read) => {
      if (disposed) return;
      if (read.status !== "resident") {
        input.onChange({ phase: "missing", reason: read.status });
        return;
      }
      url = input.urls.create(new Blob([read.bytes as BlobPart], { type: input.pointer.mediaType }));
      input.onChange({ phase: "resident", url });
    },
    () => {
      if (!disposed) input.onChange({ phase: "missing", reason: "unavailable" });
    },
  );
  return () => {
    disposed = true;
    if (url !== null) input.urls.revoke(url);
    url = null;
  };
}
