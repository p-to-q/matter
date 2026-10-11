import type { ScenarioAdapter } from "./harness";

/**
 * The one owner of a well-formed PNG for tests and fixtures: signature, IHDR,
 * and the closing IEND chunk, with no pixel data.
 *
 * The byte gate reads dimensions from the header and refuses an image that does
 * not end where its format says it must, so a header alone is no longer a valid
 * picture. Keeping one builder means a change to what "valid" means breaks one
 * fixture rather than several copies that each had to be found.
 */
export function wellFormedPngDataUrl(width: number, height: number): string {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 2;
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return `data:image/png;base64,${Buffer.concat([header, iend]).toString("base64")}`;
}

export const FIXTURE_IMAGE_BRIEF = "a hand reaching past the edge of a table";
export const FIXTURE_IMAGE_DATA_URL = wellFormedPngDataUrl(1024, 1024);

/** A fixed valid subject line; it never reads the passage it is shown. */
export const fixtureImageBriefAdapter: ScenarioAdapter = async () =>
  Object.freeze({ text: FIXTURE_IMAGE_BRIEF });

/** A fixed valid picture. It proves the route, not a relay. */
export const fixtureImageAdapter: ScenarioAdapter = async () =>
  Object.freeze({ text: FIXTURE_IMAGE_DATA_URL });
