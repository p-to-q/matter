import type { UnusableCompletionCode } from "./completion-outcome";
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

const OUTPUT_FORMAT_MEDIA_TYPE: Readonly<Record<string, string>> = Object.freeze({
  png: "png",
  jpeg: "jpeg",
  jpg: "jpeg",
  webp: "webp",
});

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
      const mediaType = imageMediaType(first.output_format ?? payload.output_format);
      if (mediaType === undefined || !isCanonicalBase64(encoded)) return unusable("unknown-terminator");
      return usable(`data:image/${mediaType};base64,${encoded}`);
    }
    // A link's lifetime is the relay's. It is refused, never fetched or returned.
    if (typeof first.url === "string" && first.url.length > 0) return unusable("tool-or-continuation");
    return unusable("unknown-terminator");
  } catch {
    return unusable("unknown-terminator");
  }
}

function imageMediaType(hint: unknown): string | undefined {
  if (hint === undefined || hint === null) return "png";
  if (typeof hint !== "string") return undefined;
  const key = hint.trim().toLowerCase();
  return Object.hasOwn(OUTPUT_FORMAT_MEDIA_TYPE, key) ? OUTPUT_FORMAT_MEDIA_TYPE[key] : undefined;
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
