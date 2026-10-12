import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseImageResultMeta } from "../protocol/image-contract";
import { sniffMediaType } from "../protocol/image-structure";
import { imageGenerationsTransport } from "../server/image-transport";
import { IMAGE_POINTER_MEDIA_TYPES, parseImagePointer, type ImagePointerMediaType } from "./image-pointer";

vi.mock("server-only", () => ({}));

/**
 * The media types a picture may have are declared once, in `image-pointer.ts`.
 * These tests fail when a type is added there and some other place keeps the
 * old list, and when a new hand-written list of types appears anywhere else.
 */

// Twelve bytes are all the sniffer ever needs.
const MAGIC: Readonly<Record<ImagePointerMediaType, readonly number[]>> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

describe("one table of picture media types", () => {
  it("is sniffed, accepted by the wire contract, and named by the transport for every type", () => {
    expect(Object.keys(MAGIC).sort()).toEqual([...IMAGE_POINTER_MEDIA_TYPES].sort());
    for (const mediaType of IMAGE_POINTER_MEDIA_TYPES) {
      const magic = Uint8Array.from(MAGIC[mediaType]);
      expect(sniffMediaType(magic), mediaType).toBe(mediaType);

      const meta = { mediaType, byteLength: 1, width: 512, height: 512, contentHash: "ab".repeat(32) };
      expect(parseImageResultMeta(meta), mediaType).toEqual(meta);
      expect(parseImagePointer(meta), mediaType).toEqual(meta);

      const parsed = imageGenerationsTransport.parseCompletion({
        data: [{ b64_json: Buffer.from(magic).toString("base64").padEnd(24, "A") }],
      });
      expect(parsed.content, mediaType).toMatch(new RegExp(`^data:${mediaType.replace("/", "\\/")};base64,`, "u"));
    }
  });

  it("refuses a type the table does not hold, everywhere it is judged", () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    const meta = { mediaType: "image/gif", byteLength: 1, width: 512, height: 512, contentHash: "ab".repeat(32) };
    expect(sniffMediaType(gif)).toBeNull();
    expect(parseImageResultMeta(meta)).toBeNull();
    expect(parseImagePointer(meta)).toBeNull();
    expect(imageGenerationsTransport.parseCompletion({
      data: [{ b64_json: Buffer.from(gif).toString("base64").padEnd(24, "A") }],
    }).unusable).toBeDefined();
  });

  it("is not restated by any other module", () => {
    const root = join(import.meta.dirname, "..");
    // Each of these owns something per type: the table, the byte sniffers and
    // dimension readers keyed by it, the archive's extension table, and a PNG fixture.
    const allowed = new Set([
      "tree/image-pointer.ts",
      "protocol/image-structure.ts",
      "persistence/archive-transport.ts",
      "server/image-fixtures.ts",
    ]);
    const restated = /image\/(?:jpeg|png|webp)|jpe?g\|png|png\|webp|jpg\|webp/u;
    const found: string[] = [];
    for (const file of sourceFiles(root)) {
      const name = relative(root, file).split(sep).join("/");
      if (allowed.has(name)) continue;
      if (restated.test(readFileSync(file, "utf8"))) found.push(name);
    }
    expect(found).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "wiki" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}
