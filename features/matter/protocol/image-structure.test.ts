import { describe, expect, it } from "vitest";
import { IMAGE_REFUSAL_REASONS } from "../server/image-bytes";
import {
  IMAGE_STRUCTURE_REFUSAL_REASONS,
  MAX_IMAGE_SIDE_PX,
  inspectImageStructure,
} from "./image-structure";

function png(width: number, height: number, { withEnd = true } = {}): Uint8Array {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const end = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  return withEnd ? Uint8Array.from([...header, ...end]) : header;
}

describe("image structure", () => {
  it("reads type and dimensions from the bytes alone", () => {
    expect(inspectImageStructure(png(1024, 768))).toEqual({
      ok: true,
      mediaType: "image/png",
      width: 1024,
      height: 768,
    });
  });

  it("refuses a declared type the bytes contradict, and accepts a matching one", () => {
    expect(inspectImageStructure(png(512, 512), "image/jpeg")).toEqual({ ok: false, reason: "type-mismatch" });
    expect(inspectImageStructure(png(512, 512), "image/png")).toMatchObject({ ok: true });
  });

  it("refuses bytes that are not an image, a cut-short file, and out-of-range shapes", () => {
    expect(inspectImageStructure(new TextEncoder().encode("<svg/>"))).toEqual({ ok: false, reason: "content-not-image" });
    expect(inspectImageStructure(png(512, 512, { withEnd: false }))).toEqual({ ok: false, reason: "truncated-image" });
    expect(inspectImageStructure(png(64, 64))).toEqual({ ok: false, reason: "dimensions-out-of-range" });
    expect(inspectImageStructure(png(MAX_IMAGE_SIDE_PX + 1, 512))).toEqual({ ok: false, reason: "dimensions-out-of-range" });
    expect(inspectImageStructure(png(2048, 512))).toEqual({ ok: false, reason: "aspect-ratio-out-of-range" });
  });

  it("settles every hostile input as a closed result without throwing", () => {
    let seed = 0x2f6e2b1;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const prefixes = [[0xff, 0xd8, 0xff], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], []];
    for (let round = 0; round < 400; round += 1) {
      const prefix = prefixes[round % prefixes.length] ?? [];
      const body = Array.from({ length: next() % 96 }, () => next() & 0xff);
      const result = inspectImageStructure(Uint8Array.from([...prefix, ...body]));
      expect(typeof result.ok).toBe("boolean");
      if (!result.ok) expect(IMAGE_STRUCTURE_REFUSAL_REASONS).toContain(result.reason);
    }
  });

  it("is a subset of what the server gate can report, so no reason is unnamed there", () => {
    for (const reason of IMAGE_STRUCTURE_REFUSAL_REASONS) expect(IMAGE_REFUSAL_REASONS).toContain(reason);
  });
});
