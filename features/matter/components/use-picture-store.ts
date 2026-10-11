"use client";

import { useEffect, useState } from "react";
import {
  createPictureBytesSource,
  type PictureBytesSource,
} from "../interaction/picture-bytes-source";
import {
  createPictureSessionCache,
  type PictureSessionCache,
} from "../interaction/picture-session-cache";
import {
  createImageBlobRepository,
  type ImageBlobRepository,
} from "../persistence/image-blob-repository";
import { createMatterDatabaseHandle } from "../persistence/matter-database";

/**
 * The mount's one holder of picture bytes: what passages read, and what the
 * archive collects from and restores into.
 */
export type PictureStore = Readonly<{
  bytes: PictureBytesSource;
  cache: PictureSessionCache;
  repository: ImageBlobRepository;
}>;

/**
 * One session cache and one lazily opened read connection for the mount. Each
 * persistence module keeps its own handle, so this one is private to picture
 * bytes; it opens nothing until a passage that carries a picture, or an archive
 * gesture, asks for them, and it is released with the mount.
 */
export function usePictureStore(): PictureStore {
  const [owner] = useState(() => {
    const handle = createMatterDatabaseHandle();
    const cache = createPictureSessionCache();
    const repository = createImageBlobRepository(handle);
    return Object.freeze({
      handle,
      store: Object.freeze({
        bytes: createPictureBytesSource({ cache, repository }),
        cache,
        repository,
      }),
    });
  });
  useEffect(() => () => owner.handle.close(), [owner]);
  return owner.store;
}
