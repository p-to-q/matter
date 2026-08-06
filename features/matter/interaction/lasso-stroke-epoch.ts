export type LassoMeasurementEpoch = Readonly<{
  treeRevision: number;
  layoutEpoch: number;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
}>;

/** Pointer settlement is valid only inside the document session that captured it. */
export function isCurrentLassoStroke(
  captured: LassoMeasurementEpoch | null,
  current: LassoMeasurementEpoch,
  capturedDocumentEpoch: number,
  currentDocumentEpoch: number,
): boolean {
  return capturedDocumentEpoch === currentDocumentEpoch &&
    captured !== null &&
    captured.treeRevision === current.treeRevision &&
    captured.layoutEpoch === current.layoutEpoch &&
    captured.viewportX === current.viewportX &&
    captured.viewportY === current.viewportY &&
    captured.viewportZoom === current.viewportZoom;
}
