"use client";

import { useMemo } from "react";
import type { PictureAuthoring } from "./picture-authoring";
import type { MatterStoreAccess } from "./use-matter-store";
import type { PictureStore } from "./use-picture-store";

/**
 * Composes the picture turn's dependencies once for the mount, from the shared
 * picture store and the document's store ports. It opens no connection of its
 * own and loads nothing beyond them.
 */
export function usePictureAuthoring(
  store: PictureStore,
  access: MatterStoreAccess,
): PictureAuthoring {
  return useMemo(() => Object.freeze({
    cache: store.cache,
    blobRepository: store.repository,
    readNode: (nodeId: string) => access.getState().tree.nodes[nodeId],
    subscribeTree: (listener: () => void) => {
      let tree = access.getState().tree;
      return access.subscribe(() => {
        const next = access.getState().tree;
        if (next === tree) return;
        tree = next;
        listener();
      });
    },
    documentEpoch: () => access.getState().documentEpoch,
    attachPicture: (
      values: Parameters<PictureAuthoring["attachPicture"]>[0],
      expectedDocumentEpoch: number,
    ) => access.getState().attachPicture(values, expectedDocumentEpoch),
  }), [access, store]);
}
