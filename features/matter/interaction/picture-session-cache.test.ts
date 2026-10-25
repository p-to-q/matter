import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GeneratedPicture } from "../runtime/picture-turn";
import { MAX_TREE_IMAGE_BYTES, MAX_TREE_IMAGE_NODES } from "../tree/image-pointer";
import {
  DEFAULT_PICTURE_SESSION_CACHE_LIMITS,
  createPictureSessionCache,
} from "./picture-session-cache";

describe("picture session cache", () => {
  it("defaults to exactly the tree's image bounds", () => {
    expect(DEFAULT_PICTURE_SESSION_CACHE_LIMITS).toEqual({
      maxEntries: MAX_TREE_IMAGE_NODES,
      maxBytes: MAX_TREE_IMAGE_BYTES,
    });
    expect(Object.isFrozen(DEFAULT_PICTURE_SESSION_CACHE_LIMITS)).toBe(true);
  });

  describe("holding pictures", () => {
    it("stores and returns bytes with the pointer that names them", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      expect(cache.put(held)).toBe(true);

      expect(cache.has(held.pointer.contentHash)).toBe(true);
      const read = cache.get(held.pointer.contentHash)!;
      expect(read.pointer).toEqual(held.pointer);
      expect(Buffer.from(read.bytes).equals(Buffer.from(held.bytes))).toBe(true);
    });

    it("reports a miss for a hash it never held", () => {
      const cache = createPictureSessionCache();
      expect(cache.has("f".repeat(64))).toBe(false);
      expect(cache.get("f".repeat(64))).toBeUndefined();
      expect(cache.delete("f".repeat(64))).toBe(false);
    });

    it("deletes one picture and frees its bytes for the bound", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 600 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      cache.put(a);
      cache.put(b);
      expect(cache.delete(a.pointer.contentHash)).toBe(true);
      expect(cache.has(a.pointer.contentHash)).toBe(false);
      const c = picture(3, 300);
      cache.put(c);
      expect(cache.has(b.pointer.contentHash)).toBe(true);
      expect(cache.has(c.pointer.contentHash)).toBe(true);
    });

    it("holds one entry per hash, however often it is put", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 600 });
      const a = picture(1, 300);
      cache.put(a);
      cache.put(a);
      cache.put(a);
      expect(cache.snapshot().size).toBe(1);
      // Counted once: a second distinct picture still fits in 600 bytes.
      cache.put(picture(2, 300));
      expect(cache.has(a.pointer.contentHash)).toBe(true);
    });
  });

  describe("refusing what does not add up", () => {
    it("refuses bytes whose length differs from the pointer", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      expect(cache.put({ bytes: held.bytes.slice(0, 299), pointer: held.pointer })).toBe(false);
      expect(cache.put({ bytes: new Uint8Array(301), pointer: held.pointer })).toBe(false);
      expect(cache.has(held.pointer.contentHash)).toBe(false);
      expect(cache.snapshot().size).toBe(0);
    });

    it("refuses an invalid pointer", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      expect(cache.put({ bytes: held.bytes, pointer: { ...held.pointer, contentHash: "nothex" } })).toBe(false);
      expect(cache.put({ bytes: held.bytes, pointer: { ...held.pointer, width: 10 } })).toBe(false);
      expect(cache.put({ bytes: held.bytes, pointer: { ...held.pointer, mediaType: "image/gif" as never } })).toBe(false);
      expect(cache.snapshot().size).toBe(0);
    });

    it("keeps what it holds when a refused put names a held hash", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      cache.put(held);
      expect(cache.put({ bytes: new Uint8Array(299), pointer: held.pointer })).toBe(false);
      expect(cache.get(held.pointer.contentHash)!.bytes.byteLength).toBe(300);
    });

    it("refuses one picture larger than the whole byte bound without evicting anything", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 500 });
      const small = picture(1, 300);
      cache.put(small);
      expect(cache.put(picture(2, 501))).toBe(false);
      expect(cache.has(small.pointer.contentHash)).toBe(true);
    });
  });

  describe("bounds and eviction", () => {
    it("refuses an overfull non-evicting batch atomically, preserving bytes and order", () => {
      const cache = createPictureSessionCache({ maxEntries: 2, maxBytes: 600 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      const c = picture(3, 300);
      cache.put(a);
      const before = cache.snapshot();
      expect(cache.putBatchIfRoom([b, c])).toBe(false);
      expect(cache.snapshot()).toEqual(before);
      expect(cache.putBatchIfRoom([b, { ...c, bytes: new Uint8Array(1) }])).toBe(false);
      expect(cache.snapshot()).toEqual(before);
    });

    it("counts shared hashes once and owns bytes in a non-evicting batch", () => {
      const cache = createPictureSessionCache({ maxEntries: 2, maxBytes: 600 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      cache.put(a);
      expect(cache.putBatchIfRoom([a, b, b])).toBe(true);
      const original = b.bytes.slice();
      b.bytes.fill(0);
      expect(cache.snapshot().size).toBe(2);
      expect(cache.get(b.pointer.contentHash)?.bytes).toEqual(original);
      expect(cache.putBatchIfRoom([picture(3, 1)])).toBe(false);
      expect(cache.get(a.pointer.contentHash)?.bytes).toEqual(a.bytes);
    });

    it("refuses non-evicting byte overflow even when entry slots remain", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 600 });
      const a = picture(1, 300);
      cache.put(a);
      expect(cache.putBatchIfRoom([picture(2, 200), picture(3, 101)])).toBe(false);
      expect([...cache.snapshot().keys()]).toEqual([a.pointer.contentHash]);
      expect(cache.putBatchIfRoom([picture(2, 200), picture(3, 100)])).toBe(true);
    });

    it("evicts the oldest first when the entry count is exceeded", () => {
      const cache = createPictureSessionCache({ maxEntries: 3, maxBytes: 10_000 });
      const held = [1, 2, 3, 4, 5].map((seed) => picture(seed, 300));
      held.forEach((entry) => cache.put(entry));
      expect([...cache.snapshot().keys()]).toEqual(held.slice(2).map((entry) => entry.pointer.contentHash));
    });

    it("evicts oldest first until the byte bound holds, and as many as it takes", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 1000 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      const c = picture(3, 300);
      cache.put(a);
      cache.put(b);
      cache.put(c);
      const big = picture(4, 700);
      cache.put(big);
      expect([...cache.snapshot().keys()]).toEqual([c.pointer.contentHash, big.pointer.contentHash]);
    });

    it("never evicts the picture it just stored", () => {
      const cache = createPictureSessionCache({ maxEntries: 1, maxBytes: 300 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      cache.put(a);
      expect(cache.put(b)).toBe(true);
      expect(cache.has(a.pointer.contentHash)).toBe(false);
      expect(cache.has(b.pointer.contentHash)).toBe(true);
    });

    it("treats a repeated put as the newest, so it is evicted last", () => {
      const cache = createPictureSessionCache({ maxEntries: 2, maxBytes: 10_000 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      const c = picture(3, 300);
      cache.put(a);
      cache.put(b);
      cache.put(a);
      cache.put(c);
      expect([...cache.snapshot().keys()]).toEqual([a.pointer.contentHash, c.pointer.contentHash]);
    });

    it("stays within the byte bound exactly at the boundary", () => {
      const cache = createPictureSessionCache({ maxEntries: 8, maxBytes: 600 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      cache.put(a);
      cache.put(b);
      expect(cache.snapshot().size).toBe(2);
      cache.put(picture(3, 1));
      expect(cache.has(a.pointer.contentHash)).toBe(false);
    });

    it("holds at most the tree's image count at the default bound", () => {
      const cache = createPictureSessionCache();
      for (let seed = 1; seed <= MAX_TREE_IMAGE_NODES + 5; seed += 1) cache.put(picture(seed, 300));
      expect(cache.snapshot().size).toBe(MAX_TREE_IMAGE_NODES);
    });
  });

  describe("ownership of bytes", () => {
    it("is unaffected by the caller editing its bytes after put", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      const original = held.bytes.slice();
      cache.put(held);
      held.bytes.fill(0);
      expect(Buffer.from(cache.get(held.pointer.contentHash)!.bytes).equals(Buffer.from(original))).toBe(true);
    });

    it("hands out copies from get", () => {
      const cache = createPictureSessionCache();
      const held = picture(1, 300);
      cache.put(held);
      const first = cache.get(held.pointer.contentHash)!;
      first.bytes.fill(0);
      expect(cache.get(held.pointer.contentHash)!.bytes[1]).not.toBe(0);
    });

    it("hands out a snapshot that later puts, deletes, and byte edits never reach", () => {
      const cache = createPictureSessionCache({ maxEntries: 3, maxBytes: 10_000 });
      const a = picture(1, 300);
      const b = picture(2, 300);
      cache.put(a);
      cache.put(b);
      const snapshot = cache.snapshot();

      cache.put(picture(3, 300));
      cache.delete(b.pointer.contentHash);
      snapshot.get(a.pointer.contentHash)!.fill(0);

      expect([...snapshot.keys()]).toEqual([a.pointer.contentHash, b.pointer.contentHash]);
      expect(Buffer.from(snapshot.get(b.pointer.contentHash)!).equals(Buffer.from(b.bytes))).toBe(true);
      expect(Buffer.from(cache.get(a.pointer.contentHash)!.bytes).equals(Buffer.from(a.bytes))).toBe(true);
    });

    it("snapshot bytes equal the stored bytes, keyed by content hash, oldest first", () => {
      const cache = createPictureSessionCache();
      const a = picture(1, 300);
      const b = picture(2, 400);
      cache.put(a);
      cache.put(b);
      const snapshot = cache.snapshot();
      expect([...snapshot.keys()]).toEqual([a.pointer.contentHash, b.pointer.contentHash]);
      expect(Buffer.from(snapshot.get(b.pointer.contentHash)!).equals(Buffer.from(b.bytes))).toBe(true);
    });

    it("snapshot is a fresh map each time and detached from later editing of an earlier one", () => {
      const cache = createPictureSessionCache();
      const a = picture(1, 300);
      cache.put(a);
      const first = cache.snapshot();
      (first as Map<string, Uint8Array>).clear();
      expect(cache.snapshot().size).toBe(1);
    });
  });
});

function picture(seed: number, length: number): GeneratedPicture {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (index * 31 + seed * 17 + length) % 251;
  return {
    bytes,
    pointer: {
      mediaType: "image/png",
      byteLength: length,
      width: 512,
      height: 384,
      contentHash: createHash("sha256").update(bytes).update(String(seed)).digest("hex"),
    },
  };
}
