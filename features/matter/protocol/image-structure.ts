import {
  MAX_IMAGE_POINTER_SIDE_PX,
  MIN_IMAGE_POINTER_SIDE_PX,
  type ImagePointerMediaType,
} from "../tree/image-pointer";

/**
 * The structure of generated image bytes: real type from the magic bytes,
 * declared dimensions, and whether the file was cut short. Pure, synchronous and
 * total, with no Node API, so the route that ships the bytes and the browser that
 * archives them judge them with the same code.
 *
 * It never decodes pixels and never alters a byte. The provider's own manifest
 * lives in these bytes, so callers must not re-encode, resize, or strip them.
 */

// Longest side may be at most this many times the shortest side, in either direction.
export const MAX_IMAGE_ASPECT_RATIO = 2;

// Real JPEGs carry a handful of APPn segments (EXIF, ICC, C2PA/JUMBF) before the
// frame header. The cap bounds the scan on a hostile segment chain.
const MAX_JPEG_SEGMENTS = 256;
const ASCII_RIFF = [0x52, 0x49, 0x46, 0x46];
const ASCII_WEBP = [0x57, 0x45, 0x42, 0x50];
const ASCII_IHDR = [0x49, 0x48, 0x44, 0x52];
const ASCII_VP8_LOSSY = [0x56, 0x50, 0x38, 0x20];
const ASCII_VP8_LOSSLESS = [0x56, 0x50, 0x38, 0x4c];
const ASCII_VP8_EXTENDED = [0x56, 0x50, 0x38, 0x58];
// A valid JPEG ends on FF D9; the window tolerates trailing padding.
const JPEG_EOI_WINDOW = 16;
// IEND is a fixed 12 bytes: zero length, type, and its constant CRC.
const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const PNG_IEND_WINDOW = 24;

export const IMAGE_STRUCTURE_REFUSAL_REASONS = Object.freeze([
  "content-not-image",
  "type-mismatch",
  "truncated-header",
  "malformed-header",
  "truncated-image",
  "dimensions-out-of-range",
  "aspect-ratio-out-of-range",
] as const);
export type ImageStructureRefusalReason = (typeof IMAGE_STRUCTURE_REFUSAL_REASONS)[number];

export type ImageStructure =
  | Readonly<{ ok: true; mediaType: ImagePointerMediaType; width: number; height: number }>
  | Readonly<{ ok: false; reason: ImageStructureRefusalReason }>;

type Dimensions =
  | Readonly<{ ok: true; width: number; height: number }>
  | Readonly<{ ok: false; reason: "truncated-header" | "malformed-header" }>;

/**
 * Judges bytes the caller has already decoded and size-bounded. When a media type
 * was declared, a mismatch with the sniffed type is refused rather than trusted.
 */
export function inspectImageStructure(
  bytes: Uint8Array,
  declared?: ImagePointerMediaType,
): ImageStructure {
  const actual = sniffMediaType(bytes);
  if (actual === null) return refuse("content-not-image");
  if (declared !== undefined && actual !== declared) return refuse("type-mismatch");

  const dimensions = readDimensions(bytes, actual);
  if (!dimensions.ok) return refuse(dimensions.reason);
  const { width, height } = dimensions;
  if (
    width < MIN_IMAGE_POINTER_SIDE_PX || width > MAX_IMAGE_POINTER_SIDE_PX ||
    height < MIN_IMAGE_POINTER_SIDE_PX || height > MAX_IMAGE_POINTER_SIDE_PX
  ) return refuse("dimensions-out-of-range");
  if (
    width > height * MAX_IMAGE_ASPECT_RATIO ||
    height > width * MAX_IMAGE_ASPECT_RATIO
  ) return refuse("aspect-ratio-out-of-range");
  if (isTruncated(bytes, actual)) return refuse("truncated-image");
  return Object.freeze({ ok: true, mediaType: actual, width, height });
}

/** The one magic-number sniffer; it needs only a 12-byte prefix, so a transport may call it on a sliver. */
export function sniffMediaType(data: Uint8Array): ImagePointerMediaType | null {
  if (startsWith(data, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(data, 0, ASCII_RIFF) && startsWith(data, 8, ASCII_WEBP)) return "image/webp";
  return null;
}

/**
 * Detects a file cut short after a valid header, which a relay can bill for and
 * ship. Each rule is deliberately looser than the format so no valid image is
 * refused; it checks the trailer only and never decodes pixels.
 */
function isTruncated(data: Uint8Array, mediaType: ImagePointerMediaType): boolean {
  switch (mediaType) {
    case "image/jpeg": return !hasInTail(data, [0xff, 0xd9], JPEG_EOI_WINDOW);
    case "image/png": return !hasInTail(data, PNG_IEND, PNG_IEND_WINDOW);
    case "image/webp": {
      if (data.length < 8) return true;
      const declared = viewOf(data).getUint32(4, true) + 8;
      // One byte short is the omitted pad of an odd-sized payload, not truncation.
      return data.length !== declared && data.length + 1 !== declared;
    }
  }
}

function hasInTail(data: Uint8Array, expected: readonly number[], window: number): boolean {
  const first = Math.max(0, data.length - window);
  for (let offset = first; offset + expected.length <= data.length; offset += 1) {
    if (startsWith(data, offset, expected)) return true;
  }
  return false;
}

function readDimensions(data: Uint8Array, mediaType: ImagePointerMediaType): Dimensions {
  switch (mediaType) {
    case "image/png": return pngDimensions(data);
    case "image/jpeg": return jpegDimensions(data);
    case "image/webp": return webpDimensions(data);
  }
}

// IHDR must be the first chunk: 8 signature + 4 length + 4 type + 4 width + 4 height.
function pngDimensions(data: Uint8Array): Dimensions {
  if (data.length < 24) return truncated();
  if (!startsWith(data, 12, ASCII_IHDR)) return malformed();
  const view = viewOf(data);
  return found(view.getUint32(16, false), view.getUint32(20, false));
}

/**
 * Walks marker segments to the first frame header (SOF0, SOF1 or SOF2). Every
 * iteration either advances `position` by at least two bytes or returns, and the
 * segment count is capped, so a zero- or one-length segment cannot loop.
 */
function jpegDimensions(data: Uint8Array): Dimensions {
  const view = viewOf(data);
  let position = 2;
  for (let segments = 0; segments < MAX_JPEG_SEGMENTS; segments += 1) {
    if (position >= data.length) return truncated();
    if (data[position] !== 0xff) return malformed();
    while (position < data.length && data[position] === 0xff) position += 1;
    if (position >= data.length) return truncated();
    const marker = data[position] ?? 0;
    position += 1;
    if (marker === 0x00) return malformed();
    // Standalone markers (TEM, RSTn, SOI) carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // EOI or scan data before any frame header: there are no dimensions to read.
    if (marker === 0xd9 || marker === 0xda) return malformed();
    if (position + 2 > data.length) return truncated();
    const length = view.getUint16(position, false);
    if (length < 2) return malformed();
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // length, precision, height, width, component count.
      if (length < 8) return malformed();
      if (position + 7 > data.length) return truncated();
      return found(view.getUint16(position + 5, false), view.getUint16(position + 3, false));
    }
    position += length;
  }
  return malformed();
}

// The first chunk after the RIFF header decides the layout.
function webpDimensions(data: Uint8Array): Dimensions {
  if (data.length < 20) return truncated();
  const view = viewOf(data);
  if (startsWith(data, 12, ASCII_VP8_LOSSY)) {
    if (data.length < 30) return truncated();
    if (!startsWith(data, 23, [0x9d, 0x01, 0x2a])) return malformed();
    return found(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (startsWith(data, 12, ASCII_VP8_LOSSLESS)) {
    if (data.length < 25) return truncated();
    if (data[20] !== 0x2f) return malformed();
    const packed = view.getUint32(21, true);
    return found((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }
  if (startsWith(data, 12, ASCII_VP8_EXTENDED)) {
    if (data.length < 30) return truncated();
    return found(uint24LittleEndian(data, 24) + 1, uint24LittleEndian(data, 27) + 1);
  }
  return malformed();
}

function uint24LittleEndian(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8) | ((data[offset + 2] ?? 0) << 16);
}

function startsWith(data: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset + expected.length > data.length) return false;
  return expected.every((value, index) => data[offset + index] === value);
}

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function found(width: number, height: number): Dimensions {
  return { ok: true, width, height };
}

function truncated(): Dimensions {
  return { ok: false, reason: "truncated-header" };
}

function malformed(): Dimensions {
  return { ok: false, reason: "malformed-header" };
}

function refuse(reason: ImageStructureRefusalReason): ImageStructure {
  return Object.freeze({ ok: false, reason });
}
