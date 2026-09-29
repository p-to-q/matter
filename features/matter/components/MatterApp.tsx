"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RootedMaterial } from "./RootedMaterial";
import { useMatterStore } from "./use-matter-store";
import { createAdmissionAnchor } from "../runtime/admission";
import { useAdmission } from "../interaction/use-admission";
import { useMaterialPersistence } from "../persistence/use-material-persistence";
import { exportSnapshotArchive, importSnapshotArchive } from "../persistence/archive-transport";
import { treeToBundle } from "../persistence/snapshot-codec";
import { useCanvasPreferences } from "./use-canvas-preferences";
import type { TransformEnvelope, TransformPlan } from "../protocol/transform-contract";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import type {
  MatterStoreReceipt,
  TextSwapCommittedChange,
  TransformCommittedChange,
} from "../store/matter-store";
import type { MaterialTurnCommitResult } from "../interaction/material-turn-result";
import {
  materialIsIdle,
  materialTurnsHoldBasis,
  SETTLED_PAPER_MATERIAL_TURNS,
  type PaperMaterialTurnPhases,
} from "./material-turn-activity";
import {
  seededFallbackBranchTexts,
  type SeededBranchTextResolver,
} from "../material/seeded-material-core";
import type { SeededSessionRelocalizer } from "../material/seeded-session-localization";
import { useWikiAuthority } from "../persistence/use-wiki-authority";
import { useStoragePersistence } from "../persistence/use-storage-persistence";
import { materialFilesCopy, type MaterialFilesCopy } from "./material-files-copy";

export function MatterApp() {
  useWikiAuthority();
  const tree = useMatterStore((state) => state.tree);
  const documentEpoch = useMatterStore((state) => state.documentEpoch);
  const history = useMatterStore((state) => state.history);
  const untouchedTree = useMatterStore((state) => state.untouchedTree);
  const navigation = useMatterStore((state) => state.navigation);
  const extendMaterial = useMatterStore((state) => state.extendMaterial);
  const localizeSeededMaterial = useMatterStore((state) => state.localizeSeededMaterial);
  const undo = useMatterStore((state) => state.undo);
  const redo = useMatterStore((state) => state.redo);
  const commitTransform = useMatterStore((state) => state.commitTransform);
  const commitTextSwap = useMatterStore((state) => state.commitTextSwap);
  const select = useMatterStore((state) => state.select);
  const clearSelection = useMatterStore((state) => state.clearSelection);
  const focus = useMatterStore((state) => state.focus);
  const showFull = useMatterStore((state) => state.showFull);
  const toggleFold = useMatterStore((state) => state.toggleFold);
  const admitHumanTranscript = useMatterStore((state) => state.admitHumanTranscript);
  const settleHumanTranscriptRepair = useMatterStore((state) => state.settleHumanTranscriptRepair);
  const removeSelected = useMatterStore((state) => state.removeSelected);
  const moveNode = useMatterStore((state) => state.moveNode);
  const renameDocument = useMatterStore((state) => state.renameDocument);
  const hydrateSnapshot = useMatterStore((state) => state.hydrateSnapshot);
  const switchDocument = useMatterStore((state) => state.switchDocument);
  const canvasPreferences = useCanvasPreferences();
  const admission = useAdmission({
    commit: admitHumanTranscript,
    settleRepair: settleHumanTranscriptRepair,
    scope: { treeId: tree.id, revision: tree.revision, documentEpoch },
    locale: canvasPreferences.preferences.language,
  });
  const [paperTurnPhases, setPaperTurnPhases] =
    useState<PaperMaterialTurnPhases>(SETTLED_PAPER_MATERIAL_TURNS);
  // One signal gates every replacement of the loaded document instance.
  const materialTurns = { admission: admission.state.phase, paper: paperTurnPhases };
  const persistence = useMaterialPersistence(
    tree,
    history,
    untouchedTree,
    documentEpoch,
    hydrateSnapshot,
    switchDocument,
    materialIsIdle(materialTurns),
  );
  const storagePersistence = useStoragePersistence();
  const requestStoragePersistence = storagePersistence.request;
  const archiveCopy = materialFilesCopy(canvasPreferences.preferences.language);
  const branchTextResolverRef = useRef<SeededBranchTextResolver>(seededFallbackBranchTexts);
  const [seededSessionRelocalizer, setSeededSessionRelocalizer] =
    useState<SeededSessionRelocalizer | null>(null);
  useEffect(() => {
    let active = true;
    void import("../material/seeded-branch-copy").then(
      ({ seededBranchTexts }) => {
        if (active) branchTextResolverRef.current = seededBranchTexts;
      },
      () => {
        // Branch remains a synchronous, local action on the closed five-locale
        // floor if its richer interaction-only copy chunk cannot be loaded.
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (seededSessionRelocalizer !== null) return;
    let active = true;
    void import("../material/seeded-session-localization").then(
      ({ relocalizeSeededSession }) => {
        if (active) setSeededSessionRelocalizer(() => relocalizeSeededSession);
      },
      () => {
        // A missing optional chunk cannot authorize a partial tree/history
        // migration. A later document or locale epoch may retry the import.
      },
    );
    return () => {
      active = false;
    };
  }, [
    canvasPreferences.preferences.language,
    documentEpoch,
    seededSessionRelocalizer,
  ]);
  // Export, Replace, and Retry are the only gestures that may ask the browser
  // to keep storage persistent; each asks before its first await.
  const exportArchive = useCallback(async () => {
    requestStoragePersistence("export");
    if (persistence.status.errorCode === "PERSISTENCE_CORRUPT") {
      const recovery = await persistence.exportCorruptRecovery();
      if (!recovery.ok) return archiveFailure(recovery.errorCode, archiveCopy);
      downloadLocalBytes(recovery.bytes, recovery.fileName, "application/json");
      return Object.freeze({
        ok: true as const,
        repairCorrupt: async () => {
          const replaced = await persistence.replaceCorrupt();
          return replaced.ok
            ? Object.freeze({ ok: true } as const)
            : archiveFailure(replaced.errorCode, archiveCopy);
        },
      });
    }
    // Always exported from memory: superseded or cleared storage cannot be read.
    const archive = await exportSnapshotArchive(treeToBundle(tree));
    if (!archive.ok) return archiveFailure(archive.error.code, archiveCopy);
    downloadLocalBytes(archive.bytes, `${tree.id}.matter.zip`, "application/zip");
    return Object.freeze({ ok: true } as const);
  }, [archiveCopy, persistence, requestStoragePersistence, tree]);
  const validateArchive = useCallback(async (file: File) => {
    const archive = await importSnapshotArchive(file);
    if (!archive.ok) return archiveFailure(archive.error.code, archiveCopy);
    return archive.tree.id === tree.id
      ? Object.freeze({ ok: true as const, olderThanCurrent: archive.tree.revision < tree.revision })
      : archiveFailure("IMPORT_FOREIGN_DOCUMENT", archiveCopy);
  }, [archiveCopy, tree.id, tree.revision]);
  const replaceArchive = useCallback(async (
    file: File,
    options: Readonly<{ replaceUnsaved: boolean }>,
  ) => {
    requestStoragePersistence("replace");
    const basis = Object.freeze({
      treeId: tree.id,
      revision: tree.revision,
      documentEpoch,
    });
    const archive = await importSnapshotArchive(file);
    if (!archive.ok) return archiveFailure(archive.error.code, archiveCopy);
    const imported = await persistence.importMaterial(archive.tree, basis, options);
    return imported.status === "switched"
      ? Object.freeze({ ok: true } as const)
      : archiveFailure(imported.errorCode, archiveCopy);
  }, [archiveCopy, documentEpoch, persistence, requestStoragePersistence, tree.id, tree.revision]);
  const archive = useMemo(() => Object.freeze({
    exportCopy: exportArchive,
    validateImport: validateArchive,
    replaceImport: replaceArchive,
  }), [exportArchive, replaceArchive, validateArchive]);
  const retrySaving = persistence.retry;
  const persistenceSurface = useMemo(() => Object.freeze({
    status: persistence.status,
    retry: () => {
      requestStoragePersistence("retry");
      retrySaving();
    },
    resolveConflict: persistence.resolveConflict,
    acknowledgeHistoryNotice: persistence.acknowledgeHistoryNotice,
    storagePersisted: storagePersistence.persisted,
  }), [
    persistence.acknowledgeHistoryNotice,
    persistence.resolveConflict,
    persistence.status,
    requestStoragePersistence,
    retrySaving,
    storagePersistence.persisted,
  ]);
  const turnsHoldSeedBasis = materialTurnsHoldBasis(materialTurns);
  const reportHistoryUnavailable = persistence.reportHistoryUnavailable;
  // Reconciliation completes once, after the first load; save phases are not
  // a reason to look at the seed again.
  const materialReconciled = persistence.initialReconciliationComplete &&
    persistence.status.phase !== "loading";
  useLayoutEffect(() => {
    // Relocalization waits for every material turn that read current passages
    // and reruns when the last one settles, so a locale change never revokes a
    // submitted Point-and-Talk or Elastic request on seed copy. It runs for a
    // language or document change only; its cost never follows the journal.
    if (
      seededSessionRelocalizer === null ||
      !materialReconciled ||
      turnsHoldSeedBasis
    ) return;
    const receipt = localizeSeededMaterial(
      canvasPreferences.preferences.language,
      seededSessionRelocalizer,
    );
    if (receipt.historyReleased === true) reportHistoryUnavailable();
  }, [
    canvasPreferences.preferences.language,
    documentEpoch,
    localizeSeededMaterial,
    materialReconciled,
    reportHistoryUnavailable,
    seededSessionRelocalizer,
    turnsHoldSeedBasis,
  ]);
  const clearRepairPresentations = admission.clearRepairPresentations;
  // A step that no longer applies releases its stack in the store; the
  // durability surface carries the one quiet notice about it.
  const undoWithPresentationReset = useCallback(() => {
    clearRepairPresentations();
    if (isHistoryUnavailable(undo())) reportHistoryUnavailable();
  }, [clearRepairPresentations, reportHistoryUnavailable, undo]);
  const redoWithPresentationReset = useCallback(() => {
    clearRepairPresentations();
    if (isHistoryUnavailable(redo())) reportHistoryUnavailable();
  }, [clearRepairPresentations, redo, reportHistoryUnavailable]);
  const admissionAnchor = createAdmissionAnchor(tree, navigation);
  const removeCurrentThought = useCallback(() => removeSelected({
    commandId: `human_removal_${createOperationId()}`,
    createdAt: new Date().toISOString(),
  }), [removeSelected]);
  const moveCurrentThought = useCallback((nodeId: string, targetParentId: string, targetIndex?: number) => moveNode({
    commandId: `human_move_${createOperationId()}`,
    nodeId,
    targetParentId,
    ...(targetIndex === undefined ? {} : { targetIndex }),
    createdAt: new Date().toISOString(),
  }), [moveNode]);
  // Branch is the one durable mutation whose material the product composes
  // rather than the person speaking it. Its identity and time are still theirs.
  const extendChild = useCallback((parentNodeId: string) => extendMaterial(
    parentNodeId,
    {
      nodeId: `thought_${createOperationId()}`,
      createdAt: new Date().toISOString(),
    },
    canvasPreferences.preferences.language,
    branchTextResolverRef.current,
  ), [canvasPreferences.preferences.language, extendMaterial]);
  const renameCurrentDocument = useCallback((title: string) => renameDocument({
    commandId: `human_title_${createOperationId()}`,
    title,
    createdAt: new Date().toISOString(),
  }), [renameDocument]);
  const commitTransformTurn = useCallback((
    envelope: TransformEnvelope,
    plan: TransformPlan,
    expectedDocumentEpoch: number,
  ): MaterialTurnCommitResult<TransformCommittedChange> => {
    const receipt = commitTransform(envelope, plan, expectedDocumentEpoch, Date.now());
    return materialTurnResult(receipt, "transformChange" in receipt ? receipt.transformChange : null);
  }, [commitTransform]);
  const commitTextSwapTurn = useCallback((
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    expectedDocumentEpoch: number,
  ): MaterialTurnCommitResult<TextSwapCommittedChange> => {
    const receipt = commitTextSwap(envelope, plan, expectedDocumentEpoch, Date.now());
    return materialTurnResult(receipt, "textSwapChange" in receipt ? receipt.textSwapChange : null);
  }, [commitTextSwap]);
  return (
    <RootedMaterial
      canUndo={history.entries.length > 0}
      canRedo={history.redoEntries.length > 0}
      canvasPreferences={canvasPreferences}
      locale={canvasPreferences.preferences.language}
      documentEpoch={documentEpoch}
      archive={archive}
      admission={admission}
      admissionAnchor={
        admissionAnchor.ok
          ? admissionAnchor.anchor.target === "root"
            ? {
                kind: "root",
                treeId: admissionAnchor.anchor.treeId,
                baseRevision: admissionAnchor.anchor.baseRevision,
              }
            : {
                kind: "child",
                treeId: admissionAnchor.anchor.treeId,
                baseRevision: admissionAnchor.anchor.baseRevision,
                parentNodeId: admissionAnchor.anchor.parentNodeId,
              }
          : null
      }
      navigation={navigation}
      persistence={persistenceSurface}
      onRemoveSelected={removeCurrentThought}
      onMoveNode={moveCurrentThought}
      onRenameDocument={renameCurrentDocument}
      onClearSelection={clearSelection}
      onTransformCommit={commitTransformTurn}
      onTextSwapCommit={commitTextSwapTurn}
      onMaterialTurnPhasesChange={setPaperTurnPhases}
      onExitFocus={showFull}
      onFocusNode={focus}
      onInsertChild={extendChild}
      onSelectNode={select}
      onToggleFold={toggleFold}
      onUndo={undoWithPresentationReset}
      onRedo={redoWithPresentationReset}
      tree={tree}
    />
  );
}

function materialTurnResult<Change>(
  receipt: Readonly<{ status: string }>,
  change: Change | null,
): MaterialTurnCommitResult<Change> {
  if (receipt.status === "committed" && change !== null) {
    return Object.freeze({ status: "committed", change });
  }
  return Object.freeze({ status: receipt.status === "stale" ? "stale" : "rejected" });
}

function createOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isHistoryUnavailable(receipt: MatterStoreReceipt): boolean {
  return receipt.status === "rejected" &&
    "errorCode" in receipt &&
    receipt.errorCode === "HISTORY_UNAVAILABLE";
}

function archiveFailure(code: string, copy: MaterialFilesCopy) {
  return Object.freeze({ ok: false as const, message: archiveMessage(code, copy) });
}

function archiveMessage(code: string, copy: MaterialFilesCopy): string {
  switch (code) {
    case "IMPORT_STALE":
      return copy.archiveErrorStale;
    case "IMPORT_CONFLICT":
      return copy.archiveErrorConflict;
    case "IMPORT_DIRTY":
      return copy.archiveErrorDirty;
    case "IMPORT_SAVING":
      return copy.archiveErrorSaving;
    case "IMPORT_FOREIGN_DOCUMENT":
      return copy.archiveErrorForeign;
    case "IMPORT_INVALID_TREE":
      return copy.archiveErrorInvalidTree;
    case "PERSISTENCE_STORAGE_FULL":
      return copy.archiveErrorStorageFull;
    case "PERSISTENCE_UNAVAILABLE":
    case "PERSISTENCE_WRITE_FAILED":
      return copy.archiveErrorSaveFailed;
    case "PERSISTENCE_CORRUPT":
      return copy.archiveErrorCorrupt;
    case "PERSISTENCE_SUPERSEDED":
      return copy.archiveErrorSuperseded;
    case "PERSISTENCE_CLEARED":
      return copy.archiveErrorCleared;
    case "ARCHIVE_BOUND_EXCEEDED":
      return copy.archiveErrorTooLarge;
    case "ARCHIVE_UNSUPPORTED_ENTRY":
      return copy.archiveErrorUnsupported;
    case "ARCHIVE_UNAVAILABLE":
      return copy.archiveErrorUnavailable;
    default:
      return copy.archiveErrorInvalid;
  }
}

function downloadLocalBytes(bytes: Uint8Array, fileName: string, type: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type }));
  // A detached anchor is not reliable in every browser (Safari ignores the
  // download attribute off-document), so append, click, then remove. The object
  // URL is revoked well after the browser has started the download.
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
