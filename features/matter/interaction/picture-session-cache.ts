import type { GeneratedPicture } from "../runtime/picture-turn";
import {
  MAX_TREE_IMAGE_BYTES,
  MAX_TREE_IMAGE_NODES,
  cloneImagePointer,
  parseImagePointer,
} from "../tree/image-pointer";

/**
 * A convenience mirror of picture bytes the store holds or tried to hold, never
 * an authority: it is lost on reload, and nothing may treat a miss here as
 * absence. It exists so a picture that could not be saved, and an export while
 * IndexedDB is unavailable, can still reach the screen and the archive.
 */
export type PictureSessionCache = Readonly<{
  /** False, storing nothing, when the pointer is invalid or does not describe the bytes. */
  put(picture: GeneratedPicture): boolean;
  /** Atomic non-evicting admission: a refusal preserves every held byte. */
  putBatchIfRoom(pictures: readonly GeneratedPicture[]): boolean;
  get(contentHash: string): GeneratedPicture | undefined;
  has(contentHash: string): boolean;
  delete(contentHash: string): boolean;
  /** Independent copies: later puts, evictions, and byte edits never reach a snapshot. */
  snapshot(): ReadonlyMap<string, Uint8Array>;
}>;

export type PictureSessionCacheLimits = Readonly<{
  maxEntries: number;
  maxBytes: number;
}>;

export const DEFAULT_PICTURE_SESSION_CACHE_LIMITS: PictureSessionCacheLimits = Object.freeze({
  maxEntries: MAX_TREE_IMAGE_NODES,
  maxBytes: MAX_TREE_IMAGE_BYTES,
});

export function createPictureSessionCache(
  limits: PictureSessionCacheLimits = DEFAULT_PICTURE_SESSION_CACHE_LIMITS,
): PictureSessionCache {
  // Map iteration is insertion order, so the first key is always the oldest.
  const entries = new Map<string, GeneratedPicture>();
  let totalBytes = 0;

  const remove = (contentHash: string): boolean => {
    const held = entries.get(contentHash);
    if (held === undefined) return false;
    entries.delete(contentHash);
    totalBytes -= held.bytes.byteLength;
    return true;
  };

  return Object.freeze({
    putBatchIfRoom(pictures) {
      const pending = new Map<string, GeneratedPicture>();
      let nextBytes = totalBytes;
      let nextEntries = entries.size;
      for (const picture of pictures) {
        const pointer = parseImagePointer(picture.pointer);
        if (pointer === null || !(picture.bytes instanceof Uint8Array) ||
          picture.bytes.byteLength !== pointer.byteLength || pointer.byteLength > limits.maxBytes) return false;
        const previous = pending.get(pointer.contentHash) ?? entries.get(pointer.contentHash);
        if (previous === undefined) nextEntries += 1;
        nextBytes += pointer.byteLength - (previous?.pointer.byteLength ?? 0);
        pending.set(pointer.contentHash, { pointer, bytes: picture.bytes });
      }
      if (nextEntries > limits.maxEntries || nextBytes > limits.maxBytes) return false;
      // Allocate the complete accepted batch before changing any existing holder.
      for (const [hash, picture] of pending) {
        pending.set(hash, Object.freeze({ pointer: picture.pointer, bytes: picture.bytes.slice() }));
      }
      for (const [hash, picture] of pending) entries.set(hash, picture);
      totalBytes = nextBytes;
      return true;
    },
    put(picture) {
      const pointer = parseImagePointer(picture.pointer);
      if (
        pointer === null ||
        !(picture.bytes instanceof Uint8Array) ||
        picture.bytes.byteLength !== pointer.byteLength ||
        pointer.byteLength > limits.maxBytes
      ) return false;
      // A repeated hash is a refresh, so the newest accepted picture is evicted last.
      remove(pointer.contentHash);
      entries.set(pointer.contentHash, Object.freeze({ bytes: picture.bytes.slice(), pointer }));
      totalBytes += pointer.byteLength;
      for (const oldest of entries.keys()) {
        if (entries.size <= limits.maxEntries && totalBytes <= limits.maxBytes) break;
        remove(oldest);
      }
      return true;
    },
    get(contentHash) {
      const held = entries.get(contentHash);
      return held === undefined
        ? undefined
        : Object.freeze({ bytes: held.bytes.slice(), pointer: cloneImagePointer(held.pointer) });
    },
    has: (contentHash) => entries.has(contentHash),
    delete: remove,
    snapshot() {
      const copy = new Map<string, Uint8Array>();
      for (const [contentHash, held] of entries) copy.set(contentHash, held.bytes.slice());
      return copy;
    },
  });
}
