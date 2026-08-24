"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RootedMaterial } from "./RootedMaterial";
import { useMatterStore } from "../store/matter-store";
import { createAdmissionAnchor } from "../runtime/admission";
import { useAdmission } from "../interaction/use-admission";
import { collectVocabulary } from "../material/material-vocabulary";
import { useMaterialPersistence } from "../persistence/use-material-persistence";
import { exportSnapshotArchive, importSnapshotArchive } from "../persistence/archive-transport";
import { treeToBundle } from "../persistence/snapshot-codec";
import { useCanvasPreferences } from "./use-canvas-preferences";
import type { TransformEnvelope, TransformPlan } from "../protocol/transform-contract";
import type { TransformCommittedChange } from "../store/matter-store";
import {
  seededFallbackBranchTexts,
  type SeededBranchTextResolver,
} from "../material/seeded-material-core";
import type { SeededSessionRelocalizer } from "../material/seeded-session-localization";

export function MatterApp() {
  const tree = useMatterStore((state) => state.tree);
  const documentEpoch = useMatterStore((state) => state.documentEpoch);
  const history = useMatterStore((state) => state.history);
  const navigation = useMatterStore((state) => state.navigation);
  const extendMaterial = useMatterStore((state) => state.extendMaterial);
  const localizeSeededMaterial = useMatterStore((state) => state.localizeSeededMaterial);
  const undo = useMatterStore((state) => state.undo);
  const redo = useMatterStore((state) => state.redo);
  const commitTransform = useMatterStore((state) => state.commitTransform);
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
  const persistence = useMaterialPersistence(tree, history, documentEpoch, hydrateSnapshot, switchDocument);
  const canvasPreferences = useCanvasPreferences();
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
  const exportArchive = useCallback(async () => {
    if (persistence.status.errorCode === "PERSISTENCE_CORRUPT") {
      const recovery = await persistence.exportCorruptRecovery();
      if (!recovery.ok) return archiveFailure(recovery.errorCode);
      downloadLocalBytes(recovery.bytes, recovery.fileName, "application/json");
      return Object.freeze({
        ok: true as const,
        repairCorrupt: async () => {
          const replaced = await persistence.replaceCorrupt();
          return replaced.ok
            ? Object.freeze({ ok: true } as const)
            : archiveFailure(replaced.errorCode);
        },
      });
    }
    const archive = await exportSnapshotArchive(treeToBundle(tree));
    if (!archive.ok) return archiveFailure(archive.error.code);
    downloadLocalBytes(archive.bytes, `${tree.id}.matter.zip`, "application/zip");
    return Object.freeze({ ok: true } as const);
  }, [persistence, tree]);
  const validateArchive = useCallback(async (file: File) => {
    const archive = await importSnapshotArchive(file);
    if (!archive.ok) return archiveFailure(archive.error.code);
    return archive.tree.id === tree.id
      ? Object.freeze({ ok: true } as const)
      : archiveFailure("IMPORT_FOREIGN_DOCUMENT");
  }, [tree.id]);
  const replaceArchive = useCallback(async (file: File) => {
    const basis = Object.freeze({
      treeId: tree.id,
      revision: tree.revision,
      documentEpoch,
    });
    const archive = await importSnapshotArchive(file);
    if (!archive.ok) return archiveFailure(archive.error.code);
    const imported = await persistence.importMaterial(archive.tree, basis);
    return imported.status === "switched"
      ? Object.freeze({ ok: true } as const)
      : archiveFailure(imported.errorCode);
  }, [documentEpoch, persistence, tree.id, tree.revision]);
  const archive = useMemo(() => Object.freeze({
    exportCopy: exportArchive,
    validateImport: validateArchive,
    replaceImport: replaceArchive,
  }), [exportArchive, replaceArchive, validateArchive]);
  // Recomputed only when the material or the language actually moves. Every
  // term here is already on the person's own canvas; nothing is retrieved.
  const materialVocabulary = useMemo(
    () => collectVocabulary(
      Object.values(tree.nodes).map((node) => node.text),
      canvasPreferences.preferences.language,
    ),
    [tree.nodes, canvasPreferences.preferences.language],
  );
  const admission = useAdmission({
    commit: admitHumanTranscript,
    settleRepair: settleHumanTranscriptRepair,
    scope: { treeId: tree.id, revision: tree.revision, documentEpoch },
    locale: canvasPreferences.preferences.language,
    vocabulary: materialVocabulary,
  });
  useLayoutEffect(() => {
    if (
      seededSessionRelocalizer === null ||
      persistence.status.phase === "loading" ||
      admission.state.phase !== "idle"
    ) return;
    localizeSeededMaterial(
      canvasPreferences.preferences.language,
      seededSessionRelocalizer,
    );
  }, [
    admission.state.phase,
    canvasPreferences.preferences.language,
    documentEpoch,
    localizeSeededMaterial,
    persistence.status.phase,
    seededSessionRelocalizer,
  ]);
  const clearRepairPresentations = admission.clearRepairPresentations;
  const discardPendingRepairs = admission.discardPendingRepairs;
  const undoWithPresentationReset = useCallback(() => {
    discardPendingRepairs();
    clearRepairPresentations();
    undo();
  }, [clearRepairPresentations, discardPendingRepairs, undo]);
  const redoWithPresentationReset = useCallback(() => {
    discardPendingRepairs();
    clearRepairPresentations();
    redo();
  }, [clearRepairPresentations, discardPendingRepairs, redo]);
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
  ): TransformCommittedChange | null => {
    const receipt = commitTransform(envelope, plan, expectedDocumentEpoch, Date.now());
    return receipt.operation === "commit" && receipt.status === "committed" && "transformChange" in receipt
      ? receipt.transformChange
      : null;
  }, [commitTransform]);
  return (
    <RootedMaterial
      canUndo={history.entries.length > 0}
      canRedo={(history.redoEntries?.length ?? 0) > 0}
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
      persistence={persistence}
      onRemoveSelected={removeCurrentThought}
      onMoveNode={moveCurrentThought}
      onRenameDocument={renameCurrentDocument}
      onClearSelection={clearSelection}
      onTransformCommit={commitTransformTurn}
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

function createOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function archiveFailure(code: string) {
  const message = archiveMessage(code);
  return Object.freeze({ ok: false as const, message });
}

function archiveMessage(code: string): string {
  switch (code) {
    case "IMPORT_STALE":
      return "Material changed while this archive was being prepared. Review it and try again.";
    case "IMPORT_CONFLICT":
      return "A different copy of this material is already stored here.";
    case "IMPORT_FOREIGN_DOCUMENT":
      return "This preview can restore only a copy of the current document.";
    case "IMPORT_INVALID_TREE":
      return "This material cannot be restored.";
    case "PERSISTENCE_UNAVAILABLE":
    case "PERSISTENCE_WRITE_FAILED":
      return "This browser could not save the imported material.";
    case "PERSISTENCE_CORRUPT":
      return "Stored material must be repaired before importing.";
    case "ARCHIVE_BOUND_EXCEEDED":
      return "This archive exceeds Matter’s supported size.";
    case "ARCHIVE_UNSUPPORTED_ENTRY":
      return "This archive contains unsupported files or paths.";
    case "ARCHIVE_UNAVAILABLE":
      return "Archive support is unavailable in this browser.";
    default:
      return "This archive is not valid Matter material.";
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
