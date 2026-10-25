import { describe, expect, it } from "vitest";
import { MAX_IMAGE_POINTER_BYTES } from "../tree/image-pointer";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  IMAGE_REQUEST_VERSION,
  IMAGE_RESPONSE_HEADERS,
  MAX_IMAGE_BRIEF_CODE_POINTS,
  MAX_IMAGE_DIRECTION_CODE_POINTS,
  MAX_IMAGE_ID_LENGTH,
  MAX_IMAGE_PASSAGE_CODE_POINTS,
  canDrawFromPassage,
  parseImageBrief,
  parseImageRequestEnvelope,
  parseImageResultMeta,
} from "./image-contract";

const NODE_ID = "thought1";
const PASSAGE_TEXT = "A quiet afternoon in the garden";
const HASH = "a".repeat(64);

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: IMAGE_REQUEST_VERSION,
    id: "img_abc",
    locale: "en-US",
    passage: { nodeId: NODE_ID, text: PASSAGE_TEXT },
    ...overrides,
  };
}

function resultMeta(overrides: Record<string, unknown> = {}) {
  return {
    mediaType: "image/jpeg",
    byteLength: 400_000,
    width: 1024,
    height: 1024,
    contentHash: HASH,
    ...overrides,
  };
}

describe("image/1 contract", () => {
  describe("parseImageRequestEnvelope", () => {
    it("accepts a valid envelope without direction", () => {
      const result = parseImageRequestEnvelope(envelope());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.envelope.requestVersion).toBe(IMAGE_REQUEST_VERSION);
        expect(result.envelope.passage.text).toBe(PASSAGE_TEXT);
        expect(result.envelope.direction).toBeUndefined();
      }
    });

    it("accepts a valid envelope with direction and trims surrounding whitespace", () => {
      const result = parseImageRequestEnvelope(envelope({ direction: { text: "  as a bird  " } }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.envelope.direction).toEqual({ text: "as a bird" });
    });

    it("rejects unknown extra keys", () => {
      expect(parseImageRequestEnvelope({ ...envelope(), extra: "x" }).ok).toBe(false);
      expect(parseImageRequestEnvelope({ ...envelope(), gesture: {} }).ok).toBe(false);
    });

    it("rejects a missing protocolVersion", () => {
      expect(parseImageRequestEnvelope({
        requestVersion: IMAGE_REQUEST_VERSION,
        id: "img_abc",
        locale: "en-US",
        passage: { nodeId: NODE_ID, text: PASSAGE_TEXT },
      }).ok).toBe(false);
    });

    it("rejects a missing requestVersion", () => {
      expect(parseImageRequestEnvelope({
        protocolVersion: PROTOCOL_VERSION,
        id: "img_abc",
        locale: "en-US",
        passage: { nodeId: NODE_ID, text: PASSAGE_TEXT },
      }).ok).toBe(false);
    });

    it("rejects a missing id", () => {
      expect(parseImageRequestEnvelope({
        protocolVersion: PROTOCOL_VERSION,
        requestVersion: IMAGE_REQUEST_VERSION,
        locale: "en-US",
        passage: { nodeId: NODE_ID, text: PASSAGE_TEXT },
      }).ok).toBe(false);
    });

    it("rejects a missing locale", () => {
      expect(parseImageRequestEnvelope({
        protocolVersion: PROTOCOL_VERSION,
        requestVersion: IMAGE_REQUEST_VERSION,
        id: "img_abc",
        passage: { nodeId: NODE_ID, text: PASSAGE_TEXT },
      }).ok).toBe(false);
    });

    it("rejects a missing passage", () => {
      expect(parseImageRequestEnvelope({
        protocolVersion: PROTOCOL_VERSION,
        requestVersion: IMAGE_REQUEST_VERSION,
        id: "img_abc",
        locale: "en-US",
      }).ok).toBe(false);
    });

    it("rejects a non-string protocolVersion", () => {
      expect(parseImageRequestEnvelope(envelope({ protocolVersion: 42 })).ok).toBe(false);
    });

    it("rejects a non-string requestVersion", () => {
      expect(parseImageRequestEnvelope(envelope({ requestVersion: 42 })).ok).toBe(false);
    });

    it("rejects a non-string id", () => {
      expect(parseImageRequestEnvelope(envelope({ id: 42 })).ok).toBe(false);
    });

    it("rejects a non-string locale", () => {
      expect(parseImageRequestEnvelope(envelope({ locale: 42 })).ok).toBe(false);
    });

    it("rejects a non-object passage", () => {
      expect(parseImageRequestEnvelope(envelope({ passage: null })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ passage: "text only" })).ok).toBe(false);
    });

    it("rejects an unsupported protocol or request version", () => {
      expect(parseImageRequestEnvelope(envelope({ protocolVersion: "0.1" })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ requestVersion: "image/2" })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ requestVersion: "text-swap/2" })).ok).toBe(false);
    });

    it("rejects an unrecognized locale", () => {
      expect(parseImageRequestEnvelope(envelope({ locale: "fr-FR" })).ok).toBe(false);
    });

    it("rejects passage missing a field or with an unknown key", () => {
      expect(parseImageRequestEnvelope(envelope({ passage: { text: PASSAGE_TEXT } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({
        passage: { nodeId: NODE_ID, text: PASSAGE_TEXT, extra: "x" },
      })).ok).toBe(false);
    });

    it("rejects an empty or blank passage text", () => {
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: "" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: "   " } })).ok).toBe(false);
    });

    it("rejects a non-string passage text", () => {
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: 42 } })).ok).toBe(false);
    });

    it("rejects malformed unicode in passage text", () => {
      expect(parseImageRequestEnvelope(envelope({
        passage: { nodeId: NODE_ID, text: "hello\uD800" },
      })).ok).toBe(false);
    });

    it("passage code-point bound: exact MAX accepted, one over rejected", () => {
      const atLimit = "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS);
      const overLimit = "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: atLimit } })).ok).toBe(true);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: overLimit } })).ok).toBe(false);
    });

    it("counts code points for emoji in passage: 2000 emoji accepted, 2001 rejected", () => {
      // Each emoji is one code point but two UTF-16 units; Array.from measures code points.
      const atLimit = "\u{1F984}".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS);
      const overLimit = "\u{1F984}".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: atLimit } })).ok).toBe(true);
      expect(parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text: overLimit } })).ok).toBe(false);
    });

    it("direction code-point bound: exact MAX accepted, one over rejected", () => {
      expect(parseImageRequestEnvelope(envelope({
        direction: { text: "a".repeat(MAX_IMAGE_DIRECTION_CODE_POINTS) },
      })).ok).toBe(true);
      expect(parseImageRequestEnvelope(envelope({
        direction: { text: "a".repeat(MAX_IMAGE_DIRECTION_CODE_POINTS + 1) },
      })).ok).toBe(false);
    });

    it("id length bound: exact MAX accepted, one over rejected", () => {
      expect(parseImageRequestEnvelope(envelope({ id: "a".repeat(MAX_IMAGE_ID_LENGTH) })).ok).toBe(true);
      expect(parseImageRequestEnvelope(envelope({ id: "a".repeat(MAX_IMAGE_ID_LENGTH + 1) })).ok).toBe(false);
    });

    it("direction: newline rejected", () => {
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as\na bird" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as\ra bird" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as bird" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as bird" } })).ok).toBe(false);
    });

    it("direction: control character rejected", () => {
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as\u0000bird" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as\u0001bird" } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "as\u007Fbird" } })).ok).toBe(false);
    });

    it("direction: non-string type rejected", () => {
      expect(parseImageRequestEnvelope(envelope({ direction: { text: 42 } })).ok).toBe(false);
      expect(parseImageRequestEnvelope(envelope({ direction: 42 })).ok).toBe(false);
    });

    it("direction: malformed unicode rejected", () => {
      expect(parseImageRequestEnvelope(envelope({ direction: { text: "a\uD800b" } })).ok).toBe(false);
    });
  });

  describe("parseImageResultMeta", () => {
    it("accepts valid result meta for each allowed media type", () => {
      expect(parseImageResultMeta(resultMeta({ mediaType: "image/jpeg" }))).not.toBeNull();
      expect(parseImageResultMeta(resultMeta({ mediaType: "image/png" }))).not.toBeNull();
      expect(parseImageResultMeta(resultMeta({ mediaType: "image/webp" }))).not.toBeNull();
    });

    it("rejects disallowed media types", () => {
      expect(parseImageResultMeta(resultMeta({ mediaType: "image/gif" }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ mediaType: "image/svg+xml" }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ mediaType: "text/plain" }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ mediaType: 42 }))).toBeNull();
    });

    it("rejects unknown extra keys", () => {
      expect(parseImageResultMeta({ ...resultMeta(), extra: "x" })).toBeNull();
    });

    it("rejects a missing mediaType", () => {
      expect(parseImageResultMeta({
        byteLength: 400_000, width: 1024, height: 1024, contentHash: HASH,
      })).toBeNull();
    });

    it("rejects a missing byteLength", () => {
      expect(parseImageResultMeta({
        mediaType: "image/jpeg", width: 1024, height: 1024, contentHash: HASH,
      })).toBeNull();
    });

    it("rejects a missing width", () => {
      expect(parseImageResultMeta({
        mediaType: "image/jpeg", byteLength: 400_000, height: 1024, contentHash: HASH,
      })).toBeNull();
    });

    it("rejects a missing height", () => {
      expect(parseImageResultMeta({
        mediaType: "image/jpeg", byteLength: 400_000, width: 1024, contentHash: HASH,
      })).toBeNull();
    });

    it("rejects a missing contentHash", () => {
      expect(parseImageResultMeta({
        mediaType: "image/jpeg", byteLength: 400_000, width: 1024, height: 1024,
      })).toBeNull();
    });

    it("rejects non-integer, non-positive, or non-number byteLength and dimensions", () => {
      expect(parseImageResultMeta(resultMeta({ byteLength: 0 }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ byteLength: -1 }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ byteLength: 1.5 }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ byteLength: "400000" }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ width: 0 }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ height: -1 }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ width: "1024" }))).toBeNull();
    });

    it("byteLength bound: MAX_IMAGE_POINTER_BYTES accepted, one over rejected", () => {
      expect(parseImageResultMeta(resultMeta({ byteLength: MAX_IMAGE_POINTER_BYTES }))).not.toBeNull();
      expect(parseImageResultMeta(resultMeta({ byteLength: MAX_IMAGE_POINTER_BYTES + 1 }))).toBeNull();
    });

    it("rejects an invalid contentHash: wrong length, non-hex, uppercase, or non-string", () => {
      expect(parseImageResultMeta(resultMeta({ contentHash: "abc" }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ contentHash: "a".repeat(63) }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ contentHash: "g".repeat(64) }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ contentHash: "A".repeat(64) }))).toBeNull();
      expect(parseImageResultMeta(resultMeta({ contentHash: 42 }))).toBeNull();
    });
  });

  describe("parseImageBrief", () => {
    it("accepts a valid brief and trims surrounding whitespace", () => {
      const result = parseImageBrief({ text: "  a bird on a wire  " });
      expect(result).not.toBeNull();
      if (result !== null) expect(result.text).toBe("a bird on a wire");
    });

    it("rejects unknown extra keys", () => {
      expect(parseImageBrief({ text: "a bird", extra: "x" })).toBeNull();
    });

    it("rejects a missing text field", () => {
      expect(parseImageBrief({})).toBeNull();
    });

    it("rejects a non-string text", () => {
      expect(parseImageBrief({ text: 42 })).toBeNull();
      expect(parseImageBrief({ text: null })).toBeNull();
    });

    it("rejects a newline in brief text", () => {
      expect(parseImageBrief({ text: "a bird\non a wire" })).toBeNull();
      expect(parseImageBrief({ text: "a bird\ra wire" })).toBeNull();
      expect(parseImageBrief({ text: "a bird" })).toBeNull();
    });

    it("rejects a control character in brief text", () => {
      expect(parseImageBrief({ text: "a\u0000bird" })).toBeNull();
      expect(parseImageBrief({ text: "a\u0001bird" })).toBeNull();
      expect(parseImageBrief({ text: "a\u007Fbird" })).toBeNull();
    });

    it("rejects malformed unicode in brief text", () => {
      expect(parseImageBrief({ text: "a\uD800bird" })).toBeNull();
    });

    it("brief code-point bound: exact MAX accepted, one over rejected", () => {
      expect(parseImageBrief({ text: "a".repeat(MAX_IMAGE_BRIEF_CODE_POINTS) })).not.toBeNull();
      expect(parseImageBrief({ text: "a".repeat(MAX_IMAGE_BRIEF_CODE_POINTS + 1) })).toBeNull();
    });

    it("counts code points for emoji: 200 emoji accepted, 201 rejected", () => {
      // Each emoji is one code point but two UTF-16 units; verifies Array.from counting.
      expect(parseImageBrief({ text: "\u{1F984}".repeat(MAX_IMAGE_BRIEF_CODE_POINTS) })).not.toBeNull();
      expect(parseImageBrief({ text: "\u{1F984}".repeat(MAX_IMAGE_BRIEF_CODE_POINTS + 1) })).toBeNull();
    });
  });
});

describe("canDrawFromPassage", () => {
  const texts: readonly unknown[] = [
    PASSAGE_TEXT, "a", "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS), "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1),
    "𝒳".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS), "𝒳".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1),
    "", "   ", "\n\t", "lone \ud800 surrogate", "multi\nline passage is fine", null, undefined, 7, {},
  ];

  it("is the rule the request parser applies to a passage, for every kind of text", () => {
    for (const text of texts) {
      const parsed = parseImageRequestEnvelope(envelope({ passage: { nodeId: NODE_ID, text } })).ok;
      expect(canDrawFromPassage(text), String(text).slice(0, 20)).toBe(parsed);
    }
  });

  it("holds the bound in code points and refuses blank, malformed and non-text", () => {
    expect(canDrawFromPassage("𝒳".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS))).toBe(true);
    expect(canDrawFromPassage("𝒳".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1))).toBe(false);
    for (const refused of ["", "  \n ", "x\ud800", null, undefined, 3]) {
      expect(canDrawFromPassage(refused)).toBe(false);
    }
  });
});

describe("image/1 response header names", () => {
  it("are lowercase, distinct, and namespaced to Matter", () => {
    const names = Object.values(IMAGE_RESPONSE_HEADERS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^x-matter-image-[a-z0-9]+$/);
  });

  it("carry only what Content-Type and Content-Length cannot", () => {
    expect(Object.keys(IMAGE_RESPONSE_HEADERS).sort()).toEqual(["height", "sha256", "width"]);
  });
});
