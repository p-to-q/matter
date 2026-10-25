"use client";

import { useEffect, useState } from "react";
import type { RestoredPictures } from "../interaction/archive-pictures";
import {
  UNAVAILABLE_PICTURE_BYTES,
  type PictureBytesSource,
} from "../interaction/picture-bytes-source";
import type { ImagePointer } from "../tree/image-pointer";
import type { ThoughtTree } from "../tree/model";
import type { PictureStore } from "./picture-store";

/**
 * The mount's door to picture bytes. The store itself (cache, blob connection,
 * archive collect and restore) is a lazy chunk built on the first thing that
 * needs it: a passage that carries a picture, a Keep, or an archive that has
 * pictures. A document without pictures never loads or constructs any of it.
 */
export type PictureStoreAccess = Readonly<{
  /** Builds the one store on first call; a failed load is retried by the next call. */
  load: () => Promise<PictureStore>;
  /** What passages read; honest `unavailable` when the store cannot be loaded. */
  bytes: PictureBytesSource;
  /** Empty, without loading anything, when the tree names no picture. */
  collectBlobs: (tree: ThoughtTree) => Promise<ReadonlyMap<string, Uint8Array>>;
  /** Null refuses restoration when no holder exists; an empty archive loads nothing. */
  restoreBlobs: (
    blobs: ReadonlyMap<string, Uint8Array>,
    tree: ThoughtTree,
  ) => Promise<RestoredPictures | null>;
  /** Releases ownership and pending loads; a later call may open a new store. */
  close: () => void;
}>;

const NO_BLOBS: ReadonlyMap<string, Uint8Array> = new Map();

export function createPictureStoreAccess(
  importStore: () => Promise<typeof import("./picture-store")> = () => import("./picture-store"),
): PictureStoreAccess {
  let loading: Promise<PictureStore> | null = null;
  let loaded: PictureStore | null = null;
  let generation = 0;
  const load = (): Promise<PictureStore> => {
    if (loading !== null) return loading;
    const loadGeneration = generation;
    const pending: Promise<PictureStore> = Promise.resolve()
      .then(() => {
        if (loadGeneration !== generation) throw new Error("Picture store load was closed.");
        return importStore();
      })
      .then((module) => {
        // A chunk that arrives after cleanup must not create a new resource.
        if (loadGeneration !== generation) throw new Error("Picture store load was closed.");
        loaded = module.createPictureStore();
        return loaded;
      })
      .catch((error: unknown) => {
        if (loading === pending) loading = null;
        throw error;
      });
    loading = pending;
    return pending;
  };
  const owns = (store: PictureStore, startedIn: number) =>
    generation === startedIn && loaded === store;
  return Object.freeze({
    load,
    bytes: Object.freeze({
      async read(pointer: ImagePointer) {
        const startedIn = generation;
        let store: PictureStore;
        try {
          store = await load();
        } catch {
          return UNAVAILABLE_PICTURE_BYTES.read(pointer);
        }
        if (!owns(store, startedIn)) return UNAVAILABLE_PICTURE_BYTES.read(pointer);
        return store.bytes.read(pointer);
      },
    }),
    async collectBlobs(tree) {
      if (!Object.values(tree.nodes).some((node) => node.image !== undefined)) return NO_BLOBS;
      const startedIn = generation;
      try {
        const store = await load();
        if (!owns(store, startedIn)) return NO_BLOBS;
        return await store.collectBlobs(tree);
      } catch {
        // A picture this device cannot produce is left out and counted, never an error.
        return NO_BLOBS;
      }
    },
    async restoreBlobs(blobs, tree) {
      if (blobs.size === 0) return Object.freeze({ saved: 0, keptInSession: 0 });
      const startedIn = generation;
      try {
        const store = await load();
        if (!owns(store, startedIn)) return null;
        const restored = await store.restoreBlobs(blobs, tree);
        // Accepted writes may finish, but a closed holder cannot admit an import.
        return owns(store, startedIn) ? restored : null;
      } catch {
        return null;
      }
    },
    close() {
      const store = loaded;
      generation += 1;
      loaded = null;
      loading = null;
      store?.close();
    },
  });
}

export function usePictureStore(): PictureStoreAccess {
  const [access] = useState(() => createPictureStoreAccess());
  useEffect(() => () => access.close(), [access]);
  return access;
}
