"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { createIndexedDbDocumentRepository } from "./document-repository";
import {
  createDocumentGenerationChannel,
  type DocumentGeneration,
  type DocumentGenerationChannel,
} from "./document-generation-channel";
import { createDocumentImportCoordinator } from "./document-import-coordinator";
import type { RecoveredHistory } from "./history-recovery";
import { resolveHydrationDecision } from "./hydration-decision";
import {
  createPersistenceController,
  holdsUnsavedPersonMaterial,
  type ConflictOrigin,
  type StoredCandidate,
} from "./persistence-controller";
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
  /** The store's untouched material for this document instance. */
  untouchedTree: ThoughtTree,
  documentEpoch: number,
  hydrateSnapshot: HydrateSnapshot,
  switchDocument: (tree: ThoughtTree) => DocumentSwitchReceipt,
  /**
   * Nothing the person started is in progress: no admission, AI turn, draft,
   * question, or name editor. Replacing the document instance waits for it.
   */
  materialIdle: boolean,
) {
  // The generation channel is an external resource, so the effect that listens
  // on it creates and closes it; the controller announces every committed row
  // through it while it is open. Constructing the controller opens nothing, so
  // a Strict Mode rehearsal of this initializer leaks no channel or database.
  const [owner] = useState(() => {
    const announcer = new GenerationAnnouncer();
    const controller = createPersistenceController(createIndexedDbDocumentRepository(), {
      announceGeneration: (generation) => announcer.publish(generation),
    });
    return Object.freeze({ announcer, controller });
  });
  const { announcer, controller } = owner;
  const latestTreeRef = useRef(tree);
  const latestHistoryRef = useRef(history);
  const latestUntouchedTreeRef = useRef(untouchedTree);
  // Store authorship: only material the person changed can be unsaved.
  const authoredLatest = () => latestTreeRef.current !== latestUntouchedTreeRef.current;
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
   * Replaces the document by a stored row, only over the tree the store is
   * expected to hold, so a commit made after storage was read is never
   * replaced. The controller refuses a stale candidate before anything
   * hydrates and adopts the row only once the store took it; a store refusal
   * holds the live material as a conflict.
   */
  const applyCandidate = useCallback((
    candidate: StoredCandidate,
    expectedCurrentTree: ThoughtTree,
    conflictOrigin: ConflictOrigin,
  ): boolean => {
    const outcome = controller.adoptStored(candidate, (stored) => {
      const receipt = hydrateSnapshot(stored.tree, stored.history, expectedCurrentTree);
      return receipt.operation === "hydrate" && receipt.status === "hydrated"
        ? Object.freeze({ historyReleased: receipt.historyReleased })
        : null;
    });
    if (outcome === "refused") {
      controller.declareConflict(latestTreeRef.current, latestHistoryRef.current, conflictOrigin, authoredLatest());
    }
    return outcome === "adopted";
  }, [controller, hydrateSnapshot]);

  useLayoutEffect(() => {
    latestTreeRef.current = tree;
    latestHistoryRef.current = history;
    latestUntouchedTreeRef.current = untouchedTree;
    documentBasisOwner.publish(tree, documentEpoch);
  }, [documentBasisOwner, documentEpoch, history, tree, untouchedTree]);

  useEffect(() => {
    let active = true;
    lifecycleRef.current += 1;
    const lifecycle = lifecycleRef.current;
    startPromiseRef.current ??= controller.start(initialTree, initialHistory);
    void startPromiseRef.current.then((candidate) => {
      if (!active || reconciledRef.current) return;
      reconciledRef.current = true;
      const decision = resolveHydrationDecision(initialTree, latestTreeRef.current, candidate?.tree ?? null);
      if (decision.action === "hydrate" && candidate !== null) {
        applyCandidate(candidate, initialTree, "load-window");
      } else if (decision.action === "publish") {
        controller.publish(decision.tree, latestHistoryRef.current, authoredLatest());
        publishedTreeRef.current = decision.tree;
      } else if (decision.action === "conflict") {
        // Material committed during the load window does not descend from the
        // stored session. Neither is written over the other; Archive offers
        // the explicit reload.
        controller.declareConflict(decision.tree, latestHistoryRef.current, "load-window", authoredLatest());
      }
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
  }, [applyCandidate, controller, initialHistory, initialTree]);

  useEffect(() => {
    if (!reconciledRef.current) return;
    controller.publish(tree, history, tree !== untouchedTree);
    publishedTreeRef.current = tree;
  }, [controller, history, tree, untouchedTree]);

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
    const channel = createDocumentGenerationChannel();
    announcer.attach(channel);
    const watch = createStoredGenerationWatch({ window, document }, {
      ready: () => reconciledRef.current,
      observe: (generation) => controller.observeStoredGeneration(generation),
      check: () => controller.checkStoredGeneration(),
      refresh: async (stillIdle): Promise<StoredRefreshOutcome> => {
        const candidate = await controller.prepareRefresh();
        if (candidate === null) return "none";
        if (!stillIdle()) return "deferred";
        return applyCandidateRef.current(candidate, publishedTreeRef.current, "another-tab") ? "applied" : "none";
      },
    });
    watchRef.current = watch;
    watch.setMaterialIdle(materialIdleRef.current);
    const unsubscribe = channel.subscribe((generation) => watch.receive(generation));
    return () => {
      unsubscribe();
      watch.dispose();
      if (watchRef.current === watch) watchRef.current = null;
      announcer.detach(channel);
      channel.close();
    };
  }, [announcer, controller]);

  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, controller.getStatus);
  const unsavedPersonMaterial = holdsUnsavedPersonMaterial(
    status,
    initialReconciliationComplete,
    tree !== untouchedTree,
  );
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
    unloadGuardRef.current?.update({ phase: status.phase, unsavedPersonMaterial });
  }, [status.phase, unsavedPersonMaterial]);

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
      unsavedPersonMaterial,
      materialIdle,
    });
  }, [materialIdle, status.errorCode, unsavedPersonMaterial]);

  const resolveConflict = useCallback(async () => {
    const candidate = await controller.resolveConflict();
    // The store must still hold exactly the material this reload replaces. A
    // refusal keeps the conflict where it came from.
    if (candidate !== null && candidate.replaces !== null) {
      applyCandidate(candidate, candidate.replaces.tree, controller.getStatus().conflictOrigin ?? "another-tab");
    }
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

/** Render-independent route from the controller to whichever channel is open. */
class GenerationAnnouncer {
  #channel: DocumentGenerationChannel | null = null;

  attach(channel: DocumentGenerationChannel): void {
    this.#channel = channel;
  }

  detach(channel: DocumentGenerationChannel): void {
    if (this.#channel === channel) this.#channel = null;
  }

  publish(generation: DocumentGeneration): void {
    this.#channel?.publish(generation);
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
