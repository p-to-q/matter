"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import { resolveHydrationDecision } from "./hydration-decision";
import { createPersistenceController } from "./persistence-controller";
import type { DocumentSwitchReceipt } from "../store/matter-store";

export function useMaterialPersistence(
  tree: ThoughtTree,
  history: TreeHistory,
  hydrateSnapshot: (tree: ThoughtTree, history?: unknown) => unknown,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
) {
  const [controller] = useState(() =>
    createPersistenceController(createIndexedDbDocumentRepository()),
  );
  const latestTreeRef = useRef(tree);
  const latestHistoryRef = useRef(history);
  const initialHistoryRef = useRef(history);
  const startedRef = useRef(false);
  const startPromiseRef = useRef<ReturnType<typeof controller.start> | null>(null);
  const lifecycleRef = useRef(0);
  const importCoordinator = useMemo(() => createDocumentImportCoordinator(
    controller,
    switchDocument,
  ), [controller, switchDocument]);

  useEffect(() => {
    latestTreeRef.current = tree;
    latestHistoryRef.current = history;
  }, [history, tree]);

  useEffect(() => {
    let active = true;
    lifecycleRef.current += 1;
    const lifecycle = lifecycleRef.current;
    const initialTree = latestTreeRef.current;
    startPromiseRef.current ??= controller.start(initialTree, initialHistoryRef.current);
    void startPromiseRef.current.then(({ storedTree, storedHistory }) => {
      if (!active) return;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, storedTree);
      if (decision.action === "hydrate") hydrateSnapshot(decision.tree, storedHistory);
      else if (decision.action === "publish") controller.publish(decision.tree, latestHistoryRef.current);
      // Material committed during the load window does not descend from the
      // stored session. Neither is written over the other; the index footer
      // offers the same reload gesture a second tab already raises.
      else if (decision.action === "conflict") {
        controller.declareConflict(decision.tree, latestHistoryRef.current);
      }
      startedRef.current = true;
    });
    return () => {
      active = false;
      queueMicrotask(() => {
        // React development mode rehearses setup/cleanup synchronously. Close
        // IndexedDB only when no replacement lifecycle claimed this controller.
        if (lifecycleRef.current === lifecycle) controller.dispose();
      });
    };
  }, [controller, hydrateSnapshot]);

  useEffect(() => {
    if (startedRef.current) controller.publish(tree, history);
  }, [controller, history, tree]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") controller.flush();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [controller]);

  const resolveConflict = useCallback(async () => {
    const result = await controller.resolveConflict();
    if (result.storedTree !== null) hydrateSnapshot(result.storedTree, result.storedHistory);
  }, [controller, hydrateSnapshot]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  return Object.freeze({
    status,
    retry: controller.retry,
    resolveConflict,
    importMaterial: importCoordinator.importValidatedTree,
  });
}
