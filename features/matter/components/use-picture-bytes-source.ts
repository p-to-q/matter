"use client";

import { useEffect, useState } from "react";
import {
  createPictureBytesSource,
  type PictureBytesSource,
} from "../interaction/picture-bytes-source";
import { createPictureSessionCache } from "../interaction/picture-session-cache";
import { createImageBlobRepository } from "../persistence/image-blob-repository";
import { createMatterDatabaseHandle } from "../persistence/matter-database";

/**
 * One session cache and one lazily opened read connection for the mount. Each
 * persistence module keeps its own handle, so this one is private to picture
 * reads; it opens nothing until a passage that carries a picture asks for its
 * bytes, and it is released with the mount.
 */
export function usePictureBytesSource(): PictureBytesSource {
  const [owner] = useState(() => {
    const handle = createMatterDatabaseHandle();
    const source = createPictureBytesSource({
      cache: createPictureSessionCache(),
      repository: createImageBlobRepository(handle),
    });
    return Object.freeze({ handle, source });
  });
  useEffect(() => () => owner.handle.close(), [owner]);
  return owner.source;
}
