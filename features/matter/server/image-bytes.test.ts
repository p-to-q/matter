import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "../protocol/image-contract";
import {
  IMAGE_REFUSAL_REASONS,
  MAX_IMAGE_ASPECT_RATIO,
  MAX_IMAGE_SIDE_PX,
  MIN_IMAGE_SIDE_PX,
  inspectImageDataUrl,
  type ImageRefusalReason,
} from "./image-bytes";

type Media = "image/png" | "image/jpeg" | "image/webp";

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function u16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

const PNG_IEND = [0x00, 0x00, 0x00, 0x00, ...ascii("IEND"), 0xae, 0x42, 0x60, 0x82];

function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii("IHDR"), ...u32be(width), ...u32be(height),
    8, 2, 0, 0, 0, 0, 0, 0, 0,
    ...PNG_IEND,
  ]);
}

function sof(marker: number, width: number, height: number): number[] {
  return [
    0xff, marker, ...u16be(17), 8, ...u16be(height), ...u16be(width),
    3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ];
}

function app(marker: number, payload: readonly number[]): number[] {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload];
}

function jpeg(width: number, height: number, before: readonly number[] = [], marker = 0xc0): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...before, ...sof(marker, width, height), 0xff, 0xd9]);
}

function riff(chunk: readonly number[]): Uint8Array {
  return Uint8Array.from([
    ...ascii("RIFF"), ...u32le(chunk.length + 4), ...ascii("WEBP"), ...chunk,
  ]);
}

function webpLossy(width: number, height: number): Uint8Array {
  const payload = [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height), 0, 0];
  return riff([...ascii("VP8 "), ...u32le(payload.length), ...payload]);
}

function webpLossless(width: number, height: number): Uint8Array {
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const payload = [0x2f, ...u32le(packed >>> 0), 0, 0];
  return riff([...ascii("VP8L"), ...u32le(payload.length), ...payload]);
}

function webpExtended(width: number, height: number): Uint8Array {
  const payload = [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)];
  return riff([...ascii("VP8X"), ...u32le(payload.length), ...payload]);
}

function dataUrl(bytes: Uint8Array | readonly number[], media: string = "image/png"): string {
  return `data:${media};base64,${Buffer.from(bytes).toString("base64")}`;
}

function refusal(input: string): ImageRefusalReason | "accepted" {
  const result = inspectImageDataUrl(input);
  return result.ok ? "accepted" : result.reason;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("image bytes: dimensions per format", () => {
  it("reads PNG IHDR width and height", () => {
    const result = inspectImageDataUrl(dataUrl(png(1024, 768), "image/png"));
    expect(result).toMatchObject({ ok: true, mediaType: "image/png", width: 1024, height: 768 });
  });

  it.each([0xc0, 0xc1, 0xc2])("reads JPEG SOF marker 0x%s", (marker) => {
    const result = inspectImageDataUrl(dataUrl(jpeg(1024, 640, [], marker), "image/jpeg"));
    expect(result).toMatchObject({ ok: true, mediaType: "image/jpeg", width: 1024, height: 640 });
  });

  it("skips APPn and DQT segments, fill bytes and standalone markers before the frame header", () => {
    const before = [
      ...app(0xe1, ascii("Exif\0\0")),
      ...app(0xeb, ascii("urn:c2pa:")),
      ...app(0xdb, new Array<number>(65).fill(1)),
      0xff, 0xff, 0xff, 0x01,
    ];
    expect(inspectImageDataUrl(dataUrl(jpeg(900, 700, before), "image/jpeg")))
      .toMatchObject({ ok: true, width: 900, height: 700 });
  });

  it("reads WebP lossy (VP8)", () => {
    expect(inspectImageDataUrl(dataUrl(webpLossy(1024, 1024), "image/webp")))
      .toMatchObject({ ok: true, mediaType: "image/webp", width: 1024, height: 1024 });
  });

  it("reads WebP lossless (VP8L) with its minus-one packing", () => {
    expect(inspectImageDataUrl(dataUrl(webpLossless(1000, 512), "image/webp")))
      .toMatchObject({ ok: true, width: 1000, height: 512 });
  });

  it("reads WebP extended (VP8X) 24-bit minus-one fields", () => {
    expect(inspectImageDataUrl(dataUrl(webpExtended(4096, 2048), "image/webp")))
      .toMatchObject({ ok: true, width: 4096, height: 2048 });
  });

  it("masks the VP8 scale bits out of the lossy dimensions", () => {
    const bytes = webpLossy(512, 512);
    bytes[27] = (bytes[27] ?? 0) | 0xc0;
    expect(inspectImageDataUrl(dataUrl(bytes, "image/webp")))
      .toMatchObject({ ok: true, width: 512, height: 512 });
  });
});

describe("image bytes: provenance", () => {
  it("returns the decoded payload byte for byte and hashes it independently", () => {
    const manifest = ascii("urn:c2pa:").concat(Array.from({ length: 300 }, (_, index) => (index * 7) % 256));
    const original = jpeg(1024, 1024, app(0xeb, manifest));
    const result = inspectImageDataUrl(dataUrl(original, "image/jpeg"));
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(Buffer.from(result.bytes).equals(Buffer.from(original))).toBe(true);
    expect(result.byteLength).toBe(original.byteLength);
    expect(result.sha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("returns an owned copy that does not alias a shared buffer pool", () => {
    const result = inspectImageDataUrl(dataUrl(png(256, 256)));
    if (!result.ok) throw new Error("expected ok");
    expect(result.bytes.byteOffset).toBe(0);
    expect(result.bytes.buffer.byteLength).toBe(result.bytes.byteLength);
  });

  it("returns frozen results", () => {
    expect(Object.isFrozen(inspectImageDataUrl(dataUrl(png(256, 256))))).toBe(true);
    expect(Object.isFrozen(inspectImageDataUrl(""))).toBe(true);
  });
});

describe("image bytes: data URL refusals", () => {
  it("refuses a string that is not a data URL", () => {
    expect(refusal("")).toBe("malformed-data-url");
    expect(refusal("https://example.com/a.png")).toBe("malformed-data-url");
    expect(refusal("data:")).toBe("malformed-data-url");
    expect(refusal("data:image/png;base64")).toBe("malformed-data-url");
  });

  it("refuses a data URL that is not exactly <media>;base64", () => {
    const body = Buffer.from(png(256, 256)).toString("base64");
    expect(refusal(`data:image/png,${body}`)).toBe("malformed-data-url");
    expect(refusal(`data:image/png;charset=utf-8;base64,${body}`)).toBe("malformed-data-url");
    expect(refusal(`data:image/png;base64;foo=bar,${body}`)).toBe("malformed-data-url");
    expect(refusal(`data:image/png;name=a.png;base64,${body}`)).toBe("malformed-data-url");
  });

  it("refuses SVG and every non-raster or unlisted media type", () => {
    const body = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64");
    expect(refusal(`data:image/svg+xml;base64,${body}`)).toBe("unsupported-media-type");
    expect(refusal("data:image/svg+xml,%3Csvg%2F%3E")).toBe("unsupported-media-type");
    expect(refusal(`data:text/html;base64,${body}`)).toBe("unsupported-media-type");
    expect(refusal(`data:image/gif;base64,${body}`)).toBe("unsupported-media-type");
    expect(refusal(`data:IMAGE/PNG;base64,${body}`)).toBe("unsupported-media-type");
    expect(refusal(`data:;base64,${body}`)).toBe("unsupported-media-type");
    expect(refusal(`data:,${body}`)).toBe("unsupported-media-type");
  });

  it("refuses an empty payload", () => {
    expect(refusal("data:image/png;base64,")).toBe("empty");
  });

  it("refuses non-canonical base64", () => {
    expect(refusal("data:image/png;base64,AAA")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,AA=A")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,====")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,AAA===")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,AA A")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,AAA-")).toBe("invalid-base64");
    expect(refusal("data:image/png;base64,😀😀")).toBe("invalid-base64");
  });
});

describe("image bytes: size ceiling", () => {
  function paddedPng(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    bytes.set(png(1024, 1024));
    bytes.set(PNG_IEND, length - PNG_IEND.length);
    return bytes;
  }

  it("accepts exactly MAX_IMAGE_BYTES and refuses one byte more", () => {
    const atLimit = inspectImageDataUrl(dataUrl(paddedPng(MAX_IMAGE_BYTES)));
    expect(atLimit).toMatchObject({ ok: true, byteLength: MAX_IMAGE_BYTES });
    expect(refusal(dataUrl(paddedPng(MAX_IMAGE_BYTES + 1)))).toBe("too-large");
  });

  it("refuses an oversize payload before any decode or pattern scan", () => {
    const from = vi.spyOn(Buffer, "from");
    const huge = `data:image/png;base64,${"A".repeat(50 * 1024 * 1024)}`;
    const started = performance.now();
    expect(refusal(huge)).toBe("too-large");
    expect(refusal(`data:image/png;base64,${"!".repeat(50 * 1024 * 1024)}`)).toBe("too-large");
    expect(performance.now() - started).toBeLessThan(250);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a misaligned huge payload without scanning it", () => {
    const started = performance.now();
    expect(refusal(`data:image/png;base64,${"A".repeat(50 * 1024 * 1024 + 1)}`)).toBe("invalid-base64");
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("image bytes: real type from magic bytes", () => {
  it("refuses bytes whose real type differs from the declared type", () => {
    expect(refusal(dataUrl(png(512, 512), "image/jpeg"))).toBe("type-mismatch");
    expect(refusal(dataUrl(jpeg(512, 512), "image/png"))).toBe("type-mismatch");
    expect(refusal(dataUrl(webpLossy(512, 512), "image/png"))).toBe("type-mismatch");
    expect(refusal(dataUrl(png(512, 512), "image/webp"))).toBe("type-mismatch");
  });

  it("refuses bodies that are not an image at all", () => {
    const html = ascii("<!doctype html><script>alert(1)</script>");
    const svg = ascii("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>");
    expect(refusal(dataUrl(html, "image/png"))).toBe("content-not-image");
    expect(refusal(dataUrl(svg, "image/jpeg"))).toBe("content-not-image");
    expect(refusal(dataUrl(ascii("GIF89a"), "image/webp"))).toBe("content-not-image");
    expect(refusal(dataUrl([0x00], "image/png"))).toBe("content-not-image");
  });

  it("refuses a RIFF container that is not WebP", () => {
    const wave = Uint8Array.from([...ascii("RIFF"), ...u32le(4), ...ascii("WAVE"), ...new Array<number>(40).fill(0)]);
    expect(refusal(dataUrl(wave, "image/webp"))).toBe("content-not-image");
  });

  it("does not trust a leading image signature followed by markup", () => {
    const polyglot = Uint8Array.from([0xff, 0xd8, 0xff, ...ascii("<script>alert(1)</script>")]);
    expect(["malformed-header", "truncated-header"]).toContain(refusal(dataUrl(polyglot, "image/jpeg")));
  });
});

describe("image bytes: truncated and malformed headers", () => {
  it("refuses a truncated PNG", () => {
    expect(refusal(dataUrl(png(512, 512).slice(0, 8)))).toBe("truncated-header");
    expect(refusal(dataUrl(png(512, 512).slice(0, 23)))).toBe("truncated-header");
  });

  it("refuses a PNG whose first chunk is not IHDR", () => {
    const bytes = png(512, 512);
    bytes.set(ascii("IDAT"), 12);
    expect(refusal(dataUrl(bytes))).toBe("malformed-header");
  });

  it("refuses truncated JPEGs", () => {
    expect(refusal(dataUrl([0xff, 0xd8, 0xff], "image/jpeg"))).toBe("truncated-header");
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0xe0], "image/jpeg"))).toBe("truncated-header");
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0xe0, 0x00], "image/jpeg"))).toBe("truncated-header");
    expect(refusal(dataUrl(jpeg(512, 512).slice(0, 8), "image/jpeg"))).toBe("truncated-header");
  });

  it("refuses a JPEG segment whose declared length points past the end", () => {
    const bytes = [0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2, 3];
    expect(refusal(dataUrl(bytes, "image/jpeg"))).toBe("truncated-header");
  });

  it.each([0, 1])("terminates on a JPEG segment of declared length %i", (length) => {
    const bytes = [0xff, 0xd8, 0xff, 0xe0, ...u16be(length), ...sof(0xc0, 512, 512)];
    expect(refusal(dataUrl(bytes, "image/jpeg"))).toBe("malformed-header");
    const repeated = [0xff, 0xd8, ...Array.from({ length: 1000 }, () => [0xff, 0xe0, ...u16be(length)]).flat()];
    expect(refusal(dataUrl(repeated, "image/jpeg"))).toBe("malformed-header");
  });

  it("caps the number of JPEG segments scanned", () => {
    const filler = Array.from({ length: 300 }, () => app(0xe1, [0])).flat();
    expect(refusal(dataUrl(jpeg(512, 512, filler), "image/jpeg"))).toBe("malformed-header");
    const modest = Array.from({ length: 100 }, () => app(0xe1, [0])).flat();
    expect(refusal(dataUrl(jpeg(512, 512, modest), "image/jpeg"))).toBe("accepted");
  });

  it("refuses a JPEG that reaches the scan or end of image before a frame header", () => {
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0], "image/jpeg"))).toBe("malformed-header");
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0], "image/jpeg"))).toBe("malformed-header");
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0x00, 0, 0, 0, 0], "image/jpeg"))).toBe("malformed-header");
    expect(refusal(dataUrl([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0x12, 0x34], "image/jpeg"))).toBe("malformed-header");
  });

  it("refuses a JPEG frame header that is too short, and non-baseline frame types", () => {
    const short = [0xff, 0xd8, 0xff, 0xc0, ...u16be(5), 8, 2, 0];
    expect(refusal(dataUrl(short, "image/jpeg"))).toBe("malformed-header");
    expect(refusal(dataUrl(jpeg(512, 512, [], 0xc3), "image/jpeg"))).toBe("malformed-header");
  });

  it("refuses truncated or malformed WebP", () => {
    expect(refusal(dataUrl(webpLossy(512, 512).slice(0, 20), "image/webp"))).toBe("truncated-header");
    expect(refusal(dataUrl(webpLossless(512, 512).slice(0, 24), "image/webp"))).toBe("truncated-header");
    const badStart = webpLossy(512, 512);
    badStart[23] = 0;
    expect(refusal(dataUrl(badStart, "image/webp"))).toBe("malformed-header");
    const badSignature = webpLossless(512, 512);
    badSignature[20] = 0;
    expect(refusal(dataUrl(badSignature, "image/webp"))).toBe("malformed-header");
    const unknownChunk = webpExtended(512, 512);
    unknownChunk.set(ascii("ICCP"), 12);
    expect(refusal(dataUrl(unknownChunk, "image/webp"))).toBe("malformed-header");
  });
});

describe("image bytes: truncation", () => {
  const filler = (length: number): number[] => new Array<number>(length).fill(0x41);

  // A frame header followed by entropy-coded filler, then the end-of-image marker.
  function jpegWithScan(scan: number): number[] {
    return [...jpeg(512, 512).slice(0, -2), 0xff, 0xda, ...u16be(2), ...filler(scan)];
  }

  function pngWithData(data: number): number[] {
    const start = Array.from(png(512, 512).slice(0, -PNG_IEND.length));
    return [...start, ...u32be(data), ...ascii("IDAT"), ...filler(data), 0, 0, 0, 0];
  }

  function webpWithPayload(size: number): Uint8Array {
    return riff([...ascii("VP8X"), ...u32le(10 + size), 0, 0, 0, 0, ...u24le(511), ...u24le(511), ...filler(size)]);
  }

  it("accepts each format when it ends the way the format ends", () => {
    expect(refusal(dataUrl([...jpegWithScan(500), 0xff, 0xd9], "image/jpeg"))).toBe("accepted");
    expect(refusal(dataUrl([...pngWithData(500), ...PNG_IEND], "image/png"))).toBe("accepted");
    expect(refusal(dataUrl(webpWithPayload(500), "image/webp"))).toBe("accepted");
  });

  it("refuses each format cut mid-stream after a valid header", () => {
    const fullJpeg = [...jpegWithScan(500), 0xff, 0xd9];
    const fullPng = [...pngWithData(500), ...PNG_IEND];
    const fullWebp = Array.from(webpWithPayload(500));
    for (const cut of [1, 2, 3, 17, 250]) {
      expect(refusal(dataUrl(fullJpeg.slice(0, -cut), "image/jpeg")), `jpeg -${cut}`).toBe("truncated-image");
      expect(refusal(dataUrl(fullPng.slice(0, -cut), "image/png")), `png -${cut}`).toBe("truncated-image");
    }
    for (const cut of [2, 3, 17, 250]) {
      expect(refusal(dataUrl(fullWebp.slice(0, -cut), "image/webp")), `webp -${cut}`).toBe("truncated-image");
    }
  });

  it("accepts a JPEG with trailing padding after the end-of-image marker", () => {
    const padded = [...jpegWithScan(500), 0xff, 0xd9, 0, 0, 0, 0];
    expect(refusal(dataUrl(padded, "image/jpeg"))).toBe("accepted");
    const tooMuch = [...jpegWithScan(500), 0xff, 0xd9, ...new Array<number>(16).fill(0)];
    expect(refusal(dataUrl(tooMuch, "image/jpeg"))).toBe("truncated-image");
  });

  it("refuses a JPEG that never reaches its end-of-image marker", () => {
    expect(refusal(dataUrl(jpegWithScan(500), "image/jpeg"))).toBe("truncated-image");
  });

  it("refuses a PNG without IEND, including one whose IDAT simply stops", () => {
    expect(refusal(dataUrl(pngWithData(500), "image/png"))).toBe("truncated-image");
    expect(refusal(dataUrl(png(512, 512).slice(0, -PNG_IEND.length), "image/png"))).toBe("truncated-image");
  });

  it("accepts a PNG whose IEND is followed by a few stray bytes", () => {
    expect(refusal(dataUrl([...pngWithData(500), ...PNG_IEND, 0, 0, 0, 0], "image/png"))).toBe("accepted");
  });

  it("refuses a PNG whose last chunk is a corrupted IEND", () => {
    const bad = [...pngWithData(500), ...PNG_IEND.slice(0, -1), 0x00];
    expect(refusal(dataUrl(bad, "image/png"))).toBe("truncated-image");
  });

  it("refuses a WebP whose RIFF size lies in either direction", () => {
    const real = webpWithPayload(500);
    const lyingLarge = Uint8Array.from(real);
    new DataView(lyingLarge.buffer).setUint32(4, real.length - 8 + 100, true);
    const lyingSmall = Uint8Array.from(real);
    new DataView(lyingSmall.buffer).setUint32(4, real.length - 8 - 100, true);
    expect(refusal(dataUrl(lyingLarge, "image/webp"))).toBe("truncated-image");
    expect(refusal(dataUrl(lyingSmall, "image/webp"))).toBe("truncated-image");
  });

  it("accepts a WebP one byte shorter than its RIFF size, the omitted odd-length pad", () => {
    const real = webpWithPayload(501);
    const padded = Uint8Array.from(real);
    new DataView(padded.buffer).setUint32(4, real.length - 8 + 1, true);
    expect(refusal(dataUrl(padded, "image/webp"))).toBe("accepted");
    new DataView(padded.buffer).setUint32(4, real.length - 8 + 2, true);
    expect(refusal(dataUrl(padded, "image/webp"))).toBe("truncated-image");
  });

  it("leaves the header reasons in charge when the header itself is the problem", () => {
    expect(refusal(dataUrl(jpegWithScan(0).slice(0, 10), "image/jpeg"))).toBe("truncated-header");
    expect(refusal(dataUrl(png(10, 10), "image/png"))).toBe("dimensions-out-of-range");
  });
});

describe("image bytes: dimension bounds", () => {
  const sizes: ReadonlyArray<readonly [number, number, ImageRefusalReason | "accepted"]> = [
    [MIN_IMAGE_SIDE_PX, MIN_IMAGE_SIDE_PX, "accepted"],
    [MIN_IMAGE_SIDE_PX - 1, MIN_IMAGE_SIDE_PX, "dimensions-out-of-range"],
    [MIN_IMAGE_SIDE_PX, MIN_IMAGE_SIDE_PX - 1, "dimensions-out-of-range"],
    [MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX, "accepted"],
    [MAX_IMAGE_SIDE_PX + 1, MAX_IMAGE_SIDE_PX, "dimensions-out-of-range"],
    [MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX + 1, "dimensions-out-of-range"],
    [0, 0, "dimensions-out-of-range"],
    [1024, 0, "dimensions-out-of-range"],
    [0xffffffff, 0xffffffff, "dimensions-out-of-range"],
    [1024, 512, "accepted"],
    [512, 1024, "accepted"],
    [1025, 512, "aspect-ratio-out-of-range"],
    [512, 1025, "aspect-ratio-out-of-range"],
    [4096, 256, "aspect-ratio-out-of-range"],
  ];

  it("enforces side and aspect bounds on PNG", () => {
    expect(MAX_IMAGE_ASPECT_RATIO).toBe(2);
    for (const [width, height, expected] of sizes) {
      expect(refusal(dataUrl(png(width, height), "image/png")), `${width}x${height}`).toBe(expected);
    }
  });

  it("enforces side and aspect bounds on JPEG", () => {
    for (const [width, height, expected] of sizes) {
      if (width > 0xffff || height > 0xffff) continue;
      expect(refusal(dataUrl(jpeg(width, height), "image/jpeg")), `${width}x${height}`).toBe(expected);
    }
  });

  it("enforces side and aspect bounds on WebP", () => {
    for (const [width, height, expected] of sizes) {
      if (width > 0x4000 || height > 0x4000 || width < 1 || height < 1) continue;
      const lossless = refusal(dataUrl(webpLossless(width, height), "image/webp"));
      const extended = refusal(dataUrl(webpExtended(width, height), "image/webp"));
      expect(lossless, `${width}x${height} VP8L`).toBe(expected);
      expect(extended, `${width}x${height} VP8X`).toBe(expected);
    }
  });
});

describe("image bytes: totality", () => {
  it("never throws and always returns a closed result on odd input", () => {
    const body = Buffer.from(png(512, 512)).toString("base64");
    const inputs: readonly string[] = [
      "", " ", "\u0000", "\ud800", "\udc00x", "😀", "data", "data:", "data:,", "data:;", "data:;base64,",
      "data:image/png", "data:image/png;", "data:image/png;base64", "data:image/png;base64,",
      "data:image/png;base64,\u0000", "data:image/png;base64,𐀀", "data:image/png;base64,😀",
      `data:image/png;base64,${body}\n`, `data:image/png;base64,${body}=`, `  data:image/png;base64,${body}`,
      `DATA:image/png;base64,${body}`, `data:image/png;charset=utf-8;base64,${body}`,
      `data:image/png;;base64,${body}`, `data:image/png;base64,${body},${body}`,
      "data:image/png;base64,".repeat(1000), ",".repeat(100_000), "x".repeat(10_000_000),
      "data:" + "a".repeat(10_000_000), `data:image/png;base64,${"/".repeat(8)}`,
    ];
    for (const input of inputs) {
      expect(() => inspectImageDataUrl(input)).not.toThrow();
      const result = inspectImageDataUrl(input);
      if (!result.ok) expect(IMAGE_REFUSAL_REASONS).toContain(result.reason);
    }
  });

  it("tolerates non-string callers", () => {
    for (const input of [undefined, null, 0, {}, [], Symbol("x")]) {
      expect(refusal(input as unknown as string)).toBe("malformed-data-url");
    }
  });

  it("settles pseudo-random bytes behind every valid signature without throwing", () => {
    let seed = 0x2f6e2b1;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed >>> 24;
    };
    const prefixes: ReadonlyArray<readonly [Media, readonly number[]]> = [
      ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ["image/jpeg", [0xff, 0xd8, 0xff]],
      ["image/webp", [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]],
    ];
    for (let round = 0; round < 1500; round += 1) {
      const [media, prefix] = prefixes[round % prefixes.length] ?? prefixes[0] as typeof prefixes[number];
      const tail = Array.from({ length: next() % 48 }, () => (next() % 5 === 0 ? 0xff : next()));
      const result = inspectImageDataUrl(dataUrl([...prefix, ...tail], media));
      if (!result.ok) expect(IMAGE_REFUSAL_REASONS).toContain(result.reason);
    }
  });

  it("settles an unexpected internal fault as a closed refusal", () => {
    const input = dataUrl(png(512, 512));
    vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new RangeError("allocation failed");
    });
    expect(refusal(input)).toBe("internal-error");
  });

  it("exercises every declared refusal reason", () => {
    const seen = new Set<ImageRefusalReason>();
    const body = Buffer.from(png(512, 512)).toString("base64");
    const candidates = [
      "", "data:image/gif;base64,AAAA", "data:image/png;base64,AAA", "data:image/png;base64,",
      `data:image/png;base64,${"A".repeat(3_000_000)}`, dataUrl(ascii("hello world!"), "image/png"),
      dataUrl(png(512, 512), "image/jpeg"), dataUrl(png(512, 512).slice(0, 10)),
      dataUrl([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0], "image/jpeg"), dataUrl(png(10, 10)),
      dataUrl(png(2048, 256)), `data:image/png;base64,${body}`,
      dataUrl(jpeg(512, 512).slice(0, -2), "image/jpeg"),
    ];
    for (const candidate of candidates) {
      const result = inspectImageDataUrl(candidate);
      if (!result.ok) seen.add(result.reason);
    }
    const input = dataUrl(png(512, 512));
    vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const faulted = inspectImageDataUrl(input);
    if (!faulted.ok) seen.add(faulted.reason);
    expect([...seen].sort()).toEqual([...IMAGE_REFUSAL_REASONS].sort());
  });
});
