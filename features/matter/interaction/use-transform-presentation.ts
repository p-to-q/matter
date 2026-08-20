"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaterialTextCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { TRANSFORM_REVEAL_MAX_TOTAL_MS } from "./transform-reveal";

const PRESENTATION_RETENTION_MS = TRANSFORM_REVEAL_MAX_TOTAL_MS + 180;

export function useTransformPresentation(scope: Readonly<{
  treeId: string;
  documentEpoch: number;
}>): Readonly<{
  change: MaterialTextCommittedChange | null;
  publish: (change: MaterialTextCommittedChange) => void;
  clear: () => void;
}> {
  const [change, setChange] = useState<MaterialTextCommittedChange | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setChange(null);
  }, []);
  const publish = useCallback((next: MaterialTextCommittedChange) => {
    if (next.treeId !== scope.treeId || next.documentEpoch !== scope.documentEpoch) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setChange(next);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setChange((current) => current?.id === next.id ? null : current);
    }, PRESENTATION_RETENTION_MS);
  }, [scope.documentEpoch, scope.treeId]);

  useEffect(() => clear, [clear, scope.documentEpoch, scope.treeId]);
  return { change, publish, clear };
}

export function isTransformPresentationCurrent(
  change: MaterialTextCommittedChange | null,
  scope: Readonly<{ treeId: string; documentEpoch: number }>,
  tree: ThoughtTree,
): boolean {
  if (
    change === null ||
    change.treeId !== scope.treeId ||
    change.documentEpoch !== scope.documentEpoch ||
    tree.id !== scope.treeId ||
    tree.revision !== change.committedRevision
  ) return false;
  const node = tree.nodes[change.nodeId];
  return node !== undefined &&
    node.text === change.after.text &&
    node.updatedAt === change.after.updatedAt;
}
