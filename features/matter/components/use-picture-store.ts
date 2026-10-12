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
  /** Nothing to restore, nothing loaded, when the archive carries no picture. */
  restoreBlobs: (
    blobs: ReadonlyMap<string, Uint8Array>,
    tree: ThoughtTree,
  ) => Promise<RestoredPictures>;
  /** Releases the blob connection if one was ever opened. */
  close: () => void;
}>;

const NO_BLOBS: ReadonlyMap<string, Uint8Array> = new Map();

export function createPictureStoreAccess(
  importStore: () => Promise<typeof import("./picture-store")> = () => import("./picture-store"),
): PictureStoreAccess {
  let loading: Promise<PictureStore> | null = null;
  let loaded: PictureStore | null = null;
  const load = () => {
    loading ??= importStore().then(
      (module) => {
        loaded = module.createPictureStore();
        return loaded;
      },
      (error: unknown) => {
        loading = null;
        throw error;
      },
    );
    return loading;
  };
  return Object.freeze({
    load,
    bytes: Object.freeze({
      async read(pointer: ImagePointer) {
        let store: PictureStore;
        try {
          store = await load();
        } catch {
          return UNAVAILABLE_PICTURE_BYTES.read(pointer);
        }
        return store.bytes.read(pointer);
      },
    }),
    async collectBlobs(tree) {
      if (!Object.values(tree.nodes).some((node) => node.image !== undefined)) return NO_BLOBS;
      try {
        return await (await load()).collectBlobs(tree);
      } catch {
        // A picture this device cannot produce is left out and counted, never an error.
        return NO_BLOBS;
      }
    },
    async restoreBlobs(blobs, tree) {
      if (blobs.size === 0) return Object.freeze({ saved: 0, keptInSession: 0 });
      try {
        return await (await load()).restoreBlobs(blobs, tree);
      } catch {
        return Object.freeze({ saved: 0, keptInSession: blobs.size });
      }
    },
    close() {
      loaded?.close();
    },
  });
}

export function usePictureStore(): PictureStoreAccess {
  const [access] = useState(() => createPictureStoreAccess());
  useEffect(() => () => access.close(), [access]);
  return access;
}
