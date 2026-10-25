import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import type { GeneratedPicture } from "../runtime/picture-turn";
import type { ImagePointer } from "../tree/image-pointer";
import type { ThoughtTree } from "../tree/model";
import type { PictureSessionCache } from "./picture-session-cache";

/**
 * How picture bytes cross the archive boundary. The archive transport verifies
 * and orders; this decides where the bytes come from on export and where they
 * go on import. The session cache and the durable store are the same two
 * holders the picture surfaces already read, so no third copy exists.
 */
export type ArchivePictureDependencies = Readonly<{
  cache: PictureSessionCache;
  repository: ImageBlobRepository;
}>;

export type RestoredPictures = Readonly<{
  /** Bytes now durable on this device. */
  saved: number;
  /** Bytes the store refused: shown and exportable this session, gone with the tab. */
  keptInSession: number;
}>;

/**
 * Bytes for every distinct picture the tree names that this device can still
 * produce. A hash with no usable bytes is omitted, never an error: the export
 * counts it in `missingImages`, so a missing picture cannot cost the archive.
 */
export async function collectPictureBlobs(
  tree: ThoughtTree,
  dependencies: ArchivePictureDependencies,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const hashes = [...pointersByHash(tree).keys()];
  const found = await Promise.all(hashes.map((hash) => bytesFor(hash, dependencies)));
  const blobs = new Map<string, Uint8Array>();
  hashes.forEach((hash, index) => {
    const bytes = found[index];
    if (bytes !== undefined) blobs.set(hash, bytes);
  });
  return blobs;
}

/**
 * Stores imported bytes before the imported tree becomes the document, so its
 * first render reads them. Refuses when carried bytes cannot all be retained
 * without evicting an existing holder: a later rejected tree import must not
 * destroy the current document's session-only pictures. Accepted durable writes
 * remain harmless content-addressed orphans when the import is refused.
 */
export async function restorePictureBlobs(
  blobs: ReadonlyMap<string, Uint8Array>,
  tree: ThoughtTree,
  dependencies: ArchivePictureDependencies,
): Promise<RestoredPictures | null> {
  const pointers = pointersByHash(tree);
  // Freeze every caller-owned array before the first repository await.
  const importedPictures: GeneratedPicture[] = [];
  for (const [hash, imported] of blobs) {
    const pointer = pointers.get(hash);
    if (pointer !== undefined) importedPictures.push({ pointer, bytes: imported.slice() });
  }
  const sessionOnly: GeneratedPicture[] = [];
  const durablePictures: GeneratedPicture[] = [];
  let saved = 0;
  for (const picture of importedPictures) {
    const { bytes, pointer } = picture;
    let durable = false;
    try {
      durable = (await dependencies.repository.putImageBlob(pointer, bytes.slice().buffer)).ok;
    } catch {
      // A port that throws is a refusal like any other.
    }
    if (durable) {
      saved += 1;
      durablePictures.push(picture);
    } else sessionOnly.push(picture);
  }
  if (!dependencies.cache.putBatchIfRoom(sessionOnly)) return null;
  // Durable bytes already have an authority; warming their mirror is optional.
  for (const picture of durablePictures) dependencies.cache.putBatchIfRoom([picture]);
  return Object.freeze({ saved, keptInSession: sessionOnly.length });
}

function pointersByHash(tree: ThoughtTree): ReadonlyMap<string, ImagePointer> {
  const pointers = new Map<string, ImagePointer>();
  for (const node of Object.values(tree.nodes)) {
    if (node.image !== undefined && !pointers.has(node.image.contentHash)) {
      pointers.set(node.image.contentHash, node.image);
    }
  }
  return pointers;
}

async function bytesFor(
  hash: string,
  dependencies: ArchivePictureDependencies,
): Promise<Uint8Array | undefined> {
  const held = dependencies.cache.get(hash);
  if (held !== undefined) return held.bytes;
  try {
    const read = await dependencies.repository.getImageBlob(hash);
    return read.ok && read.value.status === "found"
      ? new Uint8Array(read.value.blob.bytes.slice(0))
      : undefined;
  } catch {
    return undefined;
  }
}
