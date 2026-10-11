import type { PictureCommit, ReplaceImageMutation } from "../interaction/accept-picture";
import type { PictureNodeView, PictureVisibilityPort } from "../interaction/picture-driver";
import type { PictureSessionCache } from "../interaction/picture-session-cache";
import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import type { AttachPictureValues } from "../runtime/picture-commit";
import type { PictureStoreReceipt } from "../store/matter-store";

/**
 * Everything the picture turn needs from the composition root, in one value.
 * The bytes, session cache, and blob connection are the mount's own
 * (`usePictureStore`) and the store ports are the document's.
 */
export type PictureAuthoring = Readonly<{
  cache: PictureSessionCache;
  blobRepository: Pick<ImageBlobRepository, "putImageBlob">;
  readNode: (nodeId: string) => PictureNodeView | undefined;
  subscribeTree: (listener: () => void) => () => void;
  documentEpoch: () => number;
  attachPicture: (values: AttachPictureValues, expectedDocumentEpoch: number) => PictureStoreReceipt;
}>;

/** Keep's side of the store: only a committed receipt is a commit, only a stale one is stale. */
export function pictureCommitFromReceipt(
  receipt: Readonly<{ status: string }>,
): ReturnType<PictureCommit> {
  if (receipt.status === "committed") return "committed";
  return receipt.status === "stale" ? "stale" : "rejected";
}

/**
 * The document epoch is the session's own, fixed when it opened, so a Keep
 * after a document switch is stale rather than applied to the new document.
 */
export function createPictureCommit(input: Readonly<{
  attachPicture: PictureAuthoring["attachPicture"];
  documentEpoch: number;
  mintCommandId: () => string;
  now: () => string;
}>): PictureCommit {
  return (mutation: ReplaceImageMutation) => pictureCommitFromReceipt(
    input.attachPicture(
      { commandId: input.mintCommandId(), createdAt: input.now(), mutation },
      input.documentEpoch,
    ),
  );
}

function uniqueSuffix(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function mintPictureRequestId(): string {
  return `picture_request_${uniqueSuffix()}`;
}

export function mintPictureCommandId(): string {
  return `human_picture_${uniqueSuffix()}`;
}

/** The page's visibility as the driver reads it. */
export const BROWSER_PICTURE_VISIBILITY: PictureVisibilityPort = Object.freeze({
  isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  subscribe(listener: () => void) {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
});
