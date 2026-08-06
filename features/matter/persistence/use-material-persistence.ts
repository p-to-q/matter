"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import { resolveHydrationDecision } from "./hydration-decision";
import { createPersistenceController } from "./persistence-controller";
import type { DocumentSwitchReceipt } from "../store/matter-store";

export function useMaterialPersistence(
  tree: ThoughtTree,
  hydrateSnapshot: (tree: ThoughtTree) => unknown,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
) {
  const [controller] = useState(() =>
    createPersistenceController(createIndexedDbDocumentRepository()),
  );
  const latestTreeRef = useRef(tree);
  const startedRef = useRef(false);
  const startPromiseRef = useRef<ReturnType<typeof controller.start> | null>(null);
  const lifecycleRef = useRef(0);
  const importCoordinator = useMemo(() => createDocumentImportCoordinator(
    controller,
    switchDocument,
  ), [controller, switchDocument]);

  useEffect(() => {
    latestTreeRef.current = tree;
  }, [tree]);

  useEffect(() => {
    let active = true;
    lifecycleRef.current += 1;
    const lifecycle = lifecycleRef.current;
    const initialTree = latestTreeRef.current;
    startPromiseRef.current ??= controller.start(initialTree);
    void startPromiseRef.current.then(({ storedTree }) => {
      if (!active) return;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, storedTree);
      if (decision.action === "hydrate") hydrateSnapshot(decision.tree);
      else if (decision.action === "publish") controller.publish(decision.tree);
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
    if (startedRef.current) controller.publish(tree);
  }, [controller, tree]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") controller.flush();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [controller]);

  const resolveConflict = useCallback(async () => {
    const result = await controller.resolveConflict();
    if (result.storedTree !== null) hydrateSnapshot(result.storedTree);
  }, [controller, hydrateSnapshot]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  return Object.freeze({
    status,
    retry: controller.retry,
    resolveConflict,
    importMaterial: importCoordinator.importValidatedTree,
  });
}
