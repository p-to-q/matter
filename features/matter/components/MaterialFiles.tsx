"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  projectMaterialFiles,
  serializeMaterialSelection,
} from "../material/material-files";
import type { NavigationState } from "../runtime/navigation";
import type { ThoughtTree } from "../tree/model";
import { ChevronIcon, CopyIcon, FileIcon, SearchIcon, SidebarIcon } from "./icons";
import type { PersistenceStatus } from "../persistence/persistence-controller";
import { allocateSnapshotPaths } from "../persistence/snapshot-paths";

export type MaterialFilesProps = Readonly<{
  interactionPending: boolean;
  navigation: NavigationState;
  onFocusNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleFold: (nodeId: string) => void;
  tree: ThoughtTree;
  persistence: Readonly<{
    status: PersistenceStatus;
    retry: () => void;
    resolveConflict: () => void;
  }>;
}>;

type CopyState = "idle" | "copied" | "failed";

export function MaterialFiles(props: MaterialFilesProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredQuery = useDeferredValue(query);
  const files = useMemo(
    () => open ? projectMaterialFiles(props.tree, props.navigation, deferredQuery) : [],
    [deferredQuery, open, props.navigation, props.tree],
  );
  const markdownPathByNodeId = useMemo(
    () => open
      ? new Map(allocateSnapshotPaths(props.tree).map((entry) => [entry.nodeId, entry.path]))
      : new Map<string, string>(),
    [open, props.tree],
  );

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 841px)");
    const applyViewportDefault = () => setOpen(wide.matches);
    applyViewportDefault();
    wide.addEventListener("change", applyViewportDefault);
    return () => wide.removeEventListener("change", applyViewportDefault);
  }, []);

  useEffect(() => () => {
    if (copyResetRef.current !== null) clearTimeout(copyResetRef.current);
  }, []);

  const currentSelectedIds = useMemo(
    () => new Set(Array.from(selectedIds).filter((nodeId) =>
      Object.hasOwn(props.tree.nodes, nodeId),
    )),
    [props.tree.nodes, selectedIds],
  );
  const selectedCount = currentSelectedIds.size;
  const activeNodeId =
    props.navigation.mode === "focus"
      ? props.navigation.focusNodeId
      : props.navigation.selectedNodeId;

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

  return (
    <>
      <button
        aria-controls="material-files"
        aria-expanded={open}
        aria-label={open ? "Hide material files" : "Show material files"}
        className="material-files-toggle"
        data-canvas-interactive
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SidebarIcon />
      </button>
      <aside
        aria-label="Material files"
        aria-hidden={!open}
        className="material-files"
        data-canvas-interactive
        data-open={open || undefined}
        data-persistence-phase={props.persistence.status.phase}
        id="material-files"
        inert={!open}
        onPointerDown={stopPointerPropagation}
        onWheel={stopWheelPropagation}
      >
        <div className="material-files__heading">
          <span className="material-files__eyebrow">Material</span>
          <span aria-label={`${props.tree.revision} committed revisions`} className="material-files__revision">
            r{props.tree.revision}
          </span>
        </div>
        <label className="material-files__search">
          <SearchIcon />
          <span className="visually-hidden">Filter material files</span>
          <input
            aria-label="Filter material files"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Find material…"
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>
        <div className="material-files__body">
          {files.length === 0 ? (
            <p className="material-files__empty">
              {props.tree.rootId === null ? "Speak the first thought to begin." : "No material matches."}
            </p>
          ) : (
            <ul aria-label="Markdown material tree" className="material-files__tree">
              {files.map((file) => {
                const checked = currentSelectedIds.has(file.nodeId);
                const active = activeNodeId === file.nodeId;
                return (
                  <li
                    className="material-file"
                    data-active={active || undefined}
                    data-direct-match={file.directMatch || undefined}
                    key={file.nodeId}
                    data-authored-index={file.authoredIndex}
                    data-created-at={file.createdAt}
                    data-markdown-path={markdownPathByNodeId.get(file.nodeId)}
                    data-updated-at={file.updatedAt}
                    style={{ "--material-file-depth": file.depth } as CSSProperties}
                  >
                    <button
                      aria-label={
                        file.hasChildren
                          ? `${file.folded ? "Expand" : "Collapse"} ${file.title}`
                          : undefined
                      }
                      className="material-file__fold"
                      disabled={!file.hasChildren || props.interactionPending}
                      onClick={() => props.onToggleFold(file.nodeId)}
                      tabIndex={file.hasChildren ? 0 : -1}
                      type="button"
                    >
                      {file.hasChildren ? <ChevronIcon /> : <span aria-hidden="true" />}
                    </button>
                    <label className="material-file__check" title={`Include ${file.title} when copying`}>
                      <input
                        aria-label={`Select ${file.title} for copying`}
                        checked={checked}
                        disabled={props.interactionPending}
                        onChange={() => {
                          setCopyState("idle");
                          setSelectedIds((current) => toggleSetValue(current, file.nodeId));
                        }}
                        type="checkbox"
                      />
                      <span aria-hidden="true" />
                    </label>
                    <button
                      aria-current={active ? "page" : undefined}
                      className="material-file__open"
                      disabled={props.interactionPending}
                      onClick={() => {
                        if (props.navigation.mode === "focus") props.onFocusNode(file.nodeId);
                        else props.onSelectNode(file.nodeId);
                      }}
                      title={file.title}
                      type="button"
                    >
                      <FileIcon />
                      <span className="material-file__title" dir="auto">{file.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="material-files__footer" data-visible={selectedCount > 0 || undefined}>
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
        {props.persistence.status.phase === "saving" ? (
          <span aria-live="polite" className="material-files__persistence">Saving</span>
        ) : props.persistence.status.phase === "error" ? (
          <button
            className="material-files__persistence material-files__persistence--error"
            onClick={props.persistence.status.errorCode === "PERSISTENCE_CONFLICT"
              ? props.persistence.resolveConflict
              : props.persistence.retry}
            type="button"
          >
            {props.persistence.status.errorCode === "PERSISTENCE_CONFLICT"
              ? "Newer material · reload"
              : "Save failed · retry"}
          </button>
        ) : null}
      </aside>
    </>
  );
}

function toggleSetValue(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (!next.delete(value)) next.add(value);
  return next;
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

function stopPointerPropagation(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopWheelPropagation(event: ReactWheelEvent<HTMLElement>) {
  event.stopPropagation();
}
