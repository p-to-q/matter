import { describe, expect, it } from "vitest";
import { IMAGE_MEDIA_TYPES, MAX_IMAGE_BYTES, parseImageResultMeta } from "../protocol/image-contract";
import { MAX_IMAGE_SIDE_PX, MIN_IMAGE_SIDE_PX } from "../server/image-bytes";
import {
  cloneImagePointer,
  equalImagePointers,
  IMAGE_POINTER_MEDIA_TYPES,
  MAX_IMAGE_POINTER_BYTES,
  MAX_IMAGE_POINTER_SIDE_PX,
  MIN_IMAGE_POINTER_SIDE_PX,
  parseImagePointer,
  type ImagePointer,
} from "./image-pointer";

const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: 120_000,
  width: 1024,
  height: 768,
  contentHash: "ab".repeat(32),
};

describe("image pointer", () => {
  it("accepts exactly the five fields and returns an owned copy", () => {
    const parsed = parseImagePointer(POINTER);
    expect(parsed).toEqual(POINTER);
    expect(parsed).not.toBe(POINTER);
    expect(parseImagePointer(Object.create(null, Object.fromEntries(
      Object.entries(POINTER).map(([key, value]) => [key, { value, enumerable: true }]),
    )))).toEqual(POINTER);
  });

  it("pins its bounds to the image result contract and the server's size gate", () => {
    expect(MAX_IMAGE_POINTER_BYTES).toBe(MAX_IMAGE_BYTES);
    expect(MIN_IMAGE_POINTER_SIDE_PX).toBe(MIN_IMAGE_SIDE_PX);
    expect(MAX_IMAGE_POINTER_SIDE_PX).toBe(MAX_IMAGE_SIDE_PX);
    expect([...IMAGE_POINTER_MEDIA_TYPES].sort()).toEqual([...IMAGE_MEDIA_TYPES].sort());
    expect(parseImageResultMeta(POINTER)).toEqual(POINTER);
  });

  it("accepts the inclusive limits and rejects one step beyond each", () => {
    expect(parseImagePointer({ ...POINTER, byteLength: 1 })).not.toBeNull();
    expect(parseImagePointer({ ...POINTER, byteLength: MAX_IMAGE_POINTER_BYTES })).not.toBeNull();
    expect(parseImagePointer({ ...POINTER, width: 256, height: 4096 })).not.toBeNull();
    for (const bad of [
      { byteLength: 0 },
      { byteLength: MAX_IMAGE_POINTER_BYTES + 1 },
      { byteLength: 1.5 },
      { byteLength: "100" },
      { byteLength: Number.NaN },
      { width: 255 },
      { width: 4097 },
      { height: 255 },
      { height: 4097 },
      { height: 512.5 },
      { mediaType: "image/gif" },
      { mediaType: "IMAGE/PNG" },
      { contentHash: "AB".repeat(32) },
      { contentHash: "ab".repeat(31) },
      { contentHash: "ab".repeat(33) },
      { contentHash: "zz".repeat(32) },
      { contentHash: 7 },
    ]) {
      expect(parseImagePointer({ ...POINTER, ...bad })).toBeNull();
    }
  });

  it("rejects extra, missing, symbol, and inherited keys and non-plain values", () => {
    expect(parseImagePointer({ ...POINTER, alt: "a picture" })).toBeNull();
    expect(parseImagePointer({ ...POINTER, [Symbol("x")]: 1 })).toBeNull();
    const missing: Record<string, unknown> = { ...POINTER };
    delete missing.contentHash;
    expect(parseImagePointer(missing)).toBeNull();
    expect(parseImagePointer(Object.assign(Object.create(POINTER), {
      mediaType: "image/png",
      byteLength: 1,
      width: 256,
      height: 256,
      extra: true,
    }))).toBeNull();
    expect(parseImagePointer(Object.create(POINTER))).toBeNull();
    for (const value of [null, undefined, "x", 3, [], [POINTER], new Map()]) {
      expect(parseImagePointer(value)).toBeNull();
    }
  });

  it("compares by value and treats absence as null", () => {
    expect(equalImagePointers(POINTER, { ...POINTER })).toBe(true);
    expect(equalImagePointers(null, undefined)).toBe(true);
    expect(equalImagePointers(POINTER, null)).toBe(false);
    expect(equalImagePointers(undefined, POINTER)).toBe(false);
    for (const change of [
      { mediaType: "image/webp" as const },
      { byteLength: 1 },
      { width: 256 },
      { height: 256 },
      { contentHash: "cd".repeat(32) },
    ]) {
      expect(equalImagePointers(POINTER, { ...POINTER, ...change })).toBe(false);
    }
  });

  it("clones to an equal, separate object", () => {
    const clone = cloneImagePointer(POINTER);
    expect(clone).toEqual(POINTER);
    expect(clone).not.toBe(POINTER);
  });
});
