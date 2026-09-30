import { createIndexedDbDocumentRepository } from "./document-repository";
import {
  createPersistenceController,
  type PersistenceController,
  type PersistenceControllerOptions,
} from "./persistence-controller";

/**
 * The durable storage engine: the controller, its IndexedDB repository, the
 * snapshot codec, and the undo journal. It loads behind one lazy boundary,
 * owned by the deferred controller, so none of it taxes the initial graph.
 */
export function createIndexedDbPersistenceController(
  options: PersistenceControllerOptions,
): PersistenceController {
  return createPersistenceController(createIndexedDbDocumentRepository(), {
    storageHeadroom: readStorageHeadroom,
    ...options,
  });
}

/**
 * The origin's remaining quota as the browser estimates it. Engines round or
 * pad the estimate, so the controller treats it as permission to try one
 * write, never as a promise that the write fits.
 */
async function readStorageHeadroom(): Promise<number | null> {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (typeof estimate?.quota !== "number" || typeof estimate.usage !== "number") return null;
    return Math.max(0, estimate.quota - estimate.usage);
  } catch {
    return null;
  }
}
