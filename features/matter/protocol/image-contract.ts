import { isMatterLocale, type MatterLocale } from "../config/locales";
import { isMaterialId } from "../tree/invariants";
import { PROTOCOL_VERSION } from "../tree/model";
import { isWellFormedUnicodeText } from "./unicode-text";

export const IMAGE_REQUEST_VERSION = "image/1" as const;
export const MAX_IMAGE_REQUEST_BYTES = 16 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PASSAGE_CODE_POINTS = 2_000;
export const MAX_IMAGE_DIRECTION_CODE_POINTS = 240;
export const MAX_IMAGE_ID_LENGTH = 128;
// Server-owned; bounds the brief the text scenario returns before any image call.
// Deliberately tight: the brief is one visual subject. The bound is in code
// points, so it admits about twenty English words but up to this many Han
// characters, which is generous for Han and tight for English. A hostile passage
// echoed back through the brief step is usually longer than a subject line, so
// the bound refuses it before any image money is spent, at no cost to a
// legitimate subject.
export const MAX_IMAGE_BRIEF_CODE_POINTS = 120;

export const IMAGE_MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export type ImageRequestEnvelope = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: typeof IMAGE_REQUEST_VERSION;
  id: string;
  locale: MatterLocale;
  passage: Readonly<{ nodeId: string; text: string }>;
  direction?: Readonly<{ text: string }>;
}>;

// The route returns image bytes as the HTTP body; this carries only the companion metadata.
export type ImageResultMeta = Readonly<{
  mediaType: ImageMediaType;
  byteLength: number;
  width: number;
  height: number;
  contentHash: string;
}>;

/**
 * Wire names for the image response's companion metadata. The route answers
 * with the image's own bytes, so the media type is the `Content-Type` and the
 * byte length is `Content-Length`; only what the body cannot say lives here.
 * One owner, so the route and every future reader cannot drift apart.
 */
export const IMAGE_RESPONSE_HEADERS = Object.freeze({
  width: "x-matter-image-width",
  height: "x-matter-image-height",
  sha256: "x-matter-image-sha256",
} as const);

// Server-owned; adjudicated before any image call; never crosses the wire.
export type ImageBrief = Readonly<{
  text: string;
}>;

export type ImageRequestParseResult =
  | Readonly<{ ok: true; envelope: ImageRequestEnvelope }>
  | Readonly<{ ok: false; message: string }>;

// Matches normalizeTextSwapDirection's exclusion set; a direction is a single presentable line.
const DIRECTION_DANGEROUS = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFE00-\uFE0F\uFEFF]/u;
const MULTILINE = /[\r\n\u2028\u2029]/u;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Strict image/1 parser. Rejects unknown keys and any unsupported protocol version. */
export function parseImageRequestEnvelope(value: unknown): ImageRequestParseResult {
  if (!isRecord(value)) return invalid("The image request shape is invalid.");
  const hasDirection = Object.hasOwn(value, "direction");
  if (!hasExactKeys(value, hasDirection
    ? ["protocolVersion", "requestVersion", "id", "locale", "passage", "direction"]
    : ["protocolVersion", "requestVersion", "id", "locale", "passage"]
  )) return invalid("The image request shape is invalid.");
  const bytes = utf8JsonBytes(value);
  if (bytes === null || bytes > MAX_IMAGE_REQUEST_BYTES) return invalid("The image request is too large.");
  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    value.requestVersion !== IMAGE_REQUEST_VERSION
  ) return invalid("The image request protocol is unsupported.");
  const id = boundedId(value.id);
  if (id === null) return invalid("The image request identity is invalid.");
  if (typeof value.locale !== "string" || !isMatterLocale(value.locale)) {
    return invalid("The image request locale is invalid.");
  }
  const passage = parsePassage(value.passage);
  if (passage === null) return invalid("The image request passage is invalid.");
  let direction: Readonly<{ text: string }> | undefined;
  if (hasDirection) {
    const dir = parseDirection(value.direction);
    if (dir === null) return invalid("The image request direction is invalid.");
    direction = dir;
  }
  return Object.freeze({ ok: true, envelope: Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: IMAGE_REQUEST_VERSION,
    id,
    locale: value.locale,
    passage,
    ...(direction !== undefined ? { direction } : {}),
  }) });
}

export function parseImageResultMeta(value: unknown): ImageResultMeta | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "mediaType", "byteLength", "width", "height", "contentHash",
  ])) return null;
  if (!isImageMediaType(value.mediaType)) return null;
  if (!isPositiveInteger(value.byteLength) || value.byteLength > MAX_IMAGE_BYTES) return null;
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) return null;
  if (typeof value.contentHash !== "string" || !SHA256_HEX.test(value.contentHash)) return null;
  return Object.freeze({
    mediaType: value.mediaType,
    byteLength: value.byteLength,
    width: value.width,
    height: value.height,
    contentHash: value.contentHash,
  });
}

/** The server constructs an image brief; this parser guards the step before the image call. */
export function parseImageBrief(value: unknown): ImageBrief | null {
  if (!isRecord(value) || !hasExactKeys(value, ["text"])) return null;
  if (typeof value.text !== "string") return null;
  if (
    !isWellFormedUnicodeText(value.text) ||
    MULTILINE.test(value.text) ||
    DIRECTION_DANGEROUS.test(value.text)
  ) return null;
  const text = value.text.trim();
  const codePoints = Array.from(text).length;
  if (codePoints < 1 || codePoints > MAX_IMAGE_BRIEF_CODE_POINTS) return null;
  return Object.freeze({ text });
}

function parsePassage(value: unknown): ImageRequestEnvelope["passage"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["nodeId", "text"])) return null;
  if (!isMaterialId(value.nodeId)) return null;
  if (typeof value.text !== "string" || !isWellFormedUnicodeText(value.text)) return null;
  if (value.text.trim().length === 0) return null;
  const codePoints = Array.from(value.text).length;
  if (codePoints < 1 || codePoints > MAX_IMAGE_PASSAGE_CODE_POINTS) return null;
  return Object.freeze({ nodeId: value.nodeId, text: value.text });
}

function parseDirection(value: unknown): Readonly<{ text: string }> | null {
  if (!isRecord(value) || !hasExactKeys(value, ["text"])) return null;
  const text = normalizeImageDirection(value.text);
  return text === null ? null : Object.freeze({ text });
}

// Canonicalizes the optional person-supplied direction before it crosses the wire.
function normalizeImageDirection(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (
    !isWellFormedUnicodeText(value) ||
    MULTILINE.test(value) ||
    DIRECTION_DANGEROUS.test(value)
  ) return null;
  const text = value.trim();
  const codePoints = Array.from(text).length;
  if (codePoints < 1 || codePoints > MAX_IMAGE_DIRECTION_CODE_POINTS) return null;
  return text;
}

function isImageMediaType(value: unknown): value is ImageMediaType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_IMAGE_ID_LENGTH && isMaterialId(value)
    ? value : null;
}

function utf8JsonBytes(value: unknown): number | null {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function invalid(message: string): ImageRequestParseResult {
  return Object.freeze({ ok: false, message });
}
