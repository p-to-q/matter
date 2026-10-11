import type { CanvasLanguage } from "./canvas-preferences";
import type { ThoughtTree } from "../tree/model";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

export type MaterialHeightMeasurement = Readonly<{
  columnWidth: number;
  height: number;
  /** `pictureLayoutKey` of the passage's pointer at measurement time. */
  picture: string | null;
  root: boolean;
  text: string;
}>;

/** Everything besides height that a measurement is a measurement of. */
export type MaterialHeightSubject = Readonly<Omit<MaterialHeightMeasurement, "height">>;

/**
 * A measured height belongs to the text, the column, the passage's role, and
 * the picture it carried. A key that left the picture out would keep a height
 * from before an attach, a replacement, or an undo.
 */
export function materialHeightIsReusable(
  cached: MaterialHeightMeasurement | undefined,
  subject: MaterialHeightSubject,
): cached is MaterialHeightMeasurement {
  return cached !== undefined &&
    cached.columnWidth === subject.columnWidth &&
    cached.root === subject.root &&
    cached.text === subject.text &&
    cached.picture === subject.picture;
}

export type MaterialHeightCacheBasis = Readonly<{
  documentEpoch: number;
  locale: CanvasLanguage;
  tree: ThoughtTree;
}>;

/** Owns reusable measured geometry across document and locale boundaries. */
export function materialLayoutDocumentKey(
  documentEpoch: number,
  locale: CanvasLanguage,
  projectionKey: string,
): string {
  return `${documentEpoch}:${locale}:${projectionKey}`;
}

/** Keeps disposable browser measurements inside their document and font authority. */
export function reconcileMaterialHeightCache(
  cache: Map<string, MaterialHeightMeasurement>,
  previous: MaterialHeightCacheBasis | null,
  next: MaterialHeightCacheBasis,
): void {
  if (
    previous === null ||
    previous.documentEpoch !== next.documentEpoch ||
    previous.locale !== next.locale
  ) {
    cache.clear();
    return;
  }
  if (previous.tree === next.tree) return;
  for (const nodeId of cache.keys()) {
    if (next.tree.nodes[nodeId] === undefined) cache.delete(nodeId);
  }
}

/** Refreshes recency and enforces the same hard node bound as the tree engine. */
export function retainMaterialHeight(
  cache: Map<string, MaterialHeightMeasurement>,
  nodeId: string,
  measurement: MaterialHeightMeasurement,
): void {
  cache.delete(nodeId);
  cache.set(nodeId, measurement);
  while (cache.size > MAX_NODES_PER_TREE) {
    const oldestNodeId = cache.keys().next().value;
    if (oldestNodeId === undefined) return;
    cache.delete(oldestNodeId);
  }
}
