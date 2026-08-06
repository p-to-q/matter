"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { NavigationState } from "../runtime/navigation";
import { layoutColumnarTree } from "../layout/columnar-layout";
import type { ColumnarLayout, LayoutNode } from "../layout/model";
import type { ThoughtTree } from "../tree/model";
import { projectTools } from "../tools/project-tools";
import { projectToolSurface } from "../tools/project-tool-surface";
import { isCurrentToolIntent } from "../tools/validate-intent";
import type { ToolIntent } from "../tools/model";
import { ToolRail } from "./ToolRail";
import { PaperTexture } from "./PaperTexture";
import {
  INITIAL_CANVAS_VIEWPORT,
  reduceCanvasViewport,
  type CanvasPointerType,
} from "../interaction/canvas-viewport";
import type { AdmissionController } from "../interaction/use-admission";
import type { AdmissionAnchor as InteractionAdmissionAnchor } from "../runtime/admission-interaction";
import { useLasso } from "../interaction/use-lasso";
import { useStretch } from "../interaction/use-stretch";
import type { StretchPreviewSignal } from "../interaction/use-stretch";
import { elasticPreviewGeometry } from "../interaction/elastic-preview";
import { projectLanguageAroundSelection } from "../material/language-projection";
import type { LanguageProjection } from "../material/language-projection";
import { clientDepthToWorld, projectLanguageFlow } from "../interaction/language-flow";
import { MaterialFiles, type MaterialArchiveActions } from "./MaterialFiles";
import { useThoughtLabels } from "../interaction/use-thought-labels";
import { AmbientWorkbench } from "./AmbientWorkbench";
import {
  localizeCanvasGuidance,
  projectCanvasGuidance,
  type CanvasLanguageGuidanceState,
  type CanvasMaterialGuidanceState,
} from "./canvas-guidance";
import type { PersistenceStatus } from "../persistence/persistence-controller";
import {
  createLayoutProjectionInput,
  layoutProjectionKey,
  projectLayoutProjection,
  type LayoutProjectionItem,
  type LayoutNavigation,
} from "./layout-projection";
import { projectCanvasGeometryPublication } from "./canvas-geometry-publication";
import { findAdmissionFeedbackParentBox } from "./admission-feedback-geometry";
import { CanvasChrome } from "./CanvasChrome";
import { useCanvasPreferences } from "./use-canvas-preferences";

export type RootedMaterialProps = {
  admission: AdmissionController;
  admissionAnchor: InteractionAdmissionAnchor | null;
  archive?: MaterialArchiveActions;
  canUndo: boolean;
  documentEpoch: number;
  navigation: NavigationState;
  onExitFocus: () => void;
  onFocusNode: (nodeId: string) => void;
  onInsertChild: (parentNodeId: string) => void;
  onRemoveSelected: () => void;
  onClearSelection: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleFold: (nodeId: string) => void;
  onUndo: () => void;
  tree: ThoughtTree;
  persistence: Readonly<{
    status: PersistenceStatus;
    retry: () => void;
    resolveConflict: () => void;
  }>;
  /** Fixture-only timing marks expose the cold canvas path without changing it. */
  performanceMarking?: boolean;
};

type PublishedGeometry = {
  key: string;
  layout: ColumnarLayout;
};

type PresentationDamage = Readonly<{
  nodeId: string;
  topExtent: number;
  bottomExtent: number;
}>;

type ProjectionHandleReceipt = Readonly<{
  centerX: number;
  selectedTopClient: number;
  afterTopClient: number;
  selectedTopWorld: number;
  afterTopWorld: number;
}>;

export function RootedMaterial(props: RootedMaterialProps) {
  const { canUndo, navigation, onRemoveSelected, onUndo, tree } = props;
  const canvasPreferences = useCanvasPreferences();
  const interactionPending = props.admission.state.phase !== "idle" && props.admission.state.phase !== "error";
  const shellRef = useRef<HTMLElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutEpochRef = useRef(0);
  const measuredHeightCacheRef = useRef(new Map<string, Readonly<{
    columnWidth: number;
    height: number;
    root: boolean;
    text: string;
  }>>());
  const initialPerformanceMarksRef = useRef({
    canvasCommitted: false,
    heightReadStarted: false,
    heightReadComplete: false,
    pureLayoutStarted: false,
    pureLayoutComplete: false,
    geometryPublished: false,
    published: false,
  });
  const measurementRetryRef = useRef<{
    key: string | null;
    attempts: number;
    frame: number | null;
  }>({ key: null, attempts: 0, frame: null });
  const [measureRevision, requestMeasurement] = useReducer((value) => value + 1, 0);
  const [published, setPublished] = useState<PublishedGeometry | null>(null);
  const [presentationDamage, setPresentationDamage] = useState<PresentationDamage | null>(null);
  const presentationDamageRef = useRef<PresentationDamage | null>(null);
  const [viewport, setViewport] = useState(INITIAL_CANVAS_VIEWPORT);
  const suppressClickRef = useRef(false);
  const pointerOriginNodeRef = useRef<string | null>(null);
  const markPerformance = useCallback((name: string) => {
    if (!props.performanceMarking || typeof window === "undefined") return;
    window.performance.mark(name);
  }, [props.performanceMarking]);
  const layoutNavigation = useMemo<LayoutNavigation>(
    () => navigation.mode === "focus"
      ? {
          mode: "focus",
          focusNodeId: navigation.focusNodeId,
          foldedNodeIds: navigation.foldedNodeIds,
        }
      : {
          mode: "full",
          focusNodeId: null,
          foldedNodeIds: navigation.foldedNodeIds,
        },
    [navigation.foldedNodeIds, navigation.focusNodeId, navigation.mode],
  );
  const layoutInput = useMemo(
    () => createLayoutProjectionInput(tree, layoutNavigation),
    [layoutNavigation, tree],
  );
  const projection = useMemo(
    () => projectLayoutProjection(layoutInput),
    [layoutInput],
  );
  const projectionKey = useMemo(
    () => layoutProjectionKey(layoutInput, projection),
    [layoutInput, projection],
  );
  const activeLayout = published?.key === projectionKey ? published.layout : null;
  const stretchInvalidationRef = useRef<() => void>(() => undefined);
  const invalidateStretchGeometry = useCallback(() => {
    stretchInvalidationRef.current();
  }, []);
  const labels = useThoughtLabels({
    tree,
    documentEpoch: props.documentEpoch,
    enabled: props.performanceMarking !== true,
  });
  const labelByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.label);
    return values;
  }, [labels.session]);
  const labelOriginByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.origin);
    return values;
  }, [labels.session]);
  const lasso = useLasso({
    tree,
    documentEpoch: props.documentEpoch,
    canvasRef,
    epoch: {
      treeRevision: tree.revision,
      layoutEpoch: activeLayout?.layoutEpoch ?? 0,
      viewportX: viewport.x,
      viewportY: viewport.y,
      viewportZoom: viewport.zoom,
    },
    navigationKey: `${navigation.mode}:${navigation.focusNodeId ?? ""}:${navigation.selectedNodeId ?? ""}:${Array.from(navigation.foldedNodeIds).sort().join(",")}`,
    onGeometryInvalidated: invalidateStretchGeometry,
  });
  useEffect(() => {
    const removeSelected = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        interactionPending ||
        lasso.active ||
        lasso.drawing ||
        navigation.mode !== "full" ||
        navigation.selectedNodeId === null ||
        navigation.selectedNodeId === tree.rootId ||
        isEditableEventTarget(event.target) ||
        hasNativeTextSelection()
      ) return;
      event.preventDefault();
      onRemoveSelected();
    };
    window.addEventListener("keydown", removeSelected);
    return () => window.removeEventListener("keydown", removeSelected);
  }, [interactionPending, lasso.active, lasso.drawing, navigation.mode, navigation.selectedNodeId, onRemoveSelected, tree.rootId]);
  useEffect(() => {
    const undoFromKeyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        (!event.metaKey && !event.ctrlKey) ||
        event.key.toLowerCase() !== "z" ||
        !canUndo ||
        interactionPending ||
        isEditableEventTarget(event.target) ||
        hasNativeTextSelection()
      ) return;
      event.preventDefault();
      onUndo();
    };
    window.addEventListener("keydown", undoFromKeyboard);
    return () => window.removeEventListener("keydown", undoFromKeyboard);
  }, [canUndo, interactionPending, onUndo]);
  const elasticRef = useRef<HTMLDivElement>(null);
  const splitProjectionRef = useRef<HTMLDivElement>(null);
  const projectionHandleReceiptRef = useRef<ProjectionHandleReceipt | null>(null);
  const updateElasticPreview = useCallback((signal: StretchPreviewSignal) => {
    const element = elasticRef.current;
    const split = splitProjectionRef.current;
    const preview = elasticPreviewGeometry(
      lasso.selectionRects,
      signal.amount,
      clientViewport(),
      lasso.selectionColumn ?? undefined,
      signal.handle,
      signal.handle,
    );
    if (element === null) return;
    if (preview === null) {
      element.removeAttribute("data-preview-mode");
      split?.removeAttribute("data-preview-mode");
      return;
    }
    element.dataset.previewMode = preview.mode;
    element.dataset.stretchHandle = signal.handle ?? "bottom";
    if (split !== null) {
      split.dataset.previewMode = preview.mode;
      split.dataset.stretchHandle = signal.handle ?? "bottom";
      const worldDepth = clientDepthToWorld(preview.pocketDepth, viewport.zoom);
      split.style.setProperty("--split-depth", `${worldDepth ?? 0}px`);
      split.style.setProperty("--elastic-opacity", String(preview.opacity));
    }
    const receipt = preview.mode === "expand" ? projectionHandleReceiptRef.current : null;
    const rawTopY = receipt?.selectedTopClient ?? preview.topCue.y;
    const rawBottomY = receipt === null
      ? preview.bottomHandle.y
      : receipt.afterTopClient + preview.pocketDepth;
    const visible = clientViewport();
    const topY = clampClient(rawTopY, visible?.top, visible?.bottom, 44);
    const bottomY = clampClient(rawBottomY, visible?.top, visible?.bottom, 44);
    const rawTopCenter = receipt?.centerX ?? (preview.topHandle.x1 + preview.topHandle.x2) / 2;
    const rawBottomCenter = receipt?.centerX ?? (preview.bottomHandle.x1 + preview.bottomHandle.x2) / 2;
    const topCenter = clampClient(rawTopCenter, visible?.left, visible?.right, 26);
    const bottomCenter = clampClient(rawBottomCenter, visible?.left, visible?.right, 26);
    element.style.setProperty("--elastic-anchor-top", `${topY}px`);
    element.style.setProperty("--elastic-handle-top", `${bottomY}px`);
    element.style.setProperty("--elastic-top-center", `${topCenter}px`);
    element.style.setProperty("--elastic-bottom-center", `${bottomCenter}px`);
    element.style.setProperty("--pocket-left", `${preview.pocket.left}px`);
    element.style.setProperty("--pocket-top", `${rawTopY}px`);
    element.style.setProperty("--pocket-width", `${preview.pocket.right - preview.pocket.left}px`);
    element.style.setProperty("--pocket-height", `${Math.max(0, rawBottomY - rawTopY)}px`);
    element.style.setProperty("--elastic-opacity", String(preview.opacity));
  }, [lasso.selectionColumn, lasso.selectionRects, viewport.zoom]);
  const navigationKey = `${navigation.mode}:${navigation.focusNodeId ?? ""}:${navigation.selectedNodeId ?? ""}:${Array.from(navigation.foldedNodeIds).sort().join(",")}`;
  const stretch = useStretch({
    selection: lasso.selection,
    treeId: tree.id,
    revision: tree.revision,
    documentEpoch: props.documentEpoch,
    navigationKey,
    layoutKey: `${activeLayout?.layoutEpoch ?? 0}:${viewport.x}:${viewport.y}:${viewport.zoom}`,
    onPreview: updateElasticPreview,
  });
  useLayoutEffect(() => {
    stretchInvalidationRef.current = stretch.layoutInvalidated;
  }, [stretch.layoutInvalidated]);
  useLayoutEffect(() => {
    const projectionElement = splitProjectionRef.current;
    const owner = projectionElement?.closest<HTMLElement>(".spatial-thought");
    // Hot pointer movement owns visual transforms only. Publishing a layout
    // receipt while dragging would invalidate and cancel that same gesture.
    if (stretch.dragging || projectionElement == null || owner == null) return;
    let nextDamage: PresentationDamage | null = null;
    if (stretch.amount === 0) {
      nextDamage = null;
    } else {
      const source = owner.querySelector<HTMLElement>(".spatial-thought__text");
      const slot = projectionElement.querySelector<HTMLElement>(".language-split-slot");
      const receipt = projectionHandleReceiptRef.current;
      if (source === null || slot === null || receipt === null) return;
      const slotDepth = slot.offsetHeight;
      const projectedAfter = projectionElement.querySelector<HTMLElement>(".language-split-block--after");
      const flow = projectLanguageFlow({
        sourceHeight: source.offsetHeight,
        selectedTop: receipt.selectedTopWorld,
        afterNaturalTop: receipt.afterTopWorld,
        afterHeight: projectedAfter?.offsetHeight ?? 0,
        slotDepth,
        handle: stretch.lastHandle ?? "bottom",
      });
      if (flow === null) return;
      nextDamage = Object.freeze({
        nodeId: lasso.selection?.nodeId ?? "",
        topExtent: flow.topExtent,
        bottomExtent: flow.bottomExtent,
      });
    }
    const frame = requestAnimationFrame(() => {
      if (samePresentationDamage(presentationDamageRef.current, nextDamage)) return;
      presentationDamageRef.current = nextDamage;
      setPresentationDamage(nextDamage);
      requestMeasurement();
    });
    return () => cancelAnimationFrame(frame);
  }, [lasso.selection?.nodeId, stretch.amount, stretch.dragging, stretch.lastHandle]);
  useLayoutEffect(() => {
    const projectionElement = splitProjectionRef.current;
    const selected = projectionElement?.querySelector<HTMLElement>(".language-split-block--selected");
    const source = projectionElement?.querySelector<HTMLElement>(".language-split-source");
    const afterGhost = projectionElement?.querySelector<HTMLElement>(".language-split-after-ghost");
    const projectedAfter = projectionElement?.querySelector<HTMLElement>(".language-split-block--after");
    if (projectionElement == null || selected == null || source == null) {
      projectionHandleReceiptRef.current = null;
      return;
    }
    const projectionRect = projectionElement.getBoundingClientRect();
    const selectedRange = rangeAroundContents(selected);
    const afterRange = afterGhost == null ? null : rangeAroundContents(afterGhost);
    const projectedAfterRange = projectedAfter == null ? null : rangeAroundContents(projectedAfter);
    const sourceRect = source.getBoundingClientRect();
    const selectedTopClient = selectedRange?.top ?? sourceRect.top;
    const afterTopClient = afterRange?.top ?? sourceRect.bottom;
    const selectedTop = clientDepthToWorld(
      Math.max(0, selectedTopClient - projectionRect.top),
      viewport.zoom,
    ) ?? 0;
    const afterTop = clientDepthToWorld(
      Math.max(0, afterTopClient - projectionRect.top),
      viewport.zoom,
    ) ?? 0;
    const projectedAfterTopClient = projectedAfter?.getBoundingClientRect().top ?? 0;
    const afterLeading = projectedAfterRange == null
      ? 0
      : projectedAfterRange.top - projectedAfterTopClient;
    projectionElement.style.setProperty("--split-selected-top", `${selectedTop}px`);
    const afterTopWorld = clientDepthToWorld(
      Math.max(0, afterTopClient - projectionRect.top - afterLeading),
      viewport.zoom,
    ) ?? 0;
    projectionElement.style.setProperty("--split-after-top", `${afterTopWorld}px`);
    projectionHandleReceiptRef.current = Object.freeze({
      centerX: projectionRect.left + projectionRect.width / 2,
      selectedTopClient,
      afterTopClient,
      selectedTopWorld: selectedTop,
      afterTopWorld: afterTop,
    });
    updateElasticPreview({
      amount: stretch.amount,
      handle: stretch.activeHandle ?? stretch.lastHandle,
      dragging: stretch.dragging,
    });
  }, [activeLayout?.layoutEpoch, lasso.selection, stretch.activeHandle, stretch.amount, stretch.dragging, stretch.lastHandle, updateElasticPreview, viewport.x, viewport.y, viewport.zoom]);
  const selectedNode =
    navigation.selectedNodeId === null ? null : tree.nodes[navigation.selectedNodeId] ?? null;
  const tools = useMemo(
    () =>
      projectTools({
        view: navigation.mode,
        selected:
          selectedNode === null
            ? null
            : {
                nodeId: selectedNode.id,
                hasChildren: selectedNode.children.length > 0,
                isFolded: navigation.foldedNodeIds.has(selectedNode.id),
              },
        canUndo,
        interaction: interactionPending ? "pending" : "idle",
      }),
    [canUndo, interactionPending, navigation.foldedNodeIds, navigation.mode, selectedNode],
  );
  const toolSurface = useMemo(() => projectToolSurface(tools), [tools]);
  const materialGuidance: CanvasMaterialGuidanceState = tree.rootId === null
    ? { kind: "empty" }
    : navigation.mode === "focus"
      ? { kind: "focus" }
      : {
          kind: "full",
          selected: selectedNode === null
            ? null
            : { folded: navigation.foldedNodeIds.has(selectedNode.id) },
        };
  const selectedLanguageIsCurrent = lasso.selection !== null &&
    lasso.sourceText === tree.nodes[lasso.selection.nodeId]?.text &&
    projection.some(({ node }) => node.id === lasso.selection?.nodeId);
  let languageGuidance: CanvasLanguageGuidanceState;
  if (lasso.drawing) {
    languageGuidance = { kind: "lasso-drawing" };
  } else if (selectedLanguageIsCurrent) {
    languageGuidance = {
      kind: "selected",
      stretch: stretch.dragging
        ? { kind: "dragging", amount: stretch.amount }
        : stretch.amount > 0
          ? { kind: "committed", amount: stretch.amount }
          : { kind: "armed", amount: 0 },
    };
  } else if (lasso.active) {
    languageGuidance = { kind: "lasso-ready" };
  } else {
    languageGuidance = { kind: "none" };
  }
  const guidance = localizeCanvasGuidance(
    projectCanvasGuidance({
      admission: props.admission.state,
      language: languageGuidance,
      material: materialGuidance,
    }),
    canvasPreferences.preferences.language,
  );

  useEffect(() => {
    let mounted = true;
    const remeasure = () => {
      measuredHeightCacheRef.current.clear();
      requestMeasurement();
    };
    window.addEventListener("resize", remeasure);
    void document.fonts?.ready.then(() => {
      if (mounted) remeasure();
    });
    return () => {
      mounted = false;
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || projection.length === 0) {
      setPublished(null);
      return;
    }
    // A new material projection is not ready until the current geometry has
    // reached the DOM. This stays imperative because React has already
    // committed these 2,000 material nodes once for measurement.
    canvas.removeAttribute("data-layout-ready");

    if (!initialPerformanceMarksRef.current.canvasCommitted) {
      initialPerformanceMarksRef.current.canvasCommitted = true;
      markPerformance("matter:performance:initial-canvas-committed");
    }

    const style = getComputedStyle(canvas);
    const columnWidth = readCssPixels(style, "--matter-column-width", 300);
    const columnGap = readCssPixels(style, "--matter-column-gap", 72);
    const siblingGap = readCssPixels(style, "--matter-sibling-gap", 28);
    const elements = new Map(
      Array.from(canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]")).map(
        (element) => [element.dataset.layoutNodeId ?? "", element],
      ),
    );
    const nodes: LayoutNode[] = [];
    if (!initialPerformanceMarksRef.current.heightReadStarted) {
      initialPerformanceMarksRef.current.heightReadStarted = true;
      markPerformance("matter:performance:height-read-start");
    }
    for (const item of projection) {
      const element = elements.get(item.node.id);
      const root = item.node.id === tree.rootId;
      const cachedHeight = measuredHeightCacheRef.current.get(item.node.id);
      const heightCacheHit = cachedHeight !== undefined &&
        cachedHeight.columnWidth === columnWidth &&
        cachedHeight.root === root &&
        cachedHeight.text === item.node.text;
      // Viewport transforms must never leak camera scale into world geometry.
      // `offsetHeight` is the untransformed CSS box height; bounding rects are
      // screen-space and would apply zoom once here and again on publication.
      const height = heightCacheHit ? cachedHeight.height : element?.offsetHeight ?? 0;
      if (!Number.isFinite(height) || height <= 0) {
        // A cold page can reach layout before type metrics settle. Retry a
        // bounded pair of frames; an unbounded zero-height loop would compete
        // with real browser resize/font invalidation forever.
        const retry = measurementRetryRef.current;
        if (retry.key !== projectionKey) {
          if (retry.frame !== null) cancelAnimationFrame(retry.frame);
          retry.key = projectionKey;
          retry.attempts = 0;
          retry.frame = null;
        }
        if (retry.attempts < 2 && retry.frame === null) {
          retry.attempts += 1;
          retry.frame = requestAnimationFrame(() => {
            retry.frame = requestAnimationFrame(() => {
              retry.frame = null;
              requestMeasurement();
            });
          });
        }
        return;
      }
      if (!heightCacheHit) {
        measuredHeightCacheRef.current.set(item.node.id, Object.freeze({
          columnWidth,
          height,
          root,
          text: item.node.text,
        }));
      }
      nodes.push({
        id: item.node.id,
        parentId: item.parentId,
        depth: item.depth,
        size: { width: columnWidth, height },
        presentation: presentationDamage?.nodeId === item.node.id
          ? {
              topExtent: presentationDamage.topExtent,
              bottomExtent: presentationDamage.bottomExtent,
            }
          : undefined,
      });
    }
    if (!initialPerformanceMarksRef.current.heightReadComplete) {
      initialPerformanceMarksRef.current.heightReadComplete = true;
      markPerformance("matter:performance:height-read-complete");
    }

    if (!initialPerformanceMarksRef.current.pureLayoutStarted) {
      initialPerformanceMarksRef.current.pureLayoutStarted = true;
      markPerformance("matter:performance:pure-layout-start");
    }
    const result = layoutColumnarTree({
      nodes,
      origin: { x: 0, y: 0 },
      layoutEpoch: layoutEpochRef.current + 1,
      columnWidth,
      columnGap,
      siblingGap,
    });
    if (!initialPerformanceMarksRef.current.pureLayoutComplete) {
      initialPerformanceMarksRef.current.pureLayoutComplete = true;
      markPerformance("matter:performance:pure-layout-complete");
    }
    if (!result.ok) return;
    const retry = measurementRetryRef.current;
    if (retry.frame !== null) cancelAnimationFrame(retry.frame);
    retry.key = projectionKey;
    retry.attempts = 0;
    retry.frame = null;
    if (!publishCanvasGeometry(canvas, elements, result.layout)) return;
    layoutEpochRef.current = result.layout.layoutEpoch;
    if (!initialPerformanceMarksRef.current.geometryPublished) {
      initialPerformanceMarksRef.current.geometryPublished = true;
      markPerformance("matter:performance:geometry-dom-published");
    }
    setPublished({ key: projectionKey, layout: result.layout });
  }, [markPerformance, measureRevision, presentationDamage, projection, projectionKey, tree.rootId]);

  useLayoutEffect(() => {
    if (activeLayout === null) return;
    canvasRef.current?.setAttribute("data-layout-ready", "true");
    if (!props.performanceMarking || initialPerformanceMarksRef.current.published) return;
    initialPerformanceMarksRef.current.published = true;
    markPerformance("matter:performance:published-canvas-commit");
  }, [activeLayout, markPerformance, props.performanceMarking]);

  useEffect(() => () => {
    const retry = measurementRetryRef.current;
    if (retry.frame !== null) cancelAnimationFrame(retry.frame);
  }, []);

  const admissionAnchor = props.admission.state.phase === "idle" ? null : props.admission.state.anchor;
  const admissionParentBox = useMemo(
    () => findAdmissionFeedbackParentBox(admissionAnchor, activeLayout?.boxes ?? null),
    [activeLayout?.boxes, admissionAnchor],
  );
  const worldStyle = {
    transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
  } as CSSProperties;

  const updateViewport = (event: Parameters<typeof reduceCanvasViewport>[1]) => {
    setViewport((current) => {
      const result = reduceCanvasViewport(current, event);
      return result.ok ? result.state : current;
    });
  };

  useEffect(() => {
    const shell = shellRef.current;
    if (shell === null) return;
    const handleWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("[data-canvas-interactive]")) return;
      if (lasso.active) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      setViewport((current) => {
        const result = reduceCanvasViewport(current, {
          type: "wheel",
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: normalizeDeltaMode(event.deltaMode),
          ctrlKey: event.ctrlKey || event.metaKey,
        });
        return result.ok ? result.state : current;
      });
    };
    // React delegates wheel passively in current browsers. Matter owns the
    // field gesture, so this boundary must be explicitly non-passive.
    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleWheel);
  }, [lasso.active]);

  return (
    <main
      className="matter-shell"
      data-dragging={viewport.gesture?.dragging || undefined}
      data-interaction-pending={interactionPending || undefined}
      data-lasso-mode={lasso.active || undefined}
      data-stretching={stretch.dragging || undefined}
      data-tree-revision={tree.revision}
      data-view={navigation.mode}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-zoom={viewport.zoom}
      ref={shellRef}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive]")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onLostPointerCapture={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) return;
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "lost-pointer-capture", pointerId: event.pointerId });
      }}
      onPointerCancel={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) return;
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
      }}
      onPointerDown={(event) => {
        if (interactionPending) return;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive], a")) return;
        if (lasso.pointerDown(event)) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A detached capture target cannot own a trustworthy lasso stroke.
            lasso.pointerCancel(event.pointerId);
          }
          return;
        }
        if (!event.isPrimary || (event.pointerType !== "touch" && event.button !== 0)) return;
        pointerOriginNodeRef.current =
          (event.target as HTMLElement).closest<HTMLElement>("[data-thought-id]")?.dataset
            .thoughtId ?? null;
        updateViewport({ type: "pointer-down", pointerId: event.pointerId, pointerType: normalizePointerType(event.pointerType), isPrimary: event.isPrimary, button: event.button, clientX: event.clientX, clientY: event.clientY });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A detached capture target cannot own a trustworthy pan gesture;
          // drop the half-started drag so moves can never arrive for it.
          pointerOriginNodeRef.current = null;
          updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
        }
      }}
      onPointerMove={(event) => {
        if (interactionPending) return;
        if (lasso.pointerMove(event)) return;
        if (viewport.gesture?.pointerId !== event.pointerId) return;
        updateViewport({ type: "pointer-move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      }}
      onPointerUp={(event) => {
        if (interactionPending) {
          lasso.pointerCancel(event.pointerId);
          pointerOriginNodeRef.current = null;
          updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        if (lasso.pointerUp(event)) {
          suppressClickRef.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        if (viewport.gesture?.pointerId !== event.pointerId) return;
        const dragged =
          viewport.gesture.dragging ||
          Math.hypot(
            event.clientX - viewport.gesture.startX,
            event.clientY - viewport.gesture.startY,
          ) >= (event.pointerType === "touch" ? 8 : 4);
        const originNodeId = pointerOriginNodeRef.current;
        pointerOriginNodeRef.current = null;
        // Pointer capture keeps dragging reliable over text, but retargets the
        // browser click. Resolve a sub-threshold gesture here as node selection.
        if (!dragged) {
          if (originNodeId !== null && tree.nodes[originNodeId] !== undefined) {
            props.onSelectNode(originNodeId);
          } else {
            props.onClearSelection();
          }
        }
        suppressClickRef.current = true;
        updateViewport({ type: "pointer-up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <PaperTexture />
      <header className="matter-header" data-canvas-interactive>
        <a className="matter-brand" href="https://www.ptoq.io/" aria-label="p to q home">
          [p → q]
        </a>
        <span aria-hidden="true" className="matter-brand__divider" />
        <span>matter</span>
      </header>
      <MaterialFiles
        archive={props.archive}
        documentEpoch={props.documentEpoch}
        interactionPending={interactionPending || lasso.active}
        labels={labelByNodeId}
        labelOrigins={labelOriginByNodeId}
        navigation={navigation}
        onFocusNode={props.onFocusNode}
        onRenameNode={labels.rename}
        onResetNodeName={labels.resetName}
        onSelectNode={props.onSelectNode}
        onVisibleNodes={labels.observe}
        persistence={props.persistence}
        tree={tree}
      />
      <ToolRail
        interactionPending={interactionPending}
        lassoActive={lasso.active}
        lassoAvailable={tree.rootId !== null && (lasso.active || activeLayout !== null)}
        onLasso={() => {
          if (lasso.active) {
            lasso.deactivate();
            return;
          }
          if (activeLayout !== null) lasso.activate();
        }}
        onMove={() => lasso.deactivate()}
        onIntent={(intent) => dispatchToolIntent(intent, props)}
        onVoice={() => {
          if (props.admissionAnchor !== null) props.admission.start(props.admissionAnchor);
        }}
        surface={toolSurface}
        voiceActive={props.admission.state.phase === "recording"}
        voiceAvailable={props.admissionAnchor !== null}
        voiceLabel={
          props.admissionAnchor?.kind === "root"
            ? "Record a root thought"
            : props.admissionAnchor?.kind === "child"
              ? "Record a top-level thought"
              : navigation.mode === "focus"
                ? "Voice admission unavailable in focus view"
                : "Voice admission unavailable outside the full material view"
        }
      />
      <section
        aria-label="Thought material"
        className="matter-document"
        data-canvas-theme={canvasPreferences.resolvedAppearance}
        data-canvas-theme-preference={canvasPreferences.preferences.appearance}
        data-leaf-fx={canvasPreferences.preferences.leafFx ? "on" : "off"}
        ref={documentRef}
      >
        <AmbientWorkbench enabled={canvasPreferences.preferences.leafFx} />
        {projection.length === 0 ? (
          <p className="matter-document__empty">
            {navigation.mode === "focus" ? "This focus is no longer available." : "No material yet."}
          </p>
        ) : (
          <div className="matter-world" style={worldStyle}>
          <div
            className="matter-canvas"
            ref={canvasRef}
          >
            <CanvasThoughtList
              interactionPending={interactionPending}
              lassoSelection={lasso.selection}
              lassoSourceText={lasso.sourceText}
              navigation={navigation}
              onSelectNode={props.onSelectNode}
              projection={projection}
              splitProjectionRef={splitProjectionRef}
            />
            <AdmissionFeedback
              anchor={admissionAnchor}
              parentBox={admissionParentBox}
              controller={props.admission}
            />
          </div>
          </div>
        )}
        <footer
          aria-label="Matter guidance"
          className="matter-guidance"
          data-canvas-interactive
          data-guidance-kind={guidance.kind}
          data-guidance-state={guidance.id}
          key={guidance.id}
        >
          <p className="matter-guidance__next">{guidance.text}</p>
        </footer>
        <CanvasChrome {...canvasPreferences} />
      </section>
      <LassoOverlay
        active={lasso.active}
        drawing={lasso.drawing}
        closurePathRef={lasso.closurePathRef}
        inkPathRef={lasso.inkPathRef}
        rects={lasso.selectionRects}
        selectedText={lasso.selection?.selectedText ?? null}
        elasticRef={elasticRef}
        textColumn={lasso.selectionColumn}
        stretch={stretch}
      />
    </main>
  );
}

/**
 * The material list deliberately has no geometry prop. A layout publication
 * can update its DOM positions without asking React to reconcile every
 * measured passage for a second time; material and interaction props still
 * retain their normal declarative ownership.
 */
const CanvasThoughtList = memo(function CanvasThoughtList({
  interactionPending,
  lassoSelection,
  lassoSourceText,
  navigation,
  onSelectNode,
  projection,
  splitProjectionRef,
}: {
  interactionPending: boolean;
  lassoSelection: ReturnType<typeof useLasso>["selection"];
  lassoSourceText: string | null;
  navigation: NavigationState;
  onSelectNode: (nodeId: string) => void;
  projection: readonly LayoutProjectionItem[];
  splitProjectionRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ol className="spatial-thoughts">
      {projection.map(({ node }) => {
        const isSelected = node.id === navigation.selectedNodeId;
        const isFocused = navigation.mode === "focus" && node.id === navigation.focusNodeId;
        const isProjected = lassoSelection?.nodeId === node.id && lassoSourceText === node.text;
        const languageProjection = isProjected && lassoSelection !== null
          ? projectLanguageAroundSelection(node.text, lassoSelection)
          : null;
        return (
          <li
            className="spatial-thought"
            data-focused={isFocused || undefined}
            data-layout-node-id={node.id}
            data-selected={isSelected || undefined}
            data-thought-id={node.id}
            key={node.id}
          >
            <button
              aria-pressed={isSelected}
              className="spatial-thought__text"
              data-thought-text-id={node.id}
              data-visual-projection={isProjected || undefined}
              onClick={() => {
                if (!interactionPending) onSelectNode(node.id);
              }}
              type="button"
            >
              {isSelected ? <span className="spatial-thought__label">{node.text}</span> : node.text}
            </button>
            {languageProjection?.ok ? (
              <LanguageSplitProjection
                projection={languageProjection.projection}
                projectionRef={splitProjectionRef}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
});

function publishCanvasGeometry(
  canvas: HTMLDivElement,
  elements: ReadonlyMap<string, HTMLElement>,
  layout: ColumnarLayout,
): boolean {
  const publication = projectCanvasGeometryPublication(layout);
  const targets: Array<{ element: HTMLElement; transform: string }> = [];
  // Do not mark a partial DOM as geometrically valid. This cannot happen for
  // one synchronous React commit, but the guard makes a future render-edge
  // refactor fail closed rather than offer stale pointer geometry.
  for (const node of publication.nodes) {
    const element = elements.get(node.nodeId);
    if (element === undefined) return false;
    targets.push({ element, transform: node.transform });
  }

  canvas.style.setProperty("--matter-canvas-width", `${publication.width}px`);
  canvas.style.setProperty("--matter-canvas-height", `${publication.height}px`);
  for (const target of targets) {
    target.element.style.transform = target.transform;
  }
  return true;
}

function LassoOverlay({
  active,
  drawing,
  closurePathRef,
  inkPathRef,
  rects,
  selectedText,
  elasticRef,
  textColumn,
  stretch,
}: {
  active: boolean;
  drawing: boolean;
  closurePathRef: React.RefObject<SVGPathElement | null>;
  inkPathRef: React.RefObject<SVGPathElement | null>;
  rects: readonly { x: number; y: number; width: number; height: number }[];
  selectedText: string | null;
  elasticRef: React.RefObject<HTMLDivElement | null>;
  textColumn: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  stretch: ReturnType<typeof useStretch>;
}) {
  const bounds = selectionBounds(rects);
  const preview = elasticPreviewGeometry(
    rects,
    stretch.amount,
    clientViewport(),
    textColumn ?? undefined,
    stretch.activeHandle,
    stretch.lastHandle,
  );
  return (
    <div
      className="lasso-layer"
      data-active={active || undefined}
      data-drawing={drawing || undefined}
      data-selected={selectedText !== null || undefined}
    >
      {selectedText === null ? null : (
        <span className="visually-hidden" role="status">
          {`Selected language: ${selectedText}`}
        </span>
      )}
      {rects.map((rect, index) => (
        <span
          aria-hidden="true"
          className="lasso-selection-fragment"
          key={`${rect.x}:${rect.y}:${index}`}
          data-first-fragment={index === 0 || undefined}
          data-last-fragment={index === rects.length - 1 || undefined}
          style={{ left: rect.x - 3, top: rect.y - 3, width: rect.width + 6, height: rect.height + 6 }}
        />
      ))}
      {bounds === null ? null : (
        <>
          <div
            className="elastic-preview"
            data-preview-mode={stretch.amount === 0 ? "neutral" : "expand"}
            data-stretch-handle={stretch.activeHandle ?? stretch.lastHandle ?? "bottom"}
            ref={elasticRef}
            style={{
              "--elastic-anchor-top": `${preview?.topHandle.y ?? bounds.top}px`,
              "--elastic-handle-top": `${preview?.bottomHandle.y ?? bounds.bottom}px`,
              "--elastic-top-center": `${((preview?.topHandle.x1 ?? bounds.left) + (preview?.topHandle.x2 ?? bounds.right)) / 2}px`,
              "--elastic-bottom-center": `${((preview?.bottomHandle.x1 ?? bounds.left) + (preview?.bottomHandle.x2 ?? bounds.right)) / 2}px`,
              "--pocket-left": `${preview?.pocket.left ?? bounds.left}px`,
              "--pocket-top": `${preview?.pocket.top ?? bounds.bottom}px`,
              "--pocket-width": `${(preview?.pocket.right ?? bounds.right) - (preview?.pocket.left ?? bounds.left)}px`,
              "--pocket-height": `${preview === null ? 0 : preview.pocket.bottom - preview.pocket.top}px`,
              "--elastic-opacity": String(preview?.opacity ?? .08),
            } as CSSProperties}
          >
            <span aria-hidden="true" className="language-pocket" />
            <StretchHandleButton handle="top" stretch={stretch} />
            <StretchHandleButton handle="bottom" stretch={stretch} />
          </div>
        </>
      )}
      <svg aria-hidden="true" className="lasso-ink">
        <path className="lasso-ink__trace" ref={inkPathRef} />
        <path className="lasso-ink__closure" ref={closurePathRef} />
      </svg>
    </div>
  );
}

function LanguageSplitProjection({
  projection,
  projectionRef,
}: {
  projection: LanguageProjection;
  projectionRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-hidden="true"
      className="language-split-projection"
      data-preview-mode="neutral"
      data-stretch-handle="bottom"
      inert
      ref={projectionRef}
    >
      <span className="language-split-focus">
        <span className="language-split-source" dir="auto">
          <span className="language-split-before-copy language-split-block--before">{projection.before}</span>
          <span className="language-split-selected-copy language-split-block--selected">{projection.selected}</span>
          <span className="language-split-seam">{projection.outerSeam}</span>
          <span className="language-split-after-ghost">{projection.after}</span>
        </span>
        <span className="language-split-slot" />
      </span>
      {projection.hasAfter ? (
        <span className="language-split-block language-split-block--after" dir="auto">
          {projection.after}
        </span>
      ) : null}
    </div>
  );
}

function StretchHandleButton({
  handle,
  stretch,
}: {
  handle: "top" | "bottom";
  stretch: ReturnType<typeof useStretch>;
}) {
  return (
    <button
      aria-label={`Expand selected language from its ${handle} edge`}
      aria-orientation="vertical"
      aria-valuemax={1}
      aria-valuemin={0}
      aria-valuenow={Number(stretch.amount.toFixed(3))}
      aria-valuetext={stretchValueText(stretch.amount)}
      className={`stretch-handle stretch-handle--${handle}`}
      data-canvas-interactive
      onPointerCancel={(event) => {
        event.stopPropagation();
        stretch.pointerCancel(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        event.stopPropagation();
        stretch.pointerCancel(event.pointerId);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (stretch.pointerDown(handle, event)) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A detached target cannot retain pointer authority. Restore the
            // prior settled degree immediately instead of stranding drag mode.
            stretch.pointerCancel(event.pointerId);
          }
        }
      }}
      onPointerMove={(event) => stretch.pointerMove(event)}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (!stretch.pointerUp(event)) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onKeyDown={(event) => {
        const next = keyboardStretchAmount(event.key, stretch.amount, handle);
        if (next === null) return;
        event.preventDefault();
        stretch.setAmount(next, handle);
      }}
      role="slider"
      type="button"
    />
  );
}

function keyboardStretchAmount(
  key: string,
  amount: number,
  handle: "top" | "bottom",
): number | null {
  const step = 0.1;
  const increases = handle === "top" ? key === "ArrowUp" : key === "ArrowDown";
  const decreases = handle === "top" ? key === "ArrowDown" : key === "ArrowUp";
  if (increases || key === "ArrowRight") return Math.min(1, amount + step);
  if (decreases || key === "ArrowLeft") return Math.max(0, amount - step);
  if (key === "PageUp") return Math.min(1, amount + step * 5);
  if (key === "PageDown") return Math.max(0, amount - step * 5);
  if (key === "Home") return 0;
  if (key === "End") return 1;
  return null;
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable=true], [role=textbox]") !== null;
}

function hasNativeTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
}

function stretchValueText(amount: number): string {
  if (amount === 0) return "Neutral";
  return `${Math.round(amount * 100)}% expanded`;
}

function clientViewport() {
  if (typeof window === "undefined") return undefined;
  const visual = window.visualViewport;
  return visual === null
    ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    : {
        left: visual.offsetLeft,
        top: visual.offsetTop,
        right: visual.offsetLeft + visual.width,
        bottom: visual.offsetTop + visual.height,
      };
}

/** Uses the same glyph geometry primitive as lasso addressing. */
function rangeAroundContents(element: HTMLElement): DOMRect | null {
  const range = document.createRange();
  const text = Array.from(element.childNodes).find(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent?.length ?? 0) > 0,
  );
  range.selectNodeContents(text ?? element);
  const rect = Array.from(range.getClientRects()).find(
    (candidate) => candidate.width > 0 && candidate.height > 0,
  );
  range.detach();
  return rect ?? null;
}

/** Clips a fixed control without changing the material-space projection. */
function clampClient(
  value: number,
  minimum: number | undefined,
  maximum: number | undefined,
  inset: number,
): number {
  if (minimum === undefined || maximum === undefined) return value;
  return Math.max(minimum + inset, Math.min(maximum - inset, value));
}


function selectionBounds(
  rects: readonly { x: number; y: number; width: number; height: number }[],
): { left: number; top: number; right: number; bottom: number } | null {
  if (rects.length === 0) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.x)),
    top: Math.min(...rects.map((rect) => rect.y)),
    right: Math.max(...rects.map((rect) => rect.x + rect.width)),
    bottom: Math.max(...rects.map((rect) => rect.y + rect.height)),
  };
}

function normalizePointerType(value: string): CanvasPointerType {
  return value === "touch" || value === "pen" ? value : "mouse";
}

function AdmissionFeedback({
  anchor,
  parentBox,
  controller,
}: {
  anchor: InteractionAdmissionAnchor | null;
  parentBox: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  controller: AdmissionController;
}) {
  if (controller.state.phase === "idle" || anchor === null) return null;
  const style = {
    transform: `translate3d(${parentBox?.x ?? 0}px, ${(parentBox?.y ?? 0) + (parentBox?.height ?? 0) + 18}px, 0)`,
  } as CSSProperties;
  const phase = controller.state.phase;
  const copy = admissionCopy(controller.state);
  return (
    <div
      aria-live={phase === "error" ? undefined : "polite"}
      className="admission-feedback"
      data-canvas-interactive
      data-phase={phase}
      role={phase === "error" ? "alert" : "status"}
      style={style}
    >
      <span aria-hidden="true" className="admission-feedback__signal" />
      <span>{copy}</span>
      {phase === "recording" ? (
        <button onClick={controller.stop} type="button">Stop recording</button>
      ) : null}
      {phase === "error" ? (
        <>
          <button onClick={controller.retry} type="button">Record again</button>
          <button onClick={controller.dismiss} type="button">Dismiss</button>
        </>
      ) : (
        <button onClick={controller.cancel} type="button">Cancel recording</button>
      )}
    </div>
  );
}

function admissionCopy(state: AdmissionController["state"]): string {
  switch (state.phase) {
    case "requesting": return "Waiting for microphone access";
    case "recording": return "Listening";
    case "stopping": return "Finishing the recording";
    case "transcribing": return "Turning voice into material";
    case "committing": return "Placing the thought";
    case "error":
      switch (state.errorCode) {
        case "MICROPHONE_DENIED": return "Microphone access is blocked.";
        case "MICROPHONE_UNAVAILABLE": return "No microphone is available.";
        case "RECORDING_UNSUPPORTED": return "Voice recording isn’t available here.";
        case "NO_AUDIO":
        case "EMPTY_TRANSCRIPT": return "No words were heard.";
        case "STALE_TARGET": return "That thought changed before the recording finished.";
        default: return "Couldn’t turn that recording into words.";
      }
    case "idle": return "";
    default: return assertNever(state);
  }
}

function normalizeDeltaMode(value: number): 0 | 1 | 2 {
  return value === 1 || value === 2 ? value : 0;
}

function readCssPixels(style: CSSStyleDeclaration, property: string, fallback: number) {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function samePresentationDamage(
  left: PresentationDamage | null,
  right: PresentationDamage | null,
): boolean {
  return left?.nodeId === right?.nodeId &&
    left?.topExtent === right?.topExtent &&
    left?.bottomExtent === right?.bottomExtent;
}

function dispatchToolIntent(intent: ToolIntent, props: RootedMaterialProps) {
  const { navigation, tree } = props;
  const selectedNode =
    navigation.selectedNodeId === null ? null : tree.nodes[navigation.selectedNodeId] ?? null;
  if (
    !isCurrentToolIntent(
      {
        view: navigation.mode,
        selected:
          selectedNode === null
            ? null
            : {
                nodeId: selectedNode.id,
                hasChildren: selectedNode.children.length > 0,
                isFolded: navigation.foldedNodeIds.has(selectedNode.id),
              },
        canUndo: props.canUndo,
        interaction: "idle",
      },
      intent,
    )
  ) {
    return;
  }
  switch (intent.type) {
    case "insert-child":
      if (navigation.mode === "full" && tree.nodes[intent.parentNodeId] !== undefined) {
        props.onInsertChild(intent.parentNodeId);
      }
      return;
    case "focus-node":
      if (navigation.mode === "full" && tree.nodes[intent.nodeId] !== undefined) {
        props.onFocusNode(intent.nodeId);
      }
      return;
    case "set-fold": {
      const node = tree.nodes[intent.nodeId];
      if (
        navigation.mode === "full" &&
        node !== undefined &&
        node.children.length > 0 &&
        navigation.foldedNodeIds.has(node.id) !== intent.folded
      ) {
        props.onToggleFold(node.id);
      }
      return;
    }
    case "show-full":
      if (navigation.mode === "focus") props.onExitFocus();
      return;
    case "undo":
      if (props.canUndo) props.onUndo();
      return;
    default:
      return assertNever(intent);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool intent: ${String(value)}`);
}
