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
  return createPersistenceController(createIndexedDbDocumentRepository(), options);
}
