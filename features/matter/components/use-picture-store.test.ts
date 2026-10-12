import { describe, expect, it, vi } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import type { ImagePointer } from "../tree/image-pointer";
import type { ThoughtTree } from "../tree/model";
import type { PictureStore } from "./picture-store";
import { createPictureStoreAccess } from "./use-picture-store";

const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: 100,
  width: 512,
  height: 512,
  contentHash: "ab".repeat(32),
};

function treeWithPicture(withPicture: boolean): ThoughtTree {
  const tree = createSeededDocument().tree;
  if (!withPicture) return tree;
  const target = Object.keys(tree.nodes).find((id) => id !== tree.rootId)!;
  return { ...tree, nodes: { ...tree.nodes, [target]: { ...tree.nodes[target]!, image: POINTER } } };
}

function fakeStore(): PictureStore {
  return {
    bytes: { read: vi.fn(async () => ({ status: "resident" as const, bytes: new Uint8Array([1]) })) },
    cache: {} as never,
    repository: {} as never,
    collectBlobs: vi.fn(async () => new Map([["h", new Uint8Array([1])]])),
    restoreBlobs: vi.fn(async () => ({ saved: 1, keptInSession: 0 })),
    close: vi.fn(),
  };
}

function setup() {
  const store = fakeStore();
  const createPictureStore = vi.fn(() => store);
  const importStore = vi.fn(async () => ({ createPictureStore }) as never);
  return { store, createPictureStore, importStore, access: createPictureStoreAccess(importStore) };
}

describe("picture store access", () => {
  it("loads and builds nothing until something needs a picture", async () => {
    const { access, importStore, createPictureStore } = setup();

    await expect(access.collectBlobs(treeWithPicture(false))).resolves.toEqual(new Map());
    await expect(access.restoreBlobs(new Map(), treeWithPicture(false))).resolves.toEqual({ saved: 0, keptInSession: 0 });
    access.close();

    expect(importStore).not.toHaveBeenCalled();
    expect(createPictureStore).not.toHaveBeenCalled();
  });

  it("builds the store once, on the first read of a picture, and shares it", async () => {
    const { access, store, importStore, createPictureStore } = setup();

    await expect(access.bytes.read(POINTER)).resolves.toMatchObject({ status: "resident" });
    await expect(access.bytes.read(POINTER)).resolves.toMatchObject({ status: "resident" });
    await expect(access.load()).resolves.toBe(store);

    expect(importStore).toHaveBeenCalledOnce();
    expect(createPictureStore).toHaveBeenCalledOnce();
  });

  it("collects only when the tree names a picture, and restores only what an archive carries", async () => {
    const { access, store, importStore } = setup();
    const tree = treeWithPicture(true);

    await expect(access.collectBlobs(tree)).resolves.toEqual(new Map([["h", new Uint8Array([1])]]));
    expect(store.collectBlobs).toHaveBeenCalledWith(tree);
    const blobs = new Map([["h", new Uint8Array([1])]]);
    await expect(access.restoreBlobs(blobs, tree)).resolves.toEqual({ saved: 1, keptInSession: 0 });
    expect(store.restoreBlobs).toHaveBeenCalledWith(blobs, tree);
    expect(importStore).toHaveBeenCalledOnce();
  });

  it("reads as unavailable, exports nothing and keeps nothing when the chunk cannot load, then retries", async () => {
    const store = fakeStore();
    const importStore = vi.fn()
      .mockRejectedValueOnce(new Error("chunk"))
      .mockRejectedValueOnce(new Error("chunk"))
      .mockRejectedValueOnce(new Error("chunk"))
      .mockResolvedValue({ createPictureStore: () => store });
    const access = createPictureStoreAccess(importStore);
    const tree = treeWithPicture(true);

    await expect(access.bytes.read(POINTER)).resolves.toEqual({ status: "unavailable" });
    await expect(access.collectBlobs(tree)).resolves.toEqual(new Map());
    await expect(access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), tree))
      .resolves.toEqual({ saved: 0, keptInSession: 1 });
    await expect(access.load()).resolves.toBe(store);
  });

  it("closes the connection only if a store was ever built", async () => {
    const { access, store } = setup();
    access.close();
    expect(store.close).not.toHaveBeenCalled();

    await access.load();
    access.close();
    expect(store.close).toHaveBeenCalledOnce();
  });
});
