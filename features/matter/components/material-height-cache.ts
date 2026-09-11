import type { CanvasLanguage } from "./canvas-preferences";
import type { ThoughtTree } from "../tree/model";
import { MAX_NODES_PER_TREE } from "../tree/invariants";

export type MaterialHeightMeasurement = Readonly<{
  columnWidth: number;
  height: number;
  root: boolean;
  text: string;
}>;

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
