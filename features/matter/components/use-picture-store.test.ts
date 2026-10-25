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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type StoreModule = typeof import("./picture-store");

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
      .resolves.toBeNull();
    await expect(access.load()).resolves.toBe(store);
  });

  it("preserves a real holder's session-only restoration result", async () => {
    const { access, store } = setup();
    vi.mocked(store.restoreBlobs).mockResolvedValue({ saved: 0, keptInSession: 1 });

    await expect(access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), treeWithPicture(true)))
      .resolves.toEqual({ saved: 0, keptInSession: 1 });
    expect(store.restoreBlobs).toHaveBeenCalledOnce();
  });

  it("closes each owned store once and can reopen after cleanup", async () => {
    const { access, store } = setup();
    access.close();
    expect(store.close).not.toHaveBeenCalled();

    await access.load();
    access.close();
    access.close();
    expect(store.close).toHaveBeenCalledOnce();

    await expect(access.load()).resolves.toBe(store);
    access.close();
    expect(store.close).toHaveBeenCalledTimes(2);
  });

  it("does not construct a late chunk or use it for waiting reads, exports or restores", async () => {
    const chunk = deferred<StoreModule>();
    const store = fakeStore();
    const createPictureStore = vi.fn(() => store);
    const importStore = vi.fn(() => chunk.promise);
    const access = createPictureStoreAccess(importStore);
    const tree = treeWithPicture(true);
    const reading = access.bytes.read(POINTER);
    const collecting = access.collectBlobs(tree);
    const restoring = access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), tree);
    await Promise.resolve();
    expect(importStore).toHaveBeenCalledOnce();

    access.close();
    chunk.resolve({ createPictureStore });

    await expect(reading).resolves.toEqual({ status: "unavailable" });
    await expect(collecting).resolves.toEqual(new Map());
    await expect(restoring).resolves.toBeNull();
    expect(createPictureStore).not.toHaveBeenCalled();
    expect(store.bytes.read).not.toHaveBeenCalled();
    expect(store.collectBlobs).not.toHaveBeenCalled();
    expect(store.restoreBlobs).not.toHaveBeenCalled();
    expect(store.close).not.toHaveBeenCalled();
  });

  it("does not start operations on an already loaded store after cleanup wins the await", async () => {
    const { access, store } = setup();
    await access.load();
    const reading = access.bytes.read(POINTER);
    const collecting = access.collectBlobs(treeWithPicture(true));
    const restoring = access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), treeWithPicture(true));

    access.close();

    await expect(reading).resolves.toEqual({ status: "unavailable" });
    await expect(collecting).resolves.toEqual(new Map());
    await expect(restoring).resolves.toBeNull();
    expect(store.bytes.read).not.toHaveBeenCalled();
    expect(store.collectBlobs).not.toHaveBeenCalled();
    expect(store.restoreBlobs).not.toHaveBeenCalled();
    expect(store.close).toHaveBeenCalledOnce();
  });

  it("does not let an old failed load clear a newer pending load", async () => {
    const oldChunk = deferred<StoreModule>();
    const newChunk = deferred<StoreModule>();
    const store = fakeStore();
    const createPictureStore = vi.fn(() => store);
    const importStore = vi.fn()
      .mockReturnValueOnce(oldChunk.promise)
      .mockReturnValueOnce(newChunk.promise);
    const access = createPictureStoreAccess(importStore);
    const oldLoading = access.load();
    const oldFailure = expect(oldLoading).rejects.toThrow("old chunk");
    await Promise.resolve();
    access.close();
    const newLoading = access.load();
    await Promise.resolve();

    oldChunk.reject(new Error("old chunk"));
    await oldFailure;
    expect(access.load()).toBe(newLoading);
    newChunk.resolve({ createPictureStore });
    await expect(newLoading).resolves.toBe(store);
    expect(importStore).toHaveBeenCalledTimes(2);
    expect(createPictureStore).toHaveBeenCalledOnce();
  });

  it("does not let an old fulfilled chunk replace a newer store", async () => {
    const oldChunk = deferred<StoreModule>();
    const oldConstructor = vi.fn(() => fakeStore());
    const newStore = fakeStore();
    const importStore = vi.fn()
      .mockReturnValueOnce(oldChunk.promise)
      .mockResolvedValue({ createPictureStore: () => newStore });
    const access = createPictureStoreAccess(importStore);
    const oldLoading = access.load();
    const oldFailure = expect(oldLoading).rejects.toThrow("closed");
    await Promise.resolve();
    access.close();
    await expect(access.load()).resolves.toBe(newStore);

    oldChunk.resolve({ createPictureStore: oldConstructor });
    await oldFailure;

    await expect(access.load()).resolves.toBe(newStore);
    expect(oldConstructor).not.toHaveBeenCalled();
    expect(importStore).toHaveBeenCalledTimes(2);
    access.close();
    expect(newStore.close).toHaveBeenCalledOnce();
  });

  it("refuses a failed constructor without claiming session bytes and retries", async () => {
    const store = fakeStore();
    const createPictureStore = vi.fn()
      .mockImplementationOnce(() => { throw new Error("construction"); })
      .mockReturnValue(store);
    const importStore = vi.fn(async () => ({ createPictureStore }));
    const access = createPictureStoreAccess(importStore);

    await expect(access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), treeWithPicture(true)))
      .resolves.toBeNull();
    expect(store.restoreBlobs).not.toHaveBeenCalled();
    await expect(access.load()).resolves.toBe(store);
    expect(importStore).toHaveBeenCalledTimes(2);
    expect(createPictureStore).toHaveBeenCalledTimes(2);
  });

  it("turns a synchronous importer failure into a retryable unavailable read", async () => {
    const store = fakeStore();
    const importStore = vi.fn()
      .mockImplementationOnce(() => { throw new Error("import"); })
      .mockResolvedValue({ createPictureStore: () => store });
    const access = createPictureStoreAccess(importStore);

    await expect(access.bytes.read(POINTER)).resolves.toEqual({ status: "unavailable" });
    await expect(access.load()).resolves.toBe(store);
  });

  it.each([
    { saved: 1, keptInSession: 0 },
    { saved: 0, keptInSession: 1 },
  ])("refuses a closed holder's completed restoration without cancelling it: %j", async (result) => {
    const { access, store } = setup();
    const restoration = deferred<{ saved: number; keptInSession: number }>();
    const completed = vi.fn();
    vi.mocked(store.restoreBlobs).mockImplementation(async () => {
      const restored = await restoration.promise;
      completed(restored);
      return restored;
    });
    await access.load();
    const restoring = access.restoreBlobs(new Map([["h", new Uint8Array(1)]]), treeWithPicture(true));
    await Promise.resolve();
    expect(store.restoreBlobs).toHaveBeenCalledOnce();

    access.close();
    restoration.resolve(result);

    await expect(restoring).resolves.toBeNull();
    expect(completed).toHaveBeenCalledWith(result);
    expect(store.close).toHaveBeenCalledOnce();
  });
});
