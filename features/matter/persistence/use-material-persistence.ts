"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createDocumentGenerationChannel } from "./document-generation-channel";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import type { RecoveredHistory } from "./history-recovery";
import { resolveHydrationDecision } from "./hydration-decision";
import {
  createPersistenceController,
  type PersistenceStatus,
  type StoredGenerationDecision,
} from "./persistence-controller";
import type { DocumentSwitchReceipt, MatterStoreReceipt } from "../store/matter-store";

/** A save still in flight after this long puts unsaved material at risk. */
const SLOW_SAVE_MS = 1_000;

export function useMaterialPersistence(
  tree: ThoughtTree,
  history: TreeHistory,
  documentEpoch: number,
  hydrateSnapshot: (tree: ThoughtTree, history?: RecoveredHistory | null) => MatterStoreReceipt,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
  /** No admission is in flight; a refresh from another tab waits for it. */
  interactionIdle: boolean,
) {
  // The channel and controller share one lifetime: every committed row is
  // announced, and disposal closes both.
  const [owner] = useState(() => {
    const channel = createDocumentGenerationChannel();
    const controller = createPersistenceController(createIndexedDbDocumentRepository(), {
      announceGeneration: channel.publish,
    });
    return Object.freeze({ channel, controller });
  });
  const { controller } = owner;
  const latestTreeRef = useRef(tree);
  const latestHistoryRef = useRef(history);
  // The load window compares against the tree of the first render only. A
  // re-run effect must never treat later material as the untouched seed.
  const initialTreeRef = useRef(tree);
  const initialHistoryRef = useRef(history);
  const [documentBasisOwner] = useState(() => new DocumentBasisOwner(tree, documentEpoch));
  const reconciledRef = useRef(false);
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
    const initialTree = initialTreeRef.current;
    startPromiseRef.current ??= controller.start(initialTree, initialHistoryRef.current);
    void startPromiseRef.current.then(({ storedTree, storedHistory }) => {
      if (!active || reconciledRef.current) return;
      reconciledRef.current = true;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, storedTree);
      if (decision.action === "hydrate") hydrateStored(decision.tree, storedHistory);
      else if (decision.action === "publish") controller.publish(decision.tree, latestHistoryRef.current);
      // Material committed during the load window does not descend from the
      // stored session. Neither is written over the other; the Archive surface
      // offers the same reload gesture a second tab already raises.
      else if (decision.action === "conflict") {
        controller.declareConflict(decision.tree, latestHistoryRef.current);
      }
      setInitialReconciliationComplete(true);
    });
    return () => {
      active = false;
      queueMicrotask(() => {
        // React development mode rehearses setup/cleanup synchronously. Close
        // IndexedDB only when no replacement lifecycle claimed this controller.
        if (lifecycleRef.current === lifecycle) {
          controller.dispose();
          owner.channel.close();
        }
      });
    };
  }, [controller, hydrateStored, owner]);

  useEffect(() => {
    if (reconciledRef.current) controller.publish(tree, history);
  }, [controller, history, tree]);

  useStoredGenerationWatch(owner, hydrateStored, interactionIdle, reconciledRef);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  useUnsavedMaterialGuard(status);
  useSupersededReload(status);

  const resolveConflict = useCallback(async () => {
    const result = await controller.resolveConflict();
    if (result.storedTree !== null) hydrateStored(result.storedTree, result.storedHistory);
  }, [controller, hydrateStored]);

  return useMemo(() => Object.freeze({
    initialReconciliationComplete,
    status,
    retry: controller.retry,
    resolveConflict,
    importMaterial: importCoordinator.importValidatedTree,
    exportCorruptRecovery: controller.exportCorruptRecovery,
    replaceCorrupt: controller.replaceCorrupt,
    reportHistoryUnavailable: controller.reportHistoryUnavailable,
    acknowledgeHistoryNotice: controller.acknowledgeHistoryNotice,
  }), [controller, importCoordinator, initialReconciliationComplete, resolveConflict, status]);
}

/**
 * Meets rows other tabs commit: from their broadcast, and from one read when
 * this page becomes visible again or returns from the back-forward cache (a
 * frozen page misses broadcasts). With no unsaved work the newer row is
 * hydrated at once while hidden, otherwise when no pointer or admission is in
 * flight; unsaved work becomes a conflict inside the controller.
 */
function useStoredGenerationWatch(
  owner: Readonly<{
    controller: ReturnType<typeof createPersistenceController>;
    channel: ReturnType<typeof createDocumentGenerationChannel>;
  }>,
  hydrateStored: (tree: ThoughtTree, history: RecoveredHistory | null) => void,
  interactionIdle: boolean,
  reconciledRef: Readonly<{ current: boolean }>,
) {
  const { controller, channel } = owner;
  const refreshWantedRef = useRef(false);
  const interactionIdleRef = useRef(interactionIdle);
  const pointersRef = useRef(new Set<number>());
  const refreshingRef = useRef(false);

  const attemptRefresh = useCallback(() => {
    if (!refreshWantedRef.current || refreshingRef.current) return;
    const hidden = document.visibilityState === "hidden";
    if (!hidden && (!interactionIdleRef.current || pointersRef.current.size > 0)) return;
    refreshWantedRef.current = false;
    refreshingRef.current = true;
    void controller.refreshFromStorage().then((stored) => {
      if (stored.storedTree !== null) hydrateStored(stored.storedTree, stored.storedHistory);
    }).finally(() => {
      refreshingRef.current = false;
    });
  }, [controller, hydrateStored]);

  const handle = useCallback((decision: StoredGenerationDecision) => {
    if (decision !== "refresh") return;
    refreshWantedRef.current = true;
    attemptRefresh();
  }, [attemptRefresh]);

  useLayoutEffect(() => {
    interactionIdleRef.current = interactionIdle;
    if (interactionIdle) attemptRefresh();
  }, [attemptRefresh, interactionIdle]);

  useEffect(() => channel.subscribe((generation) => {
    if (reconciledRef.current) handle(controller.observeStoredGeneration(generation));
  }), [channel, controller, handle, reconciledRef]);

  useEffect(() => {
    const pointers = pointersRef.current;
    const check = () => {
      if (reconciledRef.current) void controller.checkStoredGeneration().then(handle);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
      else attemptRefresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };
    const onPointerDown = (event: PointerEvent) => {
      pointers.add(event.pointerId);
    };
    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      attemptRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      pointers.clear();
    };
  }, [attemptRefresh, controller, handle, reconciledRef]);
}

/**
 * `beforeunload` is attached only while material is at risk: unsaved and
 * either refused by storage or still writing after `SLOW_SAVE_MS`. It is
 * removed the moment the material is saved, so ordinary navigation keeps the
 * page eligible for the back-forward cache.
 */
function useUnsavedMaterialGuard(status: PersistenceStatus) {
  // A new token per saving period lets the timer mark only its own period.
  const savingToken = useMemo(() => status.phase === "saving" ? {} : null, [status.phase]);
  const [slowToken, setSlowToken] = useState<object | null>(null);
  useEffect(() => {
    if (savingToken === null) return;
    const timer = window.setTimeout(() => setSlowToken(savingToken), SLOW_SAVE_MS);
    return () => window.clearTimeout(timer);
  }, [savingToken]);
  const armed = status.unsaved && (
    status.phase === "error" || (savingToken !== null && slowToken === savingToken)
  );
  useEffect(() => {
    if (!armed) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy engines still read the return value to show the prompt.
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [armed]);
}

/**
 * A newer Matter owns the database. With nothing unsaved the newer build is
 * one reload away and nothing is lost; with unsaved material the person keeps
 * this page and exports a copy first.
 */
function useSupersededReload(status: PersistenceStatus) {
  const superseded = status.errorCode === "PERSISTENCE_SUPERSEDED" && !status.unsaved;
  useEffect(() => {
    if (superseded) window.location.reload();
  }, [superseded]);
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
