"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createDocumentGenerationChannel } from "./document-generation-channel";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import type { RecoveredHistory } from "./history-recovery";
import { resolveHydrationDecision } from "./hydration-decision";
import { createPersistenceController, type StoredCandidate } from "./persistence-controller";
import {
  createStoredGenerationWatch,
  type StoredGenerationWatch,
  type StoredRefreshOutcome,
} from "./stored-generation-watch";
import { createSupersededReload, type SupersededReload } from "./superseded-reload";
import { createUnloadGuard, type UnloadGuard } from "./unload-guard";
import type { DocumentSwitchReceipt, MatterStoreReceipt } from "../store/matter-store";

type HydrateSnapshot = (
  tree: ThoughtTree,
  history?: RecoveredHistory | null,
  expectedCurrentTree?: ThoughtTree,
) => MatterStoreReceipt;

export function useMaterialPersistence(
  tree: ThoughtTree,
  history: TreeHistory,
  documentEpoch: number,
  hydrateSnapshot: HydrateSnapshot,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
  /**
   * Nothing the person started is in progress: no admission, AI turn, draft,
   * question, or name editor. Replacing the document instance waits for it.
   */
  materialIdle: boolean,
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
  // The tree the controller last received. A newer row may replace only this
  // exact tree: a commit the store holds but has not yet published (effects run
  // after layout) would otherwise be overwritten before it is ever saved.
  const publishedTreeRef = useRef(tree);
  // The load window compares against the tree of the first render only. A
  // re-run effect must never treat later material as the untouched seed.
  const [initialTree] = useState(tree);
  const [initialHistory] = useState(history);
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

  /**
   * Hydrates a stored row only over the material this hook last saw, so a
   * commit made after storage was read is never replaced. Stored steps that
   * cannot be restored are released in the store; the durability owner carries
   * the one notice. Returns whether the store accepted the row.
   */
  const hydrateOver = useCallback((
    storedTree: ThoughtTree,
    storedHistory: RecoveredHistory | null,
    expectedCurrentTree: ThoughtTree,
  ): boolean => {
    const receipt = hydrateSnapshot(storedTree, storedHistory, expectedCurrentTree);
    if (receipt.operation !== "hydrate" || receipt.status !== "hydrated") return false;
    if (receipt.historyReleased) controller.reportHistoryUnavailable();
    return true;
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
    startPromiseRef.current ??= controller.start(initialTree, initialHistory);
    void startPromiseRef.current.then(({ storedTree, storedHistory }) => {
      if (!active || reconciledRef.current) return;
      reconciledRef.current = true;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, storedTree);
      if (decision.action === "hydrate") {
        if (!hydrateOver(decision.tree, storedHistory, initialTree)) {
          controller.declareConflict(latestTreeRef.current, latestHistoryRef.current, "load-window");
        }
      } else if (decision.action === "publish") {
        controller.publish(decision.tree, latestHistoryRef.current);
        publishedTreeRef.current = decision.tree;
      } else if (decision.action === "conflict") {
        // Material committed during the load window does not descend from the
        // stored session. Neither is written over the other; Archive offers
        // the explicit reload.
        controller.declareConflict(decision.tree, latestHistoryRef.current, "load-window");
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
  }, [controller, hydrateOver, initialHistory, initialTree, owner]);

  useEffect(() => {
    if (!reconciledRef.current) return;
    controller.publish(tree, history);
    publishedTreeRef.current = tree;
  }, [controller, history, tree]);

  /** Adopts a candidate only after the store took it; otherwise holds a conflict. */
  const applyCandidate = useCallback((candidate: StoredCandidate, expectedCurrentTree: ThoughtTree): boolean => {
    if (!hydrateOver(candidate.tree, candidate.history, expectedCurrentTree)) {
      controller.declareConflict(latestTreeRef.current, latestHistoryRef.current, "another-tab");
      return false;
    }
    return controller.adoptStored(candidate);
  }, [controller, hydrateOver]);

  const applyCandidateRef = useRef(applyCandidate);
  const materialIdleRef = useRef(materialIdle);
  const watchRef = useRef<StoredGenerationWatch | null>(null);
  useLayoutEffect(() => {
    applyCandidateRef.current = applyCandidate;
  }, [applyCandidate]);
  useLayoutEffect(() => {
    materialIdleRef.current = materialIdle;
    watchRef.current?.setMaterialIdle(materialIdle);
  }, [materialIdle]);
  useEffect(() => {
    const watch = createStoredGenerationWatch({ window, document }, {
      ready: () => reconciledRef.current,
      observe: (generation) => controller.observeStoredGeneration(generation),
      check: () => controller.checkStoredGeneration(),
      refresh: async (stillIdle): Promise<StoredRefreshOutcome> => {
        const candidate = await controller.prepareRefresh();
        if (candidate === null) return "none";
        if (!stillIdle()) return "deferred";
        return applyCandidateRef.current(candidate, publishedTreeRef.current) ? "applied" : "none";
      },
    });
    watchRef.current = watch;
    watch.setMaterialIdle(materialIdleRef.current);
    const unsubscribe = owner.channel.subscribe((generation) => watch.receive(generation));
    return () => {
      unsubscribe();
      watch.dispose();
      if (watchRef.current === watch) watchRef.current = null;
    };
  }, [controller, owner]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  const materialDiverged = tree !== initialTree;
  const unloadGuardRef = useRef<UnloadGuard | null>(null);
  useEffect(() => {
    const guard = createUnloadGuard({
      addEventListener: (type, listener) => window.addEventListener(type, listener),
      removeEventListener: (type, listener) => window.removeEventListener(type, listener),
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (id) => window.clearTimeout(id),
    });
    unloadGuardRef.current = guard;
    return () => {
      guard.dispose();
      if (unloadGuardRef.current === guard) unloadGuardRef.current = null;
    };
  }, []);
  useEffect(() => {
    unloadGuardRef.current?.update({ status, materialDiverged });
  }, [materialDiverged, status]);

  const supersededReloadRef = useRef<SupersededReload | null>(null);
  useEffect(() => {
    const reload = createSupersededReload({
      document,
      reload: () => window.location.reload(),
      session: readSessionStorage(),
      now: () => Date.now(),
    });
    supersededReloadRef.current = reload;
    return () => {
      reload.dispose();
      if (supersededReloadRef.current === reload) supersededReloadRef.current = null;
    };
  }, []);
  useEffect(() => {
    supersededReloadRef.current?.update({
      superseded: status.errorCode === "PERSISTENCE_SUPERSEDED",
      unsaved: status.unsaved,
      materialIdle,
    });
  }, [materialIdle, status.errorCode, status.unsaved]);

  const resolveConflict = useCallback(async () => {
    const candidate = await controller.resolveConflict();
    // The store must still hold exactly the material this reload replaces.
    if (candidate !== null && candidate.replaces !== null) applyCandidate(candidate, candidate.replaces.tree);
  }, [applyCandidate, controller]);

  // A plain object: the memo keeps its identity stable across renders.
  return useMemo(() => ({
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

function readSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Some privacy modes throw on access to session storage itself.
    return null;
  }
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
