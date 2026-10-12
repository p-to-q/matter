import {
  collectPictureBlobs,
  restorePictureBlobs,
  type RestoredPictures,
} from "../interaction/archive-pictures";
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
import type { ThoughtTree } from "../tree/model";

/**
 * The mount's one holder of picture bytes: what passages read, and what the
 * archive collects from and restores into. This module is loaded on first need
 * (a passage that carries a picture, a Keep, an archive with pictures), so the
 * initial bundle carries none of it; `use-picture-store` is the only importer.
 */
export type PictureStore = Readonly<{
  bytes: PictureBytesSource;
  cache: PictureSessionCache;
  repository: ImageBlobRepository;
  collectBlobs: (tree: ThoughtTree) => Promise<ReadonlyMap<string, Uint8Array>>;
  restoreBlobs: (
    blobs: ReadonlyMap<string, Uint8Array>,
    tree: ThoughtTree,
  ) => Promise<RestoredPictures>;
  close: () => void;
}>;

/**
 * One session cache and one read connection for the mount. The connection is
 * private to picture bytes (each persistence module keeps its own handle) and
 * opens nothing until the first read or write.
 */
export function createPictureStore(): PictureStore {
  const handle = createMatterDatabaseHandle();
  const cache = createPictureSessionCache();
  const repository = createImageBlobRepository(handle);
  const dependencies = Object.freeze({ cache, repository });
  return Object.freeze({
    bytes: createPictureBytesSource(dependencies),
    cache,
    repository,
    collectBlobs: (tree) => collectPictureBlobs(tree, dependencies),
    restoreBlobs: (blobs, tree) => restorePictureBlobs(blobs, tree, dependencies),
    close: () => handle.close(),
  });
}
