"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  SetStateAction,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  deriveMaterialFileLabel,
  projectMaterialAncestry,
  projectMaterialFileOutline,
  projectMaterialFileSubtree,
  projectMaterialFiles,
  serializeMaterialSelection,
} from "../material/material-files";
import { createNavigationState, type NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";
import type { MaterialFileRow } from "../material/material-files";
import { ChevronIcon, CopyIcon, DownloadIcon, SearchIcon, SidebarIcon, SyncIcon } from "./icons";
import type { PersistenceStatus } from "../persistence/persistence-controller";
import { allocateSnapshotPath } from "../persistence/snapshot-paths";
import { projectMaterialFilesSurface } from "./material-files-surface";
import {
  projectMaterialFileRenderRanges,
  projectMaterialFileWindow,
  scrollTopForMaterialFileIndex,
} from "./material-file-window";

export type MaterialFilesProps = Readonly<{
  /**
   * Archive actions live above this surface because validation and document
   * replacement must remain atomic with persistence. This panel only owns the
   * local file-picker, confirmation, and busy/error presentation.
   */
  archive?: MaterialArchiveActions;
  documentEpoch: number;
  interactionPending: boolean;
  /**
   * Derived navigation labels by node id. A missing entry is normal: the row
   * falls back to the deterministic material title, so the panel never waits.
   */
  labels?: ReadonlyMap<string, string>;
  /** Provenance per row. Presentation only; never material. */
  labelOrigins?: ReadonlyMap<string, string>;
  navigation: NavigationState;
  onFocusNode: (nodeId: string) => void;
  /**
   * Names one row. A name a person types outranks every derived label and is
   * never overwritten automatically; an empty name returns the row to
   * automatic naming.
   */
  onRenameNode?: (nodeId: string, label: string) => void | Promise<void>;
  onRenameDocument?: (title: string) => void;
  onResetNodeName?: (nodeId: string) => void | Promise<void>;
  /** Reports the rows worth labelling. Called from an effect, never in render. */
  onVisibleNodes?: (nodeIds: readonly string[]) => void;
  onSelectNode: (nodeId: string) => void;
  tree: ThoughtTree;
  /** Transient passages addressed by the canvas lasso; never persisted. */
  lassoSelectedNodeIds?: ReadonlySet<string>;
  persistence: Readonly<{
    status: PersistenceStatus;
    retry: () => void;
    resolveConflict: () => void;
  }>;
}>;

type CopyState = "idle" | "copied" | "failed";

/** Long enough to be deliberate on touch, short enough not to feel stuck. */
const LONG_PRESS_MS = 480;
/** Matches the durable bound in the label repository. */
const MAX_ROW_NAME_CODE_UNITS = 64;
type ArchivePhase = "idle" | "exporting" | "validating" | "replacing";
type IndexMode = "archive" | "browse" | "search" | "select";
const COMPLETE_INDEX_NAVIGATION = createNavigationState();

export type MaterialArchiveActionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

/**
 * `validateImport` must not mutate the current document. `replaceImport` is
 * called only after the person confirms replacement and must perform the
 * persistence CAS and runtime document switch as one operation.
 */
export type MaterialArchiveActions = Readonly<{
  exportCopy: () => Promise<MaterialArchiveActionResult>;
  validateImport: (file: File) => Promise<MaterialArchiveActionResult>;
  replaceImport: (file: File) => Promise<MaterialArchiveActionResult>;
}>;

export function MaterialFiles(props: MaterialFilesProps) {
  const [open, setOpen] = useState(false);
  /**
   * At desk widths the index is simply part of the shell: the gutter is already
   * reserved for it, so there is nothing to gain by hiding it and no toggle to
   * carry. Below that width it overlays the canvas and still needs a handle.
   */
  const [docked, setDocked] = useState(false);
  const [mode, setMode] = useState<IndexMode>("browse");
  const [query, setQuery] = useState("");
  const [selectionState, setSelectionState] = useState<Readonly<{ epoch: number; ids: ReadonlySet<string> }>>(
    () => ({ epoch: props.documentEpoch, ids: new Set<string>() }),
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [showSaving, setShowSaving] = useState(false);
  const [archivePhase, setArchivePhase] = useState<ArchivePhase>("idle");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<File | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({ top: 0, height: 0 });
  const [rowHeight, setRowHeight] = useState(40);
  /**
   * Which rows have been closed. Material arrives expanded, so this stays empty
   * until someone deliberately collapses a branch. Closing belongs to the index,
   * not to the canvas: reading past a branch must not restructure the canvas.
   */
  const [collapsedState, setCollapsedState] = useState<Readonly<{ epoch: number; ids: ReadonlySet<string> }>>(
    () => ({ epoch: props.documentEpoch, ids: new Set<string>() }),
  );
  const [focusedRowState, setFocusedRowState] = useState(() => ({ epoch: props.documentEpoch, nodeId: null as string | null }));
  const [renaming, setRenaming] = useState<Readonly<{ epoch: number; nodeId: string }> | null>(null);
  const [renamingDocument, setRenamingDocument] = useState(false);
  const [documentTitleDraft, setDocumentTitleDraft] = useState("");
  const longPressRef = useRef<Readonly<{ timer: number; x: number; y: number }> | null>(null);
  const suppressOpenRef = useRef(false);
  const renameFocusedRef = useRef(false);
  const renameCommitRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const previousSearchKeyRef = useRef<string | null>(null);
  const liveDocumentEpochRef = useRef(props.documentEpoch);
  const resetDocumentEpochRef = useRef(props.documentEpoch);
  const deferredQuery = useDeferredValue(query);
  const deferredNavigation = useDeferredValue(props.navigation);
  const surface = useMemo(
    () => projectMaterialFilesSurface({
      currentNavigation: props.navigation,
      projectedNavigation: deferredNavigation,
      interactionPending: props.interactionPending,
    }),
    [deferredNavigation, props.interactionPending, props.navigation],
  );
  const visibleQuery = mode === "search" ? deferredQuery : "";
  const activeNodeId =
    props.navigation.mode === "focus"
      ? props.navigation.focusNodeId
      : props.navigation.selectedNodeId;
  /**
   * Expansion is derived, not synchronized. Whatever moves the canvas — a lasso,
   * voice admission, focus — reopens the branch the active thought sits in,
   * because an index that cannot answer "where am I" is not an index.
   */
  const collapsedNodeIds = useMemo(() => {
    const closed = new Set(collapsedState.epoch === props.documentEpoch ? collapsedState.ids : []);
    if (activeNodeId !== null) {
      for (const ancestorId of projectMaterialAncestry(props.tree, activeNodeId)) {
        closed.delete(ancestorId);
      }
    }
    return closed;
  }, [activeNodeId, collapsedState, props.documentEpoch, props.tree]);
  const rootId = props.tree.rootId;
  const documentTitle = props.tree.title ?? "Untitled matter";
  const titleForNode = useMemo(() => (nodeId: string): string => {
    const derived = props.labels?.get(nodeId);
    if (derived !== undefined) return derived;
    const node = props.tree.nodes[nodeId];
    return node === undefined ? "Untitled thought" : deriveMaterialFileLabel(node).title;
  }, [props.labels, props.tree.nodes]);
  const files = useMemo<readonly MaterialFileRow[]>(
    () => {
      if (!open) return [];
      if (mode === "search") {
        return visibleQuery.trim().length === 0
          ? []
          : projectMaterialFiles(props.tree, COMPLETE_INDEX_NAVIGATION, visibleQuery, props.labels)
            .filter((row) => row.directMatch);
      }
      // Copying spans the complete rooted outline, independently of canvas fold.
      return mode === "select"
        ? projectMaterialFileSubtree(props.tree, rootId)
        : projectMaterialFileOutline(props.tree, collapsedNodeIds);
    },
    [collapsedNodeIds, mode, open, props.labels, props.tree, rootId, visibleQuery],
  );
  const effectiveFocusedRowId = focusedRowState.epoch === props.documentEpoch ? focusedRowState.nodeId : null;
  const focusedRowIndex = effectiveFocusedRowId === null
    ? null
    : files.findIndex((file) => file.nodeId === effectiveFocusedRowId);
  const activeRowIndex = files.findIndex((file) => file.nodeId === activeNodeId);
  const fileWindow = useMemo(
    () => projectMaterialFileWindow({
      rowCount: files.length,
      rowHeight,
      scrollTop: scrollMetrics.top,
      viewportHeight: scrollMetrics.height,
    }),
    [files.length, rowHeight, scrollMetrics.height, scrollMetrics.top],
  );
  const renderRanges = useMemo(
    () => projectMaterialFileRenderRanges(
      fileWindow,
      focusedRowIndex === null || focusedRowIndex < 0 ? null : focusedRowIndex,
    ),
    [fileWindow, focusedRowIndex],
  );
  const markdownPathByNodeId = useMemo(
    () => {
      const paths = new Map<string, string>();
      if (!open) return paths;
      for (const range of renderRanges) {
        for (let index = range.start; index < range.end; index += 1) {
          const row = files[index];
          if (row === undefined) continue;
          const path = allocateSnapshotPath(props.tree, row.nodeId);
          if (path !== null) paths.set(row.nodeId, path);
        }
      }
      return paths;
    },
    [files, open, props.tree, renderRanges],
  );

  // Search results are flat, so a row carries its position as a path instead of
  // as indentation. Only rendered rows pay for it.
  const ancestryByNodeId = useMemo(
    () => {
      const paths = new Map<string, string>();
      if (!open || mode !== "search") return paths;
      for (const range of renderRanges) {
        for (let index = range.start; index < range.end; index += 1) {
          const row = files[index];
          if (row === undefined) continue;
          const ancestry = projectMaterialAncestry(props.tree, row.nodeId);
          if (ancestry.length === 0) continue;
          const titles = ancestry.slice(-2).map(titleForNode);
          paths.set(row.nodeId, ancestry.length > 2 ? `… › ${titles.join(" › ")}` : titles.join(" › "));
        }
      }
      return paths;
    },
    [files, mode, open, props.tree, renderRanges, titleForNode],
  );

  const visibleNodeIds = useMemo(
    () => {
      const ids: string[] = [];
      if (!open) return ids;
      if (rootId !== null && props.tree.nodes[rootId]?.role !== "document-root") ids.push(rootId);
      for (const range of renderRanges) {
        for (let index = range.start; index < range.end; index += 1) {
          const row = files[index];
          if (row !== undefined) ids.push(row.nodeId);
        }
      }
      return ids;
    },
    [files, open, props.tree.nodes, renderRanges, rootId],
  );
  const reportVisibleNodes = props.onVisibleNodes;

  // Labelling is an effect, not a render product: it publishes into an external
  // store, and running it during render would update state mid-commit.
  useEffect(() => {
    if (reportVisibleNodes === undefined || visibleNodeIds.length === 0) return;
    reportVisibleNodes(visibleNodeIds);
  }, [reportVisibleNodes, visibleNodeIds]);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 960px)");
    const applyViewportDefault = () => {
      setDocked(wide.matches);
      setOpen(wide.matches);
    };
    applyViewportDefault();
    wide.addEventListener("change", applyViewportDefault);
    return () => wide.removeEventListener("change", applyViewportDefault);
  }, []);

  useEffect(() => () => {
    if (copyResetRef.current !== null) clearTimeout(copyResetRef.current);
  }, []);

  useEffect(() => () => {
    if (longPressRef.current !== null) clearTimeout(longPressRef.current.timer);
  }, []);

  useLayoutEffect(() => {
    liveDocumentEpochRef.current = props.documentEpoch;
  }, [props.documentEpoch]);

  useEffect(() => {
    if (resetDocumentEpochRef.current === props.documentEpoch) return;
    resetDocumentEpochRef.current = props.documentEpoch;
    if (copyResetRef.current !== null) clearTimeout(copyResetRef.current);
    copyResetRef.current = null;
    if (longPressRef.current !== null) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    previousSearchKeyRef.current = null;
    if (bodyRef.current !== null) bodyRef.current.scrollTop = 0;
    if (archiveInputRef.current !== null) archiveInputRef.current.value = "";
    setMode("browse");
    setQuery("");
    setSelectionState({ epoch: props.documentEpoch, ids: new Set<string>() });
    setCollapsedState({ epoch: props.documentEpoch, ids: new Set<string>() });
    setFocusedRowState({ epoch: props.documentEpoch, nodeId: null });
    setRenaming(null);
    setRenamingDocument(false);
    setDocumentTitleDraft("");
    setCopyState("idle");
    setArchivePhase("idle");
    setArchiveError(null);
    setPreparedImport(null);
    setScrollMetrics({ top: 0, height: bodyRef.current?.clientHeight ?? 0 });
  }, [props.documentEpoch]);

  // A rename belongs to one document. Switching documents abandons it rather
  // than applying a name to whatever node now holds that id.
  const activeRename = renaming?.epoch === props.documentEpoch ? renaming.nodeId : null;
  const renameEnabled = props.onRenameNode !== undefined && props.onResetNodeName !== undefined;

  const beginRename = (nodeId: string) => {
    // A stale projection blocks actions that depend on *which* rows are shown.
    // Naming depends only on this node id, which the row already resolved, so
    // it waits for a live interaction but not for the projection to catch up —
    // otherwise the click that selects a row cancels the double-click on it.
    if (!renameEnabled || props.interactionPending || renameCommitRef.current !== null) return;
    renameFocusedRef.current = false;
    setRenaming({ epoch: props.documentEpoch, nodeId });
  };

  const cancelLongPress = () => {
    if (longPressRef.current === null) return;
    clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  const commitRename = (nodeId: string, value: string) => {
    const mutationKey = `${props.documentEpoch} ${nodeId}`;
    if (renameCommitRef.current === mutationKey) return;
    renameCommitRef.current = mutationKey;
    setRenaming(null);
    const trimmed = value.trim();
    const mutation = trimmed.length === 0
      ? props.onResetNodeName?.(nodeId)
      : props.onRenameNode?.(nodeId, trimmed);
    void Promise.resolve(mutation).catch(() => undefined).finally(() => {
      if (renameCommitRef.current === mutationKey) renameCommitRef.current = null;
    });
  };

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    const saving = props.persistence.status.phase === "saving";
    const timer = window.setTimeout(() => setShowSaving(saving), saving ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [props.persistence.status.phase]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!open || body === null) return;
    const read = () => {
      const nextRowHeight = Number.parseFloat(getComputedStyle(body).getPropertyValue("--index-row"));
      if (Number.isFinite(nextRowHeight) && nextRowHeight > 0) setRowHeight(nextRowHeight);
      setScrollMetrics({ top: body.scrollTop, height: body.clientHeight });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(body);
    window.addEventListener("resize", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", read);
    };
    // Search rows carry a second line, so the row height is mode dependent and
    // the window geometry has to be re-read when the mode changes.
  }, [mode, open]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!open || surface.projectionStale || body === null) return;
    const searchKey = `${mode}:${visibleQuery}`;
    if (previousSearchKeyRef.current !== null && previousSearchKeyRef.current !== searchKey) {
      body.scrollTop = 0;
      setScrollMetrics({ top: 0, height: body.clientHeight });
    }
    previousSearchKeyRef.current = searchKey;
  }, [mode, open, surface.projectionStale, visibleQuery]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!open || surface.projectionStale || activeRowIndex < 0 || body === null) return;
    const nextTop = scrollTopForMaterialFileIndex({
      index: activeRowIndex,
      rowCount: files.length,
      rowHeight,
      scrollTop: body.scrollTop,
      viewportHeight: body.clientHeight,
    });
    if (nextTop === body.scrollTop) return;
    body.scrollTop = nextTop;
    setScrollMetrics({ top: nextTop, height: body.clientHeight });
  }, [activeRowIndex, files.length, open, rowHeight, surface.projectionStale]);

  const currentSelectedIds = useMemo(
    () => new Set(Array.from(selectionState.epoch === props.documentEpoch ? selectionState.ids : []).filter((nodeId) =>
      Object.hasOwn(props.tree.nodes, nodeId),
    )),
    [props.documentEpoch, props.tree.nodes, selectionState],
  );
  const selectedCount = currentSelectedIds.size;
  const persistenceFailed = props.persistence.status.phase === "error";
  const storageFull = props.persistence.status.errorCode === "PERSISTENCE_STORAGE_FULL";
  const activeLineageIds = useMemo(() => {
    const lineage = new Set<string>();
    let current = activeNodeId === null ? null : props.tree.nodes[activeNodeId]?.parentId ?? null;
    while (current !== null && !lineage.has(current)) {
      lineage.add(current);
      current = props.tree.nodes[current]?.parentId ?? null;
    }
    return lineage;
  }, [activeNodeId, props.tree.nodes]);

  const openNode = (nodeId: string) => {
    if (props.navigation.mode === "focus") props.onFocusNode(nodeId);
    else props.onSelectNode(nodeId);
  };

  /** Reading a thought reopens it, the way a file tree opens what you click. */
  const openAndExpand = (nodeId: string, hasChildren: boolean) => {
    openNode(nodeId);
    if (!hasChildren || !collapsedNodeIds.has(nodeId)) return;
    const ids = new Set(collapsedNodeIds);
    ids.delete(nodeId);
    setCollapsedState({ epoch: props.documentEpoch, ids });
  };

  /** Opens or closes a branch in place. It never moves the canvas. */
  const toggleExpanded = (nodeId: string) => {
    if (surface.rowInteractionDisabled) return;
    setCollapsedState({
      epoch: props.documentEpoch,
      ids: toggleSetValue(collapsedNodeIds, nodeId),
    });
  };

  const copySelection = async () => {
    const result = serializeMaterialSelection(props.tree, currentSelectedIds);
    if (!result.ok || navigator.clipboard?.writeText === undefined) {
      settleCopyState("failed", copyResetRef, setCopyState);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.text);
      settleCopyState("copied", copyResetRef, setCopyState);
    } catch {
      settleCopyState("failed", copyResetRef, setCopyState);
    }
  };

  // A document boundary must not race a live voice/lasso operation. The panel
  // stays visible, but replacement waits until the current interaction settles.
  const archiveBusy = archivePhase !== "idle" || props.interactionPending;
  const closeArchive = () => {
    if (archiveBusy) return;
    setArchiveError(null);
    setPreparedImport(null);
    setMode("browse");
  };

  const exportArchive = async () => {
    if (props.archive === undefined || archiveBusy) return;
    const documentEpoch = props.documentEpoch;
    setArchiveError(null);
    setArchivePhase("exporting");
    try {
      const result = await props.archive.exportCopy();
      if (liveDocumentEpochRef.current === documentEpoch && !result.ok) {
        setArchiveError(result.message);
      }
    } catch (error) {
      if (liveDocumentEpochRef.current === documentEpoch) {
        setArchiveError(actionErrorMessage(error));
      }
    } finally {
      if (liveDocumentEpochRef.current === documentEpoch) setArchivePhase("idle");
    }
  };

  const validateArchiveImport = async (file: File) => {
    if (props.archive === undefined || archiveBusy) return;
    const documentEpoch = props.documentEpoch;
    setArchiveError(null);
    setPreparedImport(null);
    setArchivePhase("validating");
    try {
      const result = await props.archive.validateImport(file);
      if (liveDocumentEpochRef.current !== documentEpoch) return;
      if (result.ok) setPreparedImport(file);
      else setArchiveError(result.message);
    } catch (error) {
      if (liveDocumentEpochRef.current === documentEpoch) {
        setArchiveError(actionErrorMessage(error));
      }
    } finally {
      if (liveDocumentEpochRef.current === documentEpoch) setArchivePhase("idle");
    }
  };

  const replaceArchiveImport = async () => {
    if (props.archive === undefined || preparedImport === null || archiveBusy) return;
    const documentEpoch = props.documentEpoch;
    setArchiveError(null);
    setArchivePhase("replacing");
    try {
      const result = await props.archive.replaceImport(preparedImport);
      if (liveDocumentEpochRef.current !== documentEpoch) return;
      if (result.ok) {
        setPreparedImport(null);
        setMode("browse");
      } else {
        setArchiveError(result.message);
      }
    } catch (error) {
      if (liveDocumentEpochRef.current === documentEpoch) {
        setArchiveError(actionErrorMessage(error));
      }
    } finally {
      if (liveDocumentEpochRef.current === documentEpoch) setArchivePhase("idle");
    }
  };

  return (
    <>
      {docked ? null : (
        <button
          aria-controls="material-files"
          aria-expanded={open}
          aria-label={open
            ? "Hide material files"
            : persistenceFailed
              ? "Show material files; saving needs attention"
              : "Show material files"}
          className="material-files-toggle"
          data-canvas-interactive
          data-persistence-error={persistenceFailed || undefined}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <SidebarIcon />
        </button>
      )}
      <aside
        aria-label="Material files"
        aria-hidden={!open}
        className="material-files"
        data-canvas-interactive
        data-mode={mode}
        data-open={open || undefined}
        data-persistence-phase={props.persistence.status.phase}
        data-projection-stale={surface.projectionStale || undefined}
        id="material-files"
        inert={!open || surface.projectionStale}
        onPointerDown={stopPointerPropagation}
        onWheel={stopWheelPropagation}
      >
        <header className="material-files__context" data-node-id={rootId ?? undefined}>
          {renamingDocument ? (
            <input
              aria-label="Canvas title"
              autoFocus
              className="material-files__context-title-input"
              maxLength={160}
              onBlur={() => {
                setRenamingDocument(false);
                if (documentTitleDraft.trim() !== documentTitle) props.onRenameDocument?.(documentTitleDraft);
              }}
              onChange={(event) => setDocumentTitleDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDocumentTitleDraft(documentTitle);
                  setRenamingDocument(false);
                } else if (event.key === "Enter") event.currentTarget.blur();
              }}
              value={documentTitleDraft}
            />
          ) : (
            <button
              aria-label={`Rename canvas: ${documentTitle}`}
              className="material-files__context-title"
              disabled={surface.rowInteractionDisabled}
              onClick={() => {
                setDocumentTitleDraft(documentTitle);
                setRenamingDocument(true);
              }}
              title="Rename canvas"
              type="button"
            >
              <span dir="auto">{documentTitle}</span>
            </button>
          )}
        </header>
        <div className="material-files__controls">
          {mode === "archive" ? (
            <>
              <span className="material-files__section-label">Material archive</span>
              <button
                className="material-files__mode-action material-files__mode-action--close"
                disabled={archiveBusy}
                onClick={closeArchive}
                type="button"
              >
                Close
              </button>
            </>
          ) : mode === "search" ? (
            <div className="material-files__search">
              <SearchIcon />
              <span className="visually-hidden">Filter material files</span>
              <input
                aria-label="Filter material files"
                autoFocus
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Find a thought…"
                spellCheck={false}
                type="search"
                value={query}
              />
              <button
                aria-label="Close search"
                className="material-files__search-close"
                onClick={() => {
                  setQuery("");
                  setMode("browse");
                }}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : (
            <button
              aria-label="Search thoughts"
              className="material-files__mode-action material-files__mode-action--search"
              onClick={() => setMode("search")}
              type="button"
            >
              <SearchIcon />
              <span>Search</span>
            </button>
          )}
          {mode !== "archive" ? (
            <>
              <button
                aria-pressed={mode === "select"}
                className="material-files__mode-action material-files__mode-action--select"
                onClick={() => {
                  setCopyState("idle");
                  setMode((current) => current === "select" ? "browse" : "select");
                }}
                type="button"
              >
                {mode === "select" ? "Done" : "Select"}
              </button>
              {props.archive !== undefined ? (
                <button
                  className="material-files__mode-action material-files__mode-action--archive"
                  onClick={() => {
                    setCopyState("idle");
                    setArchiveError(null);
                    setPreparedImport(null);
                    setMode("archive");
                  }}
                  type="button"
                >
                  Archive
                </button>
              ) : null}
            </>
          ) : null}
          <span className="visually-hidden">{props.tree.revision} committed revisions</span>
        </div>
        {mode === "archive" && props.archive !== undefined ? (
          <ArchivePanel
            busy={archiveBusy}
            error={archiveError}
            inputRef={archiveInputRef}
            phase={archivePhase}
            preparedImport={preparedImport}
            storageFull={storageFull}
            onClose={closeArchive}
            onExport={() => void exportArchive()}
            onPickImport={() => archiveInputRef.current?.click()}
            onReplace={() => void replaceArchiveImport()}
            onRetrySave={props.persistence.retry}
            onSelectImport={(file) => void validateArchiveImport(file)}
          />
        ) : (
          <div
            className="material-files__body"
            onScroll={() => {
              if (scrollFrameRef.current !== null) return;
              scrollFrameRef.current = requestAnimationFrame(() => {
                scrollFrameRef.current = null;
                const body = bodyRef.current;
                if (body !== null) setScrollMetrics({ top: body.scrollTop, height: body.clientHeight });
              });
            }}
            ref={bodyRef}
            tabIndex={-1}
          >
            {files.length === 0 ? (
            <p className="material-files__empty">
              {emptyIndexMessage(props.tree.rootId, mode, visibleQuery)}
            </p>
          ) : (
            <ul aria-label={`Markdown material tree, ${files.length} entries`} className="material-files__tree">
              {renderFileRanges(files, renderRanges, rowHeight, ({ file, index }) => {
                const checked = currentSelectedIds.has(file.nodeId);
                const active = activeNodeId === file.nodeId;
                const lassoSelected = props.lassoSelectedNodeIds?.has(file.nodeId) === true;
                const expanded = file.hasChildren && !collapsedNodeIds.has(file.nodeId);
                const materialNode = props.tree.nodes[file.nodeId];
                const derivedLabel = props.labels?.get(file.nodeId);
                const title = derivedLabel ?? (materialNode === undefined
                  ? "Untitled thought"
                  : deriveMaterialFileLabel(materialNode).title);
                return (
                  <li
                    aria-posinset={index + 1}
                    aria-setsize={files.length}
                    className="material-file"
                    data-active={active || undefined}
                    data-lasso-selected={lassoSelected || undefined}
                    data-label-origin={props.labelOrigins?.get(file.nodeId)}
                    data-direct-match={file.directMatch || undefined}
                    data-in-lineage={activeLineageIds.has(file.nodeId) || undefined}
                    key={file.nodeId}
                    style={{ "--material-file-depth": file.depth } as CSSProperties}
                    data-node-id={file.nodeId}
                    data-authored-index={file.authoredIndex}
                    data-created-at={file.createdAt}
                    data-markdown-path={markdownPathByNodeId.get(file.nodeId)}
                    data-updated-at={file.updatedAt}
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setFocusedRowState((current) => ({ epoch: props.documentEpoch, nodeId: current.nodeId === file.nodeId ? null : current.nodeId }));
                      }
                    }}
                    onFocusCapture={() => {
                      setFocusedRowState({ epoch: props.documentEpoch, nodeId: file.nodeId });
                    }}
                    data-has-children={file.hasChildren || undefined}
                    data-expanded={expanded || undefined}
                  >
                    {mode === "browse" ? (
                      // Disclosure keeps a fixed hit column; structural depth is
                      // carried by the row's measured horizontal step.
                      <button
                        aria-expanded={file.hasChildren ? expanded : undefined}
                        aria-label={file.hasChildren
                          ? `${expanded ? "Collapse" : "Expand"} ${title}`
                          : undefined}
                        className="material-file__disclosure"
                        disabled={!file.hasChildren || surface.rowInteractionDisabled}
                        onClick={() => toggleExpanded(file.nodeId)}
                        tabIndex={file.hasChildren ? 0 : -1}
                        type="button"
                      >
                        {file.hasChildren ? <ChevronIcon /> : <span aria-hidden="true" />}
                      </button>
                    ) : null}
                    {mode === "select" ? (
                      <label className="material-file__check" title={`Include ${title} when copying`}>
                        <input
                          aria-label={`Select ${title} for copying`}
                          checked={checked}
                          disabled={surface.rowInteractionDisabled}
                          onChange={() => {
                            setCopyState("idle");
                            setSelectionState((current) => ({
                              epoch: props.documentEpoch,
                              ids: current.epoch === props.documentEpoch
                                ? toggleSetValue(current.ids, file.nodeId)
                                : new Set([file.nodeId]),
                            }));
                          }}
                          type="checkbox"
                        />
                        <span aria-hidden="true" className="material-file__check-mark" />
                        <span className="material-file__title" dir="auto">{title}</span>
                      </label>
                    ) : activeRename === file.nodeId ? (
                      <input
                        aria-label={`Name for ${title}`}
                        autoFocus
                        className="material-file__rename"
                        defaultValue={title}
                        dir="auto"
                        maxLength={MAX_ROW_NAME_CODE_UNITS}
                        onBlur={(event) => {
                          // The pointer sequence that opened this editor can
                          // still be delivering events; a blur before the field
                          // has ever held focus is that, not a person leaving.
                          if (!renameFocusedRef.current) return;
                          commitRename(file.nodeId, event.currentTarget.value);
                        }}
                        onFocus={() => {
                          renameFocusedRef.current = true;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename(file.nodeId, event.currentTarget.value);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setRenaming(null);
                          }
                        }}
                        spellCheck={false}
                        type="text"
                      />
                    ) : (
                      <button
                        aria-current={active ? "page" : undefined}
                        className="material-file__open"
                        disabled={surface.rowInteractionDisabled}
                        onClick={() => {
                          // A long press already opened the name editor; the
                          // click it also produces must not navigate away.
                          if (suppressOpenRef.current) {
                            suppressOpenRef.current = false;
                            return;
                          }
                          openAndExpand(file.nodeId, file.hasChildren);
                        }}
                        onDoubleClick={() => beginRename(file.nodeId)}
                        onPointerCancel={cancelLongPress}
                        onPointerDown={(event) => {
                          if (!renameEnabled || !event.isPrimary) return;
                          cancelLongPress();
                          longPressRef.current = {
                            x: event.clientX,
                            y: event.clientY,
                            timer: window.setTimeout(() => {
                              longPressRef.current = null;
                              suppressOpenRef.current = true;
                              beginRename(file.nodeId);
                            }, LONG_PRESS_MS),
                          };
                        }}
                        onPointerMove={(event) => {
                          const press = longPressRef.current;
                          if (press === null) return;
                          if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
                            cancelLongPress();
                          }
                        }}
                        onPointerUp={cancelLongPress}
                        title={title}
                        type="button"
                      >
                        <span className="material-file__title" dir="auto">{title}</span>
                        {ancestryByNodeId.has(file.nodeId) ? (
                          <span className="material-file__path" dir="auto">
                            {ancestryByNodeId.get(file.nodeId)}
                          </span>
                        ) : null}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        )}
        {mode === "select" ? (
          <footer className="material-files__footer">
            <span aria-live="polite" className="material-files__copy-status">
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy unavailable"
                  : `${selectedCount} selected`}
            </span>
            <button
              aria-label={`Copy ${selectedCount} selected thoughts`}
              className="material-files__copy"
              disabled={selectedCount === 0 || props.interactionPending}
              onClick={() => void copySelection()}
              type="button"
            >
              <CopyIcon />
              <span>Copy</span>
            </button>
          </footer>
        ) : null}
        {/* This local identity is presentation, not an account surface. Only a
            recoverable persistence failure introduces an action. */}
        <footer className="material-files__identity">
          <div
            className="material-files__profile"
            data-state={persistenceFailed ? "error" : undefined}
          >
            <PixelIdenticon />
            <span className="material-files__profile-copy">
              <span className="material-files__profile-name">采石者</span>
              <span aria-live="polite" className="material-files__profile-meta">
                {persistenceFailed
                  ? (props.persistence.status.errorCode === "PERSISTENCE_CONFLICT"
                      ? "有更新的材料 · 重新载入"
                      : storageFull
                        ? "存储已满 · 先导出备份"
                      : "没有保存成功 · 重试")
                  : showSaving ? "正在存到这台设备" : "仅存于这台设备"}
                {showSaving && !persistenceFailed ? (
                  <span
                    aria-hidden="true"
                    className="material-files__status-dot"
                    data-saving="true"
                  />
                ) : null}
              </span>
            </span>
            {persistenceFailed ? (
              <button
                aria-label={props.persistence.status.errorCode === "PERSISTENCE_CONFLICT"
                  ? "Reload newer material"
                  : storageFull
                    ? "Open archive to export material before freeing storage"
                    : "Retry saving material"}
                className="material-files__profile-action"
                onClick={() => {
                  if (props.persistence.status.errorCode === "PERSISTENCE_CONFLICT") {
                    props.persistence.resolveConflict();
                  } else if (storageFull && props.archive !== undefined) {
                    setArchiveError(null);
                    setPreparedImport(null);
                    setMode("archive");
                  } else {
                    props.persistence.retry();
                  }
                }}
                type="button"
              >
                {storageFull && props.archive !== undefined ? <DownloadIcon /> : <SyncIcon />}
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </>
  );
}

/**
 * A GitHub-style identicon: five columns mirrored about the centre, one ink
 * tone, and empty cells left genuinely empty so the tile reads as a mark rather
 * than as a grid.
 */
const IDENTICON_PIXELS = [
  0, 1, 0, 1, 0,
  1, 0, 1, 0, 1,
  0, 0, 1, 0, 0,
  1, 0, 1, 0, 1,
  0, 1, 1, 1, 0,
] as const;

function PixelIdenticon() {
  return (
    <span aria-hidden="true" className="pixel-identicon">
      <span className="pixel-identicon__grid">
        {IDENTICON_PIXELS.map((filled, index) => (
          filled === 1
            ? <span className="pixel-identicon__pixel" key={index} />
            : <span key={index} />
        ))}
      </span>
    </span>
  );
}

function emptyIndexMessage(rootId: string | null, mode: IndexMode, query: string): string {
  if (rootId === null) return "Speak the first thought to begin.";
  if (mode === "search") {
    return query.trim().length === 0 ? "Type to find a thought." : "No material matches.";
  }
  return mode === "select"
    ? "Nothing to select in this material yet."
    : "Nothing branches from this thought yet.";
}

function toggleSetValue(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (!next.delete(value)) next.add(value);
  return next;
}

function renderFileRanges(
  files: readonly MaterialFileRow[],
  ranges: readonly { start: number; end: number }[],
  rowHeight: number,
  render: (value: Readonly<{ file: MaterialFileRow; index: number }>) => ReactNode,
): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      result.push(
        <li
          aria-hidden="true"
          className="material-file__spacer"
          key={`spacer:${cursor}:${range.start}`}
          style={{ height: (range.start - cursor) * rowHeight }}
        />,
      );
    }
    for (let index = range.start; index < range.end; index += 1) {
      const file = files[index];
      if (file !== undefined) result.push(render({ file, index }));
    }
    cursor = range.end;
  }
  if (cursor < files.length) {
    result.push(
      <li
        aria-hidden="true"
        className="material-file__spacer"
        key={`spacer:${cursor}:${files.length}`}
        style={{ height: (files.length - cursor) * rowHeight }}
      />,
    );
  }
  return result;
}

function settleCopyState(
  state: Exclude<CopyState, "idle">,
  resetRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setState: Dispatch<SetStateAction<CopyState>>,
) {
  if (resetRef.current !== null) clearTimeout(resetRef.current);
  setState(state);
  resetRef.current = setTimeout(() => setState("idle"), 1_800);
}

function ArchivePanel({
  busy,
  error,
  inputRef,
  phase,
  preparedImport,
  storageFull,
  onClose,
  onExport,
  onPickImport,
  onReplace,
  onRetrySave,
  onSelectImport,
}: Readonly<{
  busy: boolean;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  phase: ArchivePhase;
  preparedImport: File | null;
  storageFull: boolean;
  onClose: () => void;
  onExport: () => void;
  onPickImport: () => void;
  onReplace: () => void;
  onRetrySave: () => void;
  onSelectImport: (file: File) => void;
}>) {
  const phaseLabel = phase === "exporting"
    ? "Exporting a copy…"
    : phase === "validating"
      ? "Checking archive…"
      : phase === "replacing"
        ? "Replacing material…"
        : null;
  return (
    <section aria-busy={busy || undefined} aria-label="Material archive" className="material-files__archive">
      <p className="material-files__archive-note">
        {storageFull
          ? "Local storage is full. Export a copy before freeing browser storage, then retry saving."
          : "Keep a portable copy, or bring one back into this material."}
      </p>
      <div className="material-files__archive-actions">
        <button disabled={busy} onClick={onExport} type="button">
          Export a copy
        </button>
        <button disabled={busy} onClick={onPickImport} type="button">
          Import a copy
        </button>
      </div>
      {storageFull ? (
        <button
          className="material-files__archive-retry"
          disabled={busy}
          onClick={onRetrySave}
          type="button"
        >
          Retry saving
        </button>
      ) : null}
      <input
        accept=".zip,application/zip,application/x-zip-compressed"
        aria-label="Choose a material archive"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) onSelectImport(file);
        }}
        ref={inputRef}
        type="file"
      />
      {phaseLabel !== null ? (
        <p aria-live="polite" className="material-files__archive-status">{phaseLabel}</p>
      ) : null}
      {error !== null ? (
        <p aria-live="polite" className="material-files__archive-error">{error}</p>
      ) : null}
      {preparedImport !== null ? (
        <div className="material-files__archive-confirm">
          <p>
            Replace current material? This clears undo, focus and selection.
          </p>
          <div>
            <button disabled={busy} onClick={onClose} type="button">Keep current</button>
            <button disabled={busy} onClick={onReplace} type="button">Replace</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function actionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Archive action could not finish.";
}

function stopPointerPropagation(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopWheelPropagation(event: ReactWheelEvent<HTMLElement>) {
  event.stopPropagation();
}
