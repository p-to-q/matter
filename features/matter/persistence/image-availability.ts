import type { ImageBlobRead, ImageBlobResult } from "./image-blob-repository";

/**
 * What can be said about the bytes behind a pointer right now. Derived on every
 * read and never stored: availability is a fact about this browser at this
 * moment, and storing it would let a stale answer outlive the cache it described.
 *
 * - `resident`: an intact row is held.
 * - `absent`: no row. Legal; an imported archive may omit bytes.
 * - `damaged`: a row exists but cannot be trusted. Never reported as absent, so
 *   nothing treats it as free to overwrite blindly or as proof of loss.
 * - `unavailable`: the store could not be consulted, so nothing is known. Not
 *   evidence the bytes are gone.
 */
export type ImageAvailability = "resident" | "absent" | "damaged" | "unavailable";

export function projectImageAvailability(read: ImageBlobResult<ImageBlobRead>): ImageAvailability {
  if (!read.ok) return "unavailable";
  switch (read.value.status) {
    case "found": return "resident";
    case "absent": return "absent";
    case "damaged": return "damaged";
  }
}
