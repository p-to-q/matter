import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import { projectImageAvailability, type ImageAvailability } from "../persistence/image-availability";
import type { ImagePointer } from "../tree/image-pointer";
import type { PictureSessionCache } from "./picture-session-cache";

/**
 * What a surface can learn about the bytes behind a pointer right now. The
 * non-resident states are `ImageAvailability` itself, so a surface never
 * re-derives which of them it is looking at.
 */
export type PictureBytesRead =
  | Readonly<{ status: "resident"; bytes: Uint8Array }>
  | Readonly<{ status: Exclude<ImageAvailability, "resident"> }>;

export type PictureBytesSource = Readonly<{
  read(pointer: ImagePointer): Promise<PictureBytesRead>;
}>;

const UNAVAILABLE: PictureBytesRead = Object.freeze({ status: "unavailable" });

/** The source of a tree with no store behind it: nothing is known about any picture. */
export const UNAVAILABLE_PICTURE_BYTES: PictureBytesSource = Object.freeze({
  read: () => Promise.resolve(UNAVAILABLE),
});

/**
 * The session cache answers first because it holds bytes the store was asked to
 * keep, including ones it could not. A miss there proves nothing, so the
 * durable store decides, and its answer passes through the one availability
 * projection.
 */
export function createPictureBytesSource(dependencies: Readonly<{
  cache: PictureSessionCache;
  repository: ImageBlobRepository;
}>): PictureBytesSource {
  return Object.freeze({
    async read(pointer) {
      const held = dependencies.cache.get(pointer.contentHash);
      if (held !== undefined) return Object.freeze({ status: "resident", bytes: held.bytes });
      const read = await dependencies.repository.getImageBlob(pointer.contentHash);
      const availability = projectImageAvailability(read);
      if (availability === "resident") {
        return read.ok && read.value.status === "found"
          ? Object.freeze({ status: "resident", bytes: new Uint8Array(read.value.blob.bytes) })
          : UNAVAILABLE;
      }
      return Object.freeze({ status: availability });
    },
  });
}
