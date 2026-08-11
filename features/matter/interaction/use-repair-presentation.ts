"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { AdmissionRepairCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";

const PRESENTATION_LIMIT = 3;
// Retention starts before React publishes the repaired tree. Keep it separate
// from the 240ms CSS duration so a busy layout cannot truncate the motion.
const PRESENTATION_RETENTION_MS = 1_000;

export type RepairPresentationScope = Readonly<{
  treeId: string;
  documentEpoch: number;
}>;

export type RepairPresentationBinding = Readonly<{
  byNode: ReadonlyMap<string, AdmissionRepairCommittedChange>;
  publish: (change: AdmissionRepairCommittedChange) => void;
  clearAll: () => void;
}>;

export type RepairPresentationController = RepairPresentationBinding & Readonly<{
  getSnapshot: () => ReadonlyMap<string, AdmissionRepairCommittedChange>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}>;

const EMPTY_PRESENTATIONS: ReadonlyMap<string, AdmissionRepairCommittedChange> =
  new Map();

/**
 * A repair presentation is a short-lived view hint, never recoverable state.
 * It is keyed per node so distinct late repairs can settle independently while
 * the bound keeps a burst from animating the whole material at once.
 */
export function useRepairPresentation(
  scope: RepairPresentationScope,
): RepairPresentationBinding {
  const controller = useMemo(
    () => createRepairPresentationController({
      treeId: scope.treeId,
      documentEpoch: scope.documentEpoch,
    }),
    [scope.documentEpoch, scope.treeId],
  );
  const byNode = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    emptyRepairPresentations,
  );
  useEffect(() => () => controller.dispose(), [controller]);
  return {
    byNode,
    publish: controller.publish,
    clearAll: controller.clearAll,
  };
}

export function createRepairPresentationController(
  scope: RepairPresentationScope,
): RepairPresentationController {
  let snapshot = EMPTY_PRESENTATIONS;
  let disposed = false;
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const publishSnapshot = (next: ReadonlyMap<string, AdmissionRepairCommittedChange>) => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const clearAll = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (snapshot.size > 0) publishSnapshot(EMPTY_PRESENTATIONS);
  };
  const publish = (change: AdmissionRepairCommittedChange) => {
    if (
      disposed ||
      change.treeId !== scope.treeId ||
      change.documentEpoch !== scope.documentEpoch
    ) return;
    const existingTimer = timers.get(change.nodeId);
    if (existingTimer !== undefined) clearTimeout(existingTimer);
    timers.delete(change.nodeId);
    const next = new Map(snapshot);
    next.delete(change.nodeId);
    while (timers.size >= PRESENTATION_LIMIT) {
      const oldestNodeId = timers.keys().next().value as string | undefined;
      if (oldestNodeId === undefined) break;
      const oldestTimer = timers.get(oldestNodeId);
      if (oldestTimer !== undefined) clearTimeout(oldestTimer);
      timers.delete(oldestNodeId);
      next.delete(oldestNodeId);
    }
    next.set(change.nodeId, change);
    publishSnapshot(next);
    timers.set(change.nodeId, setTimeout(() => {
      timers.delete(change.nodeId);
      if (disposed || snapshot.get(change.nodeId)?.id !== change.id) return;
      const retained = new Map(snapshot);
      retained.delete(change.nodeId);
      publishSnapshot(retained.size === 0 ? EMPTY_PRESENTATIONS : retained);
    }, PRESENTATION_RETENTION_MS));
  };

  return Object.freeze({
    get byNode() {
      return snapshot;
    },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish,
    clearAll,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      snapshot = EMPTY_PRESENTATIONS;
      listeners.clear();
    },
  });
}

function emptyRepairPresentations(): ReadonlyMap<string, AdmissionRepairCommittedChange> {
  return EMPTY_PRESENTATIONS;
}

/**
 * Read-time validation prevents unrelated revisions from ending an animation,
 * while same-node edits, removal, Undo, hydration, and document replacement do
 * not let an old presentation become visible again.
 */
export function isRepairPresentationCurrent(
  change: AdmissionRepairCommittedChange | undefined,
  scope: RepairPresentationScope,
  tree: ThoughtTree,
): boolean {
  if (
    change === undefined ||
    change.treeId !== scope.treeId ||
    change.documentEpoch !== scope.documentEpoch ||
    tree.id !== scope.treeId ||
    tree.revision < change.committedRevision
  ) return false;
  const node = tree.nodes[change.nodeId];
  return node !== undefined &&
    node.text === change.after.text &&
    node.updatedAt === change.after.updatedAt;
}
