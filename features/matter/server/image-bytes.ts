import {
  IMAGE_STRUCTURE_REFUSAL_REASONS,
  inspectImageStructure,
} from "../protocol/image-structure";
import {
  IMAGE_POINTER_MEDIA_TYPES,
  MAX_IMAGE_POINTER_BYTES,
  type ImagePointerMediaType,
} from "../tree/image-pointer";

/**
 * Last gate before generated image bytes leave the server.
 *
 * Pure and synchronous. It inspects the data URL the image transport produced and
 * never decodes pixels. The provider embeds a C2PA manifest in the bytes, so the
 * returned `bytes` are exactly the decoded payload: nothing is re-encoded,
 * resized, stripped or rewritten here, and callers must not do so either. The
 * route that ships them names their hash with the shared `sha256Hex`.
 */

// Longest legal header is `data:` + the longest media type + `;base64,`; the window bounds the slice
// the header parser sees, so a huge payload is never scanned for its comma.
const HEADER_WINDOW = 64;
const DATA_PREFIX = "data:";
const BASE64_PARAMETER = "base64";
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/u;

export const IMAGE_REFUSAL_REASONS = Object.freeze([
  "malformed-data-url",
  "unsupported-media-type",
  "invalid-base64",
  "empty",
  "too-large",
  ...IMAGE_STRUCTURE_REFUSAL_REASONS,
  "internal-error",
] as const);
export type ImageRefusalReason = (typeof IMAGE_REFUSAL_REASONS)[number];

export type ImageInspection =
  | Readonly<{
    ok: true;
    bytes: Uint8Array;
    mediaType: ImagePointerMediaType;
    width: number;
    height: number;
    byteLength: number;
  }>
  | Readonly<{ ok: false; reason: ImageRefusalReason }>;

/**
 * Total: every input, however hostile, settles as a closed result. Extra data-URL
 * parameters are refused rather than interpreted, matching the transport's strict
 * `data:<media>;base64,` shape.
 */
export function inspectImageDataUrl(dataUrl: string): ImageInspection {
  try {
    return inspect(dataUrl);
  } catch {
    return refuse("internal-error");
  }
}

function inspect(dataUrl: string): ImageInspection {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(DATA_PREFIX)) {
    return refuse("malformed-data-url");
  }
  const comma = dataUrl.slice(0, HEADER_WINDOW).indexOf(",");
  if (comma === -1) return refuse("malformed-data-url");
  const parameters = dataUrl.slice(DATA_PREFIX.length, comma).split(";");
  const declared = IMAGE_POINTER_MEDIA_TYPES.find((type) => type === parameters[0]);
  if (declared === undefined) return refuse("unsupported-media-type");
  if (parameters.length !== 2 || parameters[1] !== BASE64_PARAMETER) {
    return refuse("malformed-data-url");
  }

  const payloadStart = comma + 1;
  const payloadLength = dataUrl.length - payloadStart;
  if (payloadLength === 0) return refuse("empty");
  if (payloadLength % 4 !== 0) return refuse("invalid-base64");
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  // Decided from the string length alone, so an oversize payload never allocates.
  const impliedBytes = (payloadLength / 4) * 3 - padding;
  if (impliedBytes > MAX_IMAGE_POINTER_BYTES) return refuse("too-large");
  const payload = dataUrl.slice(payloadStart);
  if (!BASE64_PAYLOAD.test(payload)) return refuse("invalid-base64");

  const decoded = Buffer.from(payload, "base64");
  if (decoded.byteLength !== impliedBytes) return refuse("invalid-base64");
  if (decoded.byteLength === 0) return refuse("empty");
  // A copy, never a view: small Buffers share a pooled ArrayBuffer.
  const bytes = new Uint8Array(decoded);

  const structure = inspectImageStructure(bytes, declared);
  if (!structure.ok) return refuse(structure.reason);
  const { mediaType: actual, width, height } = structure;

  return Object.freeze({
    ok: true,
    bytes,
    mediaType: actual,
    width,
    height,
    byteLength: bytes.byteLength,
  });
}

function refuse(reason: ImageRefusalReason): ImageInspection {
  return Object.freeze({ ok: false, reason });
}
