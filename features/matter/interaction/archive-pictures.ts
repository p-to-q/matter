import type { ImageBlobRepository } from "../persistence/image-blob-repository";
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
 * first render reads them. Never refuses: a pointer without durable bytes is a
 * state the app already renders honestly, and the session cache keeps what the
 * store would not. Blobs are content-addressed and orphan-tolerant, so
 * restoring for an import that is later cancelled or superseded corrupts
 * nothing and needs no deletion.
 */
export async function restorePictureBlobs(
  blobs: ReadonlyMap<string, Uint8Array>,
  tree: ThoughtTree,
  dependencies: ArchivePictureDependencies,
): Promise<RestoredPictures> {
  const pointers = pointersByHash(tree);
  let saved = 0;
  let keptInSession = 0;
  for (const [hash, imported] of blobs) {
    const pointer = pointers.get(hash);
    if (pointer === undefined) continue;
    // The caller's array may be reused once this resolves.
    const bytes = imported.slice();
    let durable = false;
    try {
      durable = (await dependencies.repository.putImageBlob(pointer, bytes.slice().buffer)).ok;
    } catch {
      // A port that throws is a refusal like any other.
    }
    dependencies.cache.put({ bytes, pointer });
    if (durable) saved += 1;
    else keptInSession += 1;
  }
  return Object.freeze({ saved, keptInSession });
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
