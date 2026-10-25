import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectImageDataUrl } from "./image-bytes";
import { FIXTURE_IMAGE_DATA_URL, wellFormedPngDataUrl } from "./image-fixtures";

function decode(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

function chunks(png: Buffer): { type: string; data: Buffer; crc: number }[] {
  const found: { type: string; data: Buffer; crc: number }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    found.push({ type, data, crc: png.readUInt32BE(offset + 8 + length) });
    offset += 12 + length;
  }
  return found;
}

describe("image fixtures", () => {
  it("builds a picture a decoder accepts: valid chunk checksums and a complete pixel stream", () => {
    const png = decode(FIXTURE_IMAGE_DATA_URL);
    const parts = chunks(png);
    expect(parts.map((part) => part.type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
    for (const part of parts) {
      expect(part.crc).toBe(crc32(Buffer.concat([Buffer.from(part.type, "ascii"), part.data])));
    }
    const pixels = inflateSync(parts[2]!.data);
    expect(pixels.length).toBe((1 + 1024) * 1024);
    const colors = new Set(pixels.filter((_, index) => index % 1025 !== 0));
    expect(Array.from(colors).sort()).toEqual([0, 1, 2]);
    expect(png.length).toBeLessThan(32 * 1024);
  });

  it("passes the byte gate at 1024 by 1024 and stays the one owner of validity for header-only tests", () => {
    const verdict = inspectImageDataUrl(FIXTURE_IMAGE_DATA_URL);
    expect(verdict).toMatchObject({ ok: true, mediaType: "image/png", width: 1024, height: 1024 });
    expect(inspectImageDataUrl(wellFormedPngDataUrl(512, 512))).toMatchObject({ ok: true, width: 512 });
  });
});
