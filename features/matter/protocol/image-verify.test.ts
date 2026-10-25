import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImagePointer } from "../tree/image-pointer";
import { verifyPictureBytes } from "./image-verify";

function png(width: number, height: number, filler = 40, { withEnd = true } = {}): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const end = withEnd ? [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82] : [];
  return Uint8Array.from([...header, ...new Array<number>(filler).fill(9), ...end]);
}

function pointerOf(bytes: Uint8Array, overrides: Partial<ImagePointer> = {}): ImagePointer {
  return {
    mediaType: "image/png",
    byteLength: bytes.byteLength,
    width: 512,
    height: 384,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyPictureBytes", () => {
  it("accepts bytes that are exactly the picture the pointer names", async () => {
    const bytes = png(512, 384);
    await expect(verifyPictureBytes(pointerOf(bytes), bytes)).resolves.toEqual({ ok: true });
  });

  it("accepts an ArrayBuffer and a view into a larger buffer alike", async () => {
    const bytes = png(512, 384);
    const pointer = pointerOf(bytes);
    await expect(verifyPictureBytes(pointer, bytes.buffer)).resolves.toEqual({ ok: true });
    const padded = new Uint8Array(bytes.byteLength + 10);
    padded.set(bytes, 5);
    await expect(verifyPictureBytes(pointer, padded.subarray(5, 5 + bytes.byteLength))).resolves.toEqual({ ok: true });
  });

  it.each([
    ["one byte short", (bytes: Uint8Array<ArrayBuffer>) => bytes.slice(0, bytes.byteLength - 1), "size-mismatch"],
    ["one byte long", (bytes: Uint8Array<ArrayBuffer>) => Uint8Array.from([...bytes, 0]), "size-mismatch"],
    ["a flipped byte", (bytes: Uint8Array<ArrayBuffer>) => bytes.map((value, index) => (index === 40 ? value ^ 1 : value)), "hash-mismatch"],
  ] as const)("reports %s", async (_label, change, fault) => {
    const bytes = png(512, 384);
    await expect(verifyPictureBytes(pointerOf(bytes), change(bytes))).resolves.toEqual({ ok: false, fault });
  });

  it("checks length before hashing, so a size lie never costs a digest", async () => {
    const digest = vi.fn();
    vi.stubGlobal("crypto", { subtle: { digest } });
    const bytes = png(512, 384);
    await expect(verifyPictureBytes(pointerOf(bytes, { byteLength: bytes.byteLength + 1 }), bytes))
      .resolves.toEqual({ ok: false, fault: "size-mismatch" });
    expect(digest).not.toHaveBeenCalled();
  });

  it("refuses correctly hashed bytes that are not the pointer's picture", async () => {
    const cut = png(512, 384, 40, { withEnd: false });
    const text = new TextEncoder().encode("a private sentence that is not a picture at all");
    const cases: ReadonlyArray<readonly [string, Uint8Array<ArrayBuffer>, Partial<ImagePointer>]> = [
      ["a truncated file", cut, {}],
      ["not an image", text, {}],
      ["a different width", png(512, 384), { width: 513 }],
      ["a different height", png(512, 384), { height: 385 }],
      ["a different media type", png(512, 384), { mediaType: "image/webp" }],
      ["dimensions out of range", png(100, 100), { width: 100, height: 100 }],
    ];
    for (const [label, bytes, overrides] of cases) {
      await expect(verifyPictureBytes(pointerOf(bytes, overrides), bytes), label)
        .resolves.toEqual({ ok: false, fault: "structure-invalid" });
    }
  });

  it("says the digest is unavailable instead of judging the bytes", async () => {
    vi.stubGlobal("crypto", {});
    const bytes = png(512, 384);
    await expect(verifyPictureBytes(pointerOf(bytes), bytes))
      .resolves.toEqual({ ok: false, fault: "digest-unavailable" });
  });
});
