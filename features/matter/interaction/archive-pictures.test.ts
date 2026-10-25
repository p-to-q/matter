import { describe, expect, it, vi } from "vitest";
import type {
  ImageBlobFailureCode,
  ImageBlobRead,
  ImageBlobRepository,
  ImageBlobResult,
} from "../persistence/image-blob-repository";
import type { ImagePointer } from "../tree/image-pointer";
import type { ThoughtNode, ThoughtTree } from "../tree/model";
import { collectPictureBlobs, restorePictureBlobs } from "./archive-pictures";
import { createPictureSessionCache } from "./picture-session-cache";

function pictureOf(letter: string, length = 4): Readonly<{ bytes: Uint8Array; pointer: ImagePointer }> {
  return {
    bytes: new Uint8Array(length).fill(letter.charCodeAt(0)),
    pointer: {
      mediaType: "image/png",
      byteLength: length,
      width: 512,
      height: 256,
      contentHash: letter.repeat(64),
    },
  };
}

function treeWith(...pointers: ReadonlyArray<ImagePointer | null>): ThoughtTree {
  const nodes: Record<string, ThoughtNode> = {};
  pointers.forEach((pointer, index) => {
    nodes[`n${index}`] = {
      id: `n${index}`,
      text: "passage",
      ...(pointer === null ? {} : { image: pointer }),
      parentId: null,
      children: [],
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-12T00:00:00.000Z",
    };
  });
  return { protocolVersion: "0.2", id: "tree", rootId: null, nodes, revision: 1 };
}

const found = (picture: ReturnType<typeof pictureOf>): ImageBlobResult<ImageBlobRead> => ({
  ok: true,
  value: {
    status: "found",
    blob: {
      pointer: picture.pointer,
      bytes: picture.bytes.slice().buffer,
      storedAt: "2026-10-12T00:00:00.000Z",
    },
  },
});
const read = (status: "absent" | "damaged"): ImageBlobResult<ImageBlobRead> => ({
  ok: true,
  value: { status },
});
const refused = (code: ImageBlobFailureCode) => ({ ok: false, code }) as const;

function repositoryOf(overrides: Partial<ImageBlobRepository>): ImageBlobRepository {
  return {
    putImageBlob: vi.fn(() => Promise.resolve({ ok: true, value: "written" } as const)),
    getImageBlob: vi.fn(() => Promise.resolve(read("absent"))),
    listImageBlobHashes: vi.fn(),
    ...overrides,
  } as ImageBlobRepository;
}

describe("collectPictureBlobs", () => {
  it("reads the session cache first and never asks the store for what it holds", async () => {
    const a = pictureOf("a");
    const cache = createPictureSessionCache();
    cache.put(a);
    const getImageBlob = vi.fn(() => Promise.resolve(read("absent")));
    const blobs = await collectPictureBlobs(treeWith(a.pointer), {
      cache,
      repository: repositoryOf({ getImageBlob }),
    });
    expect([...blobs.keys()]).toEqual([a.pointer.contentHash]);
    expect(Array.from(blobs.get(a.pointer.contentHash) ?? [])).toEqual(Array.from(a.bytes));
    expect(getImageBlob).not.toHaveBeenCalled();
  });

  it("falls back to the store for what the cache does not hold", async () => {
    const b = pictureOf("b", 6);
    const getImageBlob = vi.fn((hash: string) => Promise.resolve(hash === b.pointer.contentHash ? found(b) : read("absent")));
    const blobs = await collectPictureBlobs(treeWith(b.pointer), {
      cache: createPictureSessionCache(),
      repository: repositoryOf({ getImageBlob }),
    });
    expect(getImageBlob).toHaveBeenCalledWith(b.pointer.contentHash);
    expect(Array.from(blobs.get(b.pointer.contentHash) ?? [])).toEqual(Array.from(b.bytes));
  });

  it("omits absent, damaged, refused, and throwing hashes without stopping the rest", async () => {
    const [absent, damaged, full, thrown, good] = ["c", "d", "e", "f", "g"].map((letter) => pictureOf(letter));
    const getImageBlob = vi.fn((hash: string) => {
      if (hash === absent!.pointer.contentHash) return Promise.resolve(read("absent"));
      if (hash === damaged!.pointer.contentHash) return Promise.resolve(read("damaged"));
      if (hash === full!.pointer.contentHash) return Promise.resolve(refused("STORAGE_UNAVAILABLE"));
      if (hash === thrown!.pointer.contentHash) return Promise.reject(new Error("boom"));
      return Promise.resolve(found(good!));
    });
    const blobs = await collectPictureBlobs(
      treeWith(absent!.pointer, damaged!.pointer, full!.pointer, thrown!.pointer, good!.pointer),
      { cache: createPictureSessionCache(), repository: repositoryOf({ getImageBlob }) },
    );
    expect([...blobs.keys()]).toEqual([good!.pointer.contentHash]);
    expect(getImageBlob).toHaveBeenCalledTimes(5);
  });

  it("collapses nodes that share a hash and ignores passages without pictures", async () => {
    const a = pictureOf("a");
    const getImageBlob = vi.fn(() => Promise.resolve(found(a)));
    const blobs = await collectPictureBlobs(treeWith(a.pointer, null, a.pointer), {
      cache: createPictureSessionCache(),
      repository: repositoryOf({ getImageBlob }),
    });
    expect(blobs.size).toBe(1);
    expect(getImageBlob).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map for a tree with no pictures and never touches the store", async () => {
    const getImageBlob = vi.fn();
    const blobs = await collectPictureBlobs(treeWith(null), {
      cache: createPictureSessionCache(),
      repository: repositoryOf({ getImageBlob }),
    });
    expect(blobs.size).toBe(0);
    expect(getImageBlob).not.toHaveBeenCalled();
  });
});

describe("restorePictureBlobs", () => {
  it("refuses the entire session fallback batch without evicting the current document", async () => {
    const [old, a, b] = ["a", "b", "c"].map((letter) => pictureOf(letter));
    const cache = createPictureSessionCache({ maxEntries: 2, maxBytes: 8 });
    cache.put(old!);
    const before = cache.snapshot();
    const result = await restorePictureBlobs(
      new Map([[a!.pointer.contentHash, a!.bytes], [b!.pointer.contentHash, b!.bytes]]),
      treeWith(a!.pointer, b!.pointer),
      { cache, repository: repositoryOf({ putImageBlob: async () => refused("STORAGE_FULL") }) },
    );
    expect(result).toBeNull();
    expect(cache.snapshot()).toEqual(before);
    expect(await collectPictureBlobs(treeWith(old!.pointer), {
      cache, repository: repositoryOf({}),
    })).toEqual(before);
  });

  it("accepts durable imported bytes at a full cache without evicting sole-copy pictures", async () => {
    const old = pictureOf("a");
    const incoming = pictureOf("b");
    const cache = createPictureSessionCache({ maxEntries: 1, maxBytes: 4 });
    cache.put(old);
    const before = cache.snapshot();
    expect(await restorePictureBlobs(new Map([[incoming.pointer.contentHash, incoming.bytes]]),
      treeWith(incoming.pointer), { cache, repository: repositoryOf({}) }))
      .toEqual({ saved: 1, keptInSession: 0 });
    expect(cache.snapshot()).toEqual(before);
  });

  it("rechecks capacity after an overlapping restore has retained its own session bytes", async () => {
    const a = pictureOf("a");
    const b = pictureOf("b");
    const cache = createPictureSessionCache({ maxEntries: 1, maxBytes: 4 });
    let release!: (value: ImageBlobResult<"written">) => void;
    const first = restorePictureBlobs(new Map([[a.pointer.contentHash, a.bytes]]), treeWith(a.pointer), {
      cache, repository: repositoryOf({ putImageBlob: () => new Promise((resolve) => { release = resolve; }) }),
    });
    expect(await restorePictureBlobs(new Map([[b.pointer.contentHash, b.bytes]]), treeWith(b.pointer), {
      cache, repository: repositoryOf({ putImageBlob: async () => refused("STORAGE_FULL") }),
    })).toEqual({ saved: 0, keptInSession: 1 });
    release(refused("STORAGE_FULL"));
    expect(await first).toBeNull();
    expect(cache.get(b.pointer.contentHash)?.bytes).toEqual(b.bytes);
    expect(cache.has(a.pointer.contentHash)).toBe(false);
  });

  it("stores each imported blob under its pointer and seeds the cache for the first render", async () => {
    const a = pictureOf("a");
    const b = pictureOf("b", 8);
    const putImageBlob = vi.fn<ImageBlobRepository["putImageBlob"]>(() => Promise.resolve({ ok: true, value: "written" } as const));
    const cache = createPictureSessionCache();
    const result = await restorePictureBlobs(
      new Map([[a.pointer.contentHash, a.bytes], [b.pointer.contentHash, b.bytes]]),
      treeWith(a.pointer, b.pointer),
      { cache, repository: repositoryOf({ putImageBlob }) },
    );
    expect(result).toEqual({ saved: 2, keptInSession: 0 });
    expect(putImageBlob).toHaveBeenCalledTimes(2);
    expect(putImageBlob.mock.calls.map(([pointer]) => pointer.contentHash))
      .toEqual([a.pointer.contentHash, b.pointer.contentHash]);
    expect(cache.has(a.pointer.contentHash)).toBe(true);
    expect(cache.has(b.pointer.contentHash)).toBe(true);
  });

  it("counts a held hash as saved", async () => {
    const a = pictureOf("a");
    const result = await restorePictureBlobs(
      new Map([[a.pointer.contentHash, a.bytes]]),
      treeWith(a.pointer),
      {
        cache: createPictureSessionCache(),
        repository: repositoryOf({ putImageBlob: () => Promise.resolve({ ok: true, value: "present" }) }),
      },
    );
    expect(result).toEqual({ saved: 1, keptInSession: 0 });
  });

  it.each(["STORAGE_FULL", "STORAGE_UNAVAILABLE", "SUPERSEDED", "REJECTED"] as const)(
    "keeps the bytes in the session when the store answers %s, and does not abort",
    async (code) => {
      const a = pictureOf("a");
      const b = pictureOf("b");
      const putImageBlob = vi.fn((pointer: ImagePointer) =>
        Promise.resolve(pointer.contentHash === a.pointer.contentHash
          ? refused(code)
          : ({ ok: true, value: "written" } as const)));
      const cache = createPictureSessionCache();
      const result = await restorePictureBlobs(
        new Map([[a.pointer.contentHash, a.bytes], [b.pointer.contentHash, b.bytes]]),
        treeWith(a.pointer, b.pointer),
        { cache, repository: repositoryOf({ putImageBlob }) },
      );
      expect(result).toEqual({ saved: 1, keptInSession: 1 });
      expect(Array.from(cache.get(a.pointer.contentHash)?.bytes ?? [])).toEqual(Array.from(a.bytes));
      expect(putImageBlob).toHaveBeenCalledTimes(2);
    },
  );

  it("treats a store that throws as a refusal", async () => {
    const a = pictureOf("a");
    const cache = createPictureSessionCache();
    const result = await restorePictureBlobs(new Map([[a.pointer.contentHash, a.bytes]]), treeWith(a.pointer), {
      cache,
      repository: repositoryOf({ putImageBlob: () => Promise.reject(new Error("boom")) }),
    });
    expect(result).toEqual({ saved: 0, keptInSession: 1 });
    expect(cache.has(a.pointer.contentHash)).toBe(true);
  });

  it("copies the bytes: a caller reusing its array afterwards alters neither the store write nor the cache", async () => {
    const a = pictureOf("a");
    const mine = a.bytes.slice();
    const written: number[][] = [];
    const putImageBlob = vi.fn((_pointer: ImagePointer, bytes: ArrayBuffer) => {
      // The store reads its buffer after later work has run.
      return new Promise<ImageBlobResult<"written">>((resolve) => {
        setTimeout(() => {
          written.push(Array.from(new Uint8Array(bytes)));
          resolve({ ok: true, value: "written" });
        }, 0);
      });
    });
    const cache = createPictureSessionCache();
    const pending = restorePictureBlobs(new Map([[a.pointer.contentHash, mine]]), treeWith(a.pointer), {
      cache,
      repository: repositoryOf({ putImageBlob }),
    });
    mine.fill(0);
    await pending;
    expect(written).toEqual([Array.from(a.bytes)]);
    expect(Array.from(cache.get(a.pointer.contentHash)?.bytes ?? [])).toEqual(Array.from(a.bytes));
  });

  it("passes the store its own buffer, not a view onto the caller's", async () => {
    const a = pictureOf("a");
    const source = a.bytes.slice();
    let received: ArrayBuffer | null = null;
    await restorePictureBlobs(new Map([[a.pointer.contentHash, source]]), treeWith(a.pointer), {
      cache: createPictureSessionCache(),
      repository: repositoryOf({
        putImageBlob: (_pointer, bytes) => {
          received = bytes;
          return Promise.resolve({ ok: true, value: "written" });
        },
      }),
    });
    expect(received).not.toBeNull();
    expect(received).not.toBe(source.buffer);
    expect((received as unknown as ArrayBuffer).byteLength).toBe(a.pointer.byteLength);
  });

  it("does nothing for an archive without pictures", async () => {
    const putImageBlob = vi.fn();
    const result = await restorePictureBlobs(new Map(), treeWith(null), {
      cache: createPictureSessionCache(),
      repository: repositoryOf({ putImageBlob }),
    });
    expect(result).toEqual({ saved: 0, keptInSession: 0 });
    expect(putImageBlob).not.toHaveBeenCalled();
  });

  it("skips a blob the tree does not name", async () => {
    const a = pictureOf("a");
    const putImageBlob = vi.fn();
    const cache = createPictureSessionCache();
    const result = await restorePictureBlobs(new Map([[a.pointer.contentHash, a.bytes]]), treeWith(null), {
      cache,
      repository: repositoryOf({ putImageBlob }),
    });
    expect(result).toEqual({ saved: 0, keptInSession: 0 });
    expect(putImageBlob).not.toHaveBeenCalled();
    expect(cache.has(a.pointer.contentHash)).toBe(false);
  });
});
