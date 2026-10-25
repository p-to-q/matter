import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import type { GeneratedPicture } from "../runtime/picture-turn";
import type { ImagePointer } from "../tree/image-pointer";
import type { TreeMutation } from "../tree/model";
import type { PictureSessionCache } from "./picture-session-cache";

export type ReplaceImageMutation = Extract<TreeMutation, { type: "replace-image" }>;

/**
 * The store's side of Keep. It receives only the mutation: the tree id,
 * revision, command identity, and clock belong to the store that owns the
 * document, not to this module. `stale` means the document or node moved on;
 * `rejected` means the engine refused the change for another reason.
 */
export type PictureCommit = (mutation: ReplaceImageMutation) => "committed" | "stale" | "rejected";

export type AcceptPictureInput = Readonly<{
  picture: GeneratedPicture;
  nodeId: string;
  expectedUpdatedAt: string;
  expectedImage: ImagePointer | null;
  blobRepository: Pick<ImageBlobRepository, "putImageBlob">;
  commit: PictureCommit;
  cache: PictureSessionCache;
}>;

export type AcceptPictureResult =
  | Readonly<{ ok: true }>
  /**
   * The bytes could not be made durable, so nothing was committed. They stay in
   * the session cache, and the same picture can be kept again at no cost.
   */
  | Readonly<{ ok: false; reason: "not-saved"; keptInSession: boolean }>
  | Readonly<{ ok: false; reason: "blob-rejected" | "blob-superseded" | "stale" | "commit-rejected" }>;

/**
 * Keep. The order is the invariant: the bytes are durably held before the tree
 * names them, because a pointer to bytes that cannot be saved is a promise this
 * session cannot keep. A commit that fails afterwards leaves the blob behind;
 * collection is orphan-tolerant and never runs here.
 */
export async function acceptPicture(input: AcceptPictureInput): Promise<AcceptPictureResult> {
  const { picture, cache } = input;
  const stored = await input.blobRepository.putImageBlob(picture.pointer, picture.bytes.slice().buffer);
  if (!stored.ok) {
    switch (stored.code) {
      case "STORAGE_FULL":
      case "STORAGE_UNAVAILABLE":
        return Object.freeze({ ok: false, reason: "not-saved", keptInSession: cache.putBatchIfRoom([picture]) });
      case "REJECTED":
        return Object.freeze({ ok: false, reason: "blob-rejected" });
      case "SUPERSEDED":
        return Object.freeze({ ok: false, reason: "blob-superseded" });
    }
  }

  const outcome = input.commit({
    type: "replace-image",
    nodeId: input.nodeId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    expectedImage: input.expectedImage,
    image: picture.pointer,
  });
  if (outcome === "stale") return Object.freeze({ ok: false, reason: "stale" });
  if (outcome === "rejected") return Object.freeze({ ok: false, reason: "commit-rejected" });
  // A convenience mirror cannot evict another passage's only surviving bytes.
  cache.putBatchIfRoom([picture]);
  return Object.freeze({ ok: true });
}
