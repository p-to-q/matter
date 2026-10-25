import { crc32, deflateSync } from "node:zlib";
import type { ScenarioAdapter } from "./harness";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const framed = Buffer.alloc(12 + data.length);
  framed.writeUInt32BE(data.length, 0);
  body.copy(framed, 4);
  framed.writeUInt32BE(crc32(body), 8 + data.length);
  return framed;
}

/**
 * The one owner of what "a PNG" is for tests and fixtures: signature, IHDR, the
 * given chunks, and the closing IEND. The byte gate reads dimensions from the
 * header and refuses an image that does not end where its format says it must,
 * so a change to what "valid" means breaks one builder rather than copies that
 * each had to be found.
 */
function assemblePng(width: number, height: number, colorType: 2 | 3, middle: readonly Buffer[]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    ...middle,
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Structurally valid at any size, with no pixel data: for tests of the gate, not of a browser. */
export function wellFormedPngDataUrl(width: number, height: number): string {
  return `data:image/png;base64,${assemblePng(width, height, 2, []).toString("base64")}`;
}

const PICTURE_SIDE = 1024;
// White ground, the cyan family's mid tone (#6BDFF2), and ink.
const PALETTE = Buffer.from([0xff, 0xff, 0xff, 0x6b, 0xdf, 0xf2, 0x00, 0x00, 0x00]);
const WHITE = 0;
const CYAN = 1;
const INK = 2;

/**
 * A real, decodable picture a browser can paint and a person can recognise as
 * rendered: a thick cyan block that a thick black stroke runs past, on white.
 * Palette-indexed, so it stays a few kilobytes.
 */
function decodableFixturePng(): Buffer {
  const rows = Buffer.alloc((1 + PICTURE_SIDE) * PICTURE_SIDE, WHITE);
  for (let y = 0; y < PICTURE_SIDE; y += 1) {
    const start = y * (1 + PICTURE_SIDE);
    const paint = (from: number, to: number, index: number) => {
      for (let x = Math.max(0, from); x < Math.min(PICTURE_SIDE, to); x += 1) rows[start + 1 + x] = index;
    };
    if (y >= 250 && y < 700) paint(180, 640, CYAN);
    const center = 900 - Math.round(y * 0.95);
    if (y >= 120 && y < 960) paint(center - 22, center + 22, INK);
  }
  return assemblePng(PICTURE_SIDE, PICTURE_SIDE, 3, [
    chunk("PLTE", PALETTE),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
  ]);
}

export const FIXTURE_IMAGE_BRIEF = "a hand reaching past the edge of a table";
export const FIXTURE_IMAGE_DATA_URL = `data:image/png;base64,${decodableFixturePng().toString("base64")}`;

/** A fixed valid subject line; it never reads the passage it is shown. */
export const fixtureImageBriefAdapter: ScenarioAdapter = async () =>
  Object.freeze({ text: FIXTURE_IMAGE_BRIEF });

/** A fixed valid picture. It proves the route, not a relay. */
export const fixtureImageAdapter: ScenarioAdapter = async () =>
  Object.freeze({ text: FIXTURE_IMAGE_DATA_URL });
