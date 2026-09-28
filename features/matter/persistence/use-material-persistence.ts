"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import type { RecoveredHistory } from "./history-recovery";
import { resolveHydrationDecision } from "./hydration-decision";
import { createPersistenceController } from "./persistence-controller";
import type { DocumentSwitchReceipt, MatterStoreReceipt } from "../store/matter-store";

export function useMaterialPersistence(
  tree: ThoughtTree,
  history: TreeHistory,
  documentEpoch: number,
  hydrateSnapshot: (tree: ThoughtTree, history?: RecoveredHistory | null) => MatterStoreReceipt,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
) {
  const [controller] = useState(() =>
    createPersistenceController(createIndexedDbDocumentRepository()),
  );
  const latestTreeRef = useRef(tree);
  const latestHistoryRef = useRef(history);
  const [documentBasisOwner] = useState(() => new DocumentBasisOwner(tree, documentEpoch));
  const initialHistoryRef = useRef(history);
  const startedRef = useRef(false);
  const [initialReconciliationComplete, setInitialReconciliationComplete] = useState(false);
  const startPromiseRef = useRef<ReturnType<typeof controller.start> | null>(null);
  const lifecycleRef = useRef(0);
  const importCoordinator = useMemo(() => createDocumentImportCoordinator(
    controller,
    switchDocument,
    () => documentBasisOwner.read(),
  ), [controller, documentBasisOwner, switchDocument]);
  // Stored steps that cannot be restored with their material are released in
  // the store; the durability owner carries the one notice about it.
  const hydrateStored = useCallback((storedTree: ThoughtTree, storedHistory: RecoveredHistory | null) => {
    const receipt = hydrateSnapshot(storedTree, storedHistory);
    if (receipt.operation === "hydrate" && receipt.status === "hydrated" && receipt.historyReleased) {
      controller.reportHistoryUnavailable();
    }
  }, [controller, hydrateSnapshot]);

  useLayoutEffect(() => {
    latestTreeRef.current = tree;
    latestHistoryRef.current = history;
    documentBasisOwner.publish(tree, documentEpoch);
  }, [documentBasisOwner, documentEpoch, history, tree]);

  useEffect(() => {
    let active = true;
    lifecycleRef.current += 1;
    const lifecycle = lifecycleRef.current;
    const initialTree = latestTreeRef.current;
    startPromiseRef.current ??= controller.start(initialTree, initialHistoryRef.current);
    void startPromiseRef.current.then(({ storedTree, storedHistory }) => {
      if (!active) return;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, storedTree);
      if (decision.action === "hydrate") hydrateStored(decision.tree, storedHistory);
      else if (decision.action === "publish") controller.publish(decision.tree, latestHistoryRef.current);
      // Material committed during the load window does not descend from the
      // stored session. Neither is written over the other; the index footer
      // offers the same reload gesture a second tab already raises.
      else if (decision.action === "conflict") {
        controller.declareConflict(decision.tree, latestHistoryRef.current);
      }
      startedRef.current = true;
      setInitialReconciliationComplete(true);
    });
    return () => {
      active = false;
      queueMicrotask(() => {
        // React development mode rehearses setup/cleanup synchronously. Close
        // IndexedDB only when no replacement lifecycle claimed this controller.
        if (lifecycleRef.current === lifecycle) controller.dispose();
      });
    };
  }, [controller, hydrateStored]);

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
    if (result.storedTree !== null) hydrateStored(result.storedTree, result.storedHistory);
  }, [controller, hydrateStored]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  return Object.freeze({
    initialReconciliationComplete,
    status,
    retry: controller.retry,
    resolveConflict,
    importMaterial: importCoordinator.importValidatedTree,
    exportCorruptRecovery: controller.exportCorruptRecovery,
    replaceCorrupt: controller.replaceCorrupt,
    reportHistoryUnavailable: controller.reportHistoryUnavailable,
    acknowledgeHistoryNotice: controller.acknowledgeHistoryNotice,
  });
}

/** Mutable render-independent owner for one synchronous import authority read. */
class DocumentBasisOwner {
  #treeId: string;
  #revision: number;
  #documentEpoch: number;

  constructor(tree: ThoughtTree, documentEpoch: number) {
    this.#treeId = tree.id;
    this.#revision = tree.revision;
    this.#documentEpoch = documentEpoch;
  }

  publish(tree: ThoughtTree, documentEpoch: number): void {
    this.#treeId = tree.id;
    this.#revision = tree.revision;
    this.#documentEpoch = documentEpoch;
  }

  read() {
    return Object.freeze({
      treeId: this.#treeId,
      revision: this.#revision,
      documentEpoch: this.#documentEpoch,
    });
  }
}
