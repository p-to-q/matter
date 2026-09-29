import type { PersistenceStatus } from "./persistence-controller";

/**
 * The status of a document instance whose stored row has not been read. Both
 * the controller and the facade that stands in while the storage engine loads
 * begin here, so the paper cannot tell them apart.
 */
export const LOADING_PERSISTENCE_STATUS: PersistenceStatus = Object.freeze({
  phase: "loading",
  persistedRevision: null,
  dirtyRevision: null,
  errorCode: null,
  historyNotice: null,
  unsaved: false,
  replaceableByImport: false,
  upgradeBlocked: false,
  conflictOrigin: null,
});

/**
 * The one answer both exit guards use: this tab holds material the person
 * made that no stored row holds. Until the first load is reconciled the
 * controller has not received that material, so authorship alone answers.
 */
export function holdsUnsavedPersonMaterial(
  status: Pick<PersistenceStatus, "unsaved">,
  reconciled: boolean,
  authored: boolean,
): boolean {
  return reconciled ? status.unsaved : authored;
}
