import type { UnusableCompletionCode } from "./completion-outcome";
import { sniffMediaType } from "../protocol/image-structure";
import type { ImagePointerMediaType } from "../tree/image-pointer";
import { isJsonContentType } from "./content-type";
import type { ScenarioCall } from "./harness";
import type { PoolParsedCompletion, PoolTransport } from "./model-pool";
import { parseOpenAiChatCompletion } from "./openai-chat-completion";

/**
 * Image relays as reviewed transports on the existing pool.
 *
 * The pool hands a scenario `{ text }`, so an image rides that seam as one
 * string: a base64 data URL. This module only reshapes a payload the pool has
 * already fetched under its own byte ceiling. It performs no I/O, never decodes
 * or re-encodes image bytes (the provider's provenance manifest must survive),
 * and never lets a provider link become a result. Whether the bytes are a real
 * image is the adjudicator's question, not this file's.
 */

type ImageShape = "chat" | "images";

const IMAGES_SIZE = "1024x1024";
// Longest accepted header is `data:image/` + 32 + `;base64,`; this bounds the
// slice the header pattern ever sees, so a huge payload is never regex-scanned
// for its header.
const HEADER_WINDOW = 64;
const DATA_URL_HEADER = /^data:image\/([a-z0-9][a-z0-9.+-]{0,31});base64,/u;
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/u;
// 16 base64 characters decode to the 12 bytes the WebP signature needs.
const SNIFF_BASE64_CHARACTERS = 16;

export const imageChatTransport: PoolTransport = createImageTransport("chat");
export const imageGenerationsTransport: PoolTransport = createImageTransport("images");

function createImageTransport(shape: ImageShape): PoolTransport {
  return Object.freeze({
    id: shape === "chat" ? "image-chat-completions" : "image-generations",
    completionUrl: (baseUrl) =>
      `${baseUrl}/${shape === "chat" ? "chat/completions" : "images/generations"}`,
    authHeaders: (apiKey) => Object.freeze({ authorization: `Bearer ${apiKey}` }),
    acceptsResponse: (response) =>
      response.status === 200 && isJsonContentType(response.headers.get("content-type")),
    // The compiled prompt is passed through untouched and is never logged.
    // The chat path has no size parameter: the style prompt names the format.
    serialize: (call: ScenarioCall, _maximumOutputTokens: number, model: string) =>
      shape === "chat"
        ? { model, messages: [{ role: "user", content: call.prompt }] }
        : { model, prompt: call.prompt, n: 1, size: IMAGES_SIZE },
    parseCompletion: shape === "chat" ? parseChatImage : parseImagesGeneration,
  });
}

/**
 * Total by construction: any payload, however hostile, settles as a closed
 * unusable outcome. Throwing here would be classed as a transport fault and
 * poison candidate health, which a malformed answer is not.
 */
function parseChatImage(payload: unknown): PoolParsedCompletion {
  try {
    const parsed = parseOpenAiChatCompletion(payload);
    if (parsed.unusable !== undefined) return unusable(parsed.unusable);
    // A relay may omit the stop report on an image answer. A complete,
    // well-formed data URL is its own terminator; an explicit non-complete
    // report still loses.
    if (parsed.disposition !== "complete" && parsed.disposition !== "missing") {
      return unusable(parsed.disposition);
    }
    if (typeof parsed.content !== "string") return unusable("unknown-terminator");
    const dataUrl = extractMarkdownDataUrl(parsed.content);
    if (dataUrl !== undefined) return usable(dataUrl);
    return unusable(
      parsed.content.includes("](http") ? "tool-or-continuation" : "unknown-terminator",
    );
  } catch {
    return unusable("unknown-terminator");
  }
}

function parseImagesGeneration(payload: unknown): PoolParsedCompletion {
  try {
    if (!isPlainObject(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
      return unusable("unknown-terminator");
    }
    const first: unknown = payload.data[0];
    if (!isPlainObject(first)) return unusable("unknown-terminator");
    const encoded = first.b64_json;
    if (typeof encoded === "string" && encoded.length > 0) {
      if (encoded.startsWith("data:")) return fromDataUrl(encoded);
      if (!isCanonicalBase64(encoded)) return unusable("unknown-terminator");
      // The bytes are the only authority on what the image is. A relay's
      // `output_format` is advisory: when it agrees with the bytes it adds
      // nothing, and when it disagrees or names a format we do not know,
      // believing it would discard a picture the platform has already paid for.
      const mediaType = sniffBase64MediaType(encoded);
      if (mediaType === undefined) return unusable("unknown-terminator");
      return usable(`data:${mediaType};base64,${encoded}`);
    }
    // A link's lifetime is the relay's. It is refused, never fetched or returned.
    if (typeof first.url === "string" && first.url.length > 0) return unusable("tool-or-continuation");
    return unusable("unknown-terminator");
  } catch {
    return unusable("unknown-terminator");
  }
}

/**
 * Classifies by magic number from a 12-byte prefix (16 base64 characters). This
 * decodes a sliver to name a type; it is not pixel work and alters no byte.
 * `Buffer.from(..., "base64")` never throws, and a short prefix simply fails
 * every length-guarded match.
 */
function sniffBase64MediaType(encoded: string): ImagePointerMediaType | undefined {
  const head = Buffer.from(encoded.slice(0, SNIFF_BASE64_CHARACTERS), "base64");
  return sniffMediaType(head) ?? undefined;
}

/**
 * Finds the one markdown image whose target is a data URL, or a bare data URL.
 * Index scans only: a regex over a multi-megabyte relay string could go
 * quadratic on repeated `![`. Two data-URL images are ambiguous and refused.
 */
function extractMarkdownDataUrl(content: string): string | undefined {
  const marker = "](data:";
  const at = content.indexOf(marker);
  if (at === -1) {
    const bare = content.trim();
    return bare.startsWith("data:") ? validDataUrl(bare) : undefined;
  }
  if (content.indexOf(marker, at + marker.length) !== -1) return undefined;
  const open = content.lastIndexOf("![", at);
  if (open === -1 || content.slice(open + 2, at).includes("]")) return undefined;
  const start = at + 2;
  const end = content.indexOf(")", start);
  return end === -1 ? undefined : validDataUrl(content.slice(start, end));
}

function fromDataUrl(value: string): PoolParsedCompletion {
  const valid = validDataUrl(value);
  return valid === undefined ? unusable("unknown-terminator") : usable(valid);
}

/** Only a base64 `image/*` data URL with a strict payload survives. */
function validDataUrl(value: string): string | undefined {
  const header = DATA_URL_HEADER.exec(value.slice(0, HEADER_WINDOW));
  if (header === null) return undefined;
  return isCanonicalBase64(value.slice(header[0].length)) ? value : undefined;
}

function isCanonicalBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_PAYLOAD.test(value);
}

function usable(dataUrl: string): PoolParsedCompletion {
  return Object.freeze({ content: dataUrl, disposition: "complete" as const });
}

function unusable(code: UnusableCompletionCode): PoolParsedCompletion {
  return Object.freeze({ content: undefined, disposition: code, unusable: code });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
