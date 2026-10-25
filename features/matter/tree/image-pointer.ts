import { SHA256_HEX } from "./sha256";

/**
 * The single owner of what a picture may be: its media types, byte bound and
 * side bounds. The wire contract, the byte inspector, the transports and the
 * archive import these; none restates them.
 */
export const IMAGE_POINTER_MEDIA_TYPES =Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);
export type ImagePointerMediaType = (typeof IMAGE_POINTER_MEDIA_TYPES)[number];

export const MAX_IMAGE_POINTER_BYTES = 2 * 1024 * 1024;
export const MIN_IMAGE_POINTER_SIDE_PX = 256;
export const MAX_IMAGE_POINTER_SIDE_PX = 4096;
export const MAX_TREE_IMAGE_NODES = 32;
export const MAX_TREE_IMAGE_BYTES = 32 * 1024 * 1024;

const KEYS = ["byteLength", "contentHash", "height", "mediaType", "width"] as const;

/**
 * What a node says about a picture, never the picture. Width and height are
 * required so a document whose bytes are absent keeps the box the image
 * occupied. The fields mirror the image result metadata, which imports the
 * bounds above rather than restating them.
 */
export type ImagePointer = Readonly<{
  mediaType: ImagePointerMediaType;
  byteLength: number;
  width: number;
  height: number;
  contentHash: string;
}>;

/** Exact key set, no extras, every bound enforced. */
export function parseImagePointer(value: unknown): ImagePointer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== KEYS.length || !KEYS.every((key) => keys.includes(key))) return null;
  const candidate = value as Record<(typeof KEYS)[number], unknown>;
  if (!isImagePointerMediaType(candidate.mediaType)) return null;
  if (
    !isIntegerWithin(candidate.byteLength, 1, MAX_IMAGE_POINTER_BYTES) ||
    !isIntegerWithin(candidate.width, MIN_IMAGE_POINTER_SIDE_PX, MAX_IMAGE_POINTER_SIDE_PX) ||
    !isIntegerWithin(candidate.height, MIN_IMAGE_POINTER_SIDE_PX, MAX_IMAGE_POINTER_SIDE_PX)
  ) return null;
  if (typeof candidate.contentHash !== "string" || !SHA256_HEX.test(candidate.contentHash)) return null;
  return {
    mediaType: candidate.mediaType,
    byteLength: candidate.byteLength,
    width: candidate.width,
    height: candidate.height,
    contentHash: candidate.contentHash,
  };
}

/** Value equality; an absent pointer equals `null`. */
export function equalImagePointers(
  left: ImagePointer | null | undefined,
  right: ImagePointer | null | undefined,
): boolean {
  if (left == null || right == null) return (left ?? null) === (right ?? null);
  return (
    left.mediaType === right.mediaType &&
    left.byteLength === right.byteLength &&
    left.width === right.width &&
    left.height === right.height &&
    left.contentHash === right.contentHash
  );
}

export function cloneImagePointer(pointer: ImagePointer): ImagePointer {
  return {
    mediaType: pointer.mediaType,
    byteLength: pointer.byteLength,
    width: pointer.width,
    height: pointer.height,
    contentHash: pointer.contentHash,
  };
}

export function isImagePointerMediaType(value: unknown): value is ImagePointerMediaType {
  return (IMAGE_POINTER_MEDIA_TYPES as readonly unknown[]).includes(value);
}

function isIntegerWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
