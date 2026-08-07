"use client";

import { useCallback, useMemo } from "react";
import { RootedMaterial } from "./RootedMaterial";
import { useMatterStore } from "../store/matter-store";
import { createAdmissionAnchor } from "../runtime/admission";
import { useAdmission } from "../interaction/use-admission";
import { collectVocabulary } from "../material/material-vocabulary";
import { useMaterialPersistence } from "../persistence/use-material-persistence";
import { exportSnapshotArchive, importSnapshotArchive } from "../persistence/archive-transport";
import { treeToBundle } from "../persistence/snapshot-codec";
import { useCanvasPreferences } from "./use-canvas-preferences";

export function MatterApp() {
  const tree = useMatterStore((state) => state.tree);
  const documentEpoch = useMatterStore((state) => state.documentEpoch);
  const history = useMatterStore((state) => state.history);
  const navigation = useMatterStore((state) => state.navigation);
  const insertFixtureChild = useMatterStore((state) => state.insertFixtureChild);
  const undo = useMatterStore((state) => state.undo);
  const select = useMatterStore((state) => state.select);
  const clearSelection = useMatterStore((state) => state.clearSelection);
  const focus = useMatterStore((state) => state.focus);
  const showFull = useMatterStore((state) => state.showFull);
  const toggleFold = useMatterStore((state) => state.toggleFold);
  const admitHumanTranscript = useMatterStore((state) => state.admitHumanTranscript);
  const removeSelected = useMatterStore((state) => state.removeSelected);
  const moveNode = useMatterStore((state) => state.moveNode);
  const renameDocument = useMatterStore((state) => state.renameDocument);
  const hydrateSnapshot = useMatterStore((state) => state.hydrateSnapshot);
  const switchDocument = useMatterStore((state) => state.switchDocument);
  const persistence = useMaterialPersistence(tree, history, hydrateSnapshot, switchDocument);
  const canvasPreferences = useCanvasPreferences();
  const exportArchive = useCallback(async () => {
    const archive = await exportSnapshotArchive(treeToBundle(tree));
    if (!archive.ok) return archiveFailure(archive.error.code);
    const archiveCopy = new Uint8Array(archive.bytes.byteLength);
    archiveCopy.set(archive.bytes);
    const url = URL.createObjectURL(new Blob([archiveCopy.buffer], { type: "application/zip" }));
    // A detached anchor is not reliable in every browser (Safari ignores the
    // download attribute off-document), so append, click, then remove. The
    // object URL is revoked well after the browser has started the download.
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tree.id}.matter.zip`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return Object.freeze({ ok: true } as const);
  }, [tree]);
  const validateArchive = useCallback(async (file: File) => {
    const archive = await importSnapshotArchive(file);
    return archive.ok ? Object.freeze({ ok: true } as const) : archiveFailure(archive.error.code);
  }, []);
  const replaceArchive = useCallback(async (file: File) => {
    const archive = await importSnapshotArchive(file);
    if (!archive.ok) return archiveFailure(archive.error.code);
    const imported = await persistence.importMaterial(archive.tree);
    return imported.status === "switched"
      ? Object.freeze({ ok: true } as const)
      : archiveFailure(imported.errorCode);
  }, [persistence]);
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
    scope: { treeId: tree.id, revision: tree.revision, documentEpoch },
    locale: canvasPreferences.preferences.language,
    vocabulary: materialVocabulary,
  });
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
  const renameCurrentDocument = useCallback((title: string) => renameDocument({
    commandId: `human_title_${createOperationId()}`,
    title,
    createdAt: new Date().toISOString(),
  }), [renameDocument]);

  return (
    <RootedMaterial
      canUndo={history.entries.length > 0}
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
      onExitFocus={showFull}
      onFocusNode={focus}
      onInsertChild={insertFixtureChild}
      onSelectNode={select}
      onToggleFold={toggleFold}
      onUndo={undo}
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
    case "IMPORT_CONFLICT":
      return "A different copy of this material is already stored here.";
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
