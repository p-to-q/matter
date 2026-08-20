"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import Image from "next/image";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { NavigationState } from "../runtime/navigation";
import { layoutColumnarTree } from "../layout/columnar-layout";
import type { ColumnarLayout, LayoutNode } from "../layout/model";
import type { ThoughtTree } from "../tree/model";
import { isDocumentRoot } from "../tree/document-root";
import { projectTools } from "../tools/project-tools";
import { projectToolSurface } from "../tools/project-tool-surface";
import { isCurrentToolIntent } from "../tools/validate-intent";
import type { ToolIntent } from "../tools/model";
import { ToolRail } from "./ToolRail";
import { PaperTexture } from "./PaperTexture";
import {
  reduceCanvasViewport,
  type CanvasPointerType,
  type CanvasViewportState,
} from "../interaction/canvas-viewport";
import {
  createCanvasNavigationSession,
  reconcileCanvasNavigationSession,
} from "../interaction/canvas-navigation-session";
import type { AdmissionController } from "../interaction/use-admission";
import type { AdmissionAnchor as InteractionAdmissionAnchor } from "../runtime/admission-interaction";
import { useLasso } from "../interaction/use-lasso";
import { useStretch } from "../interaction/use-stretch";
import type { StretchPreviewSignal } from "../interaction/use-stretch";
import {
  STRETCH_COMMIT_THRESHOLD,
  STRETCH_MOUSE_PEN_DEADZONE_PX,
  STRETCH_TOUCH_DEADZONE_PX,
  STRETCH_TRAVEL_PX,
  isStretchInteractionKey,
  stretchAmountFromRailPosition,
} from "../runtime/stretch-interaction";
import {
  elasticPreviewGeometry,
  prepareElasticPreviewSource,
  projectElasticPreview,
} from "../interaction/elastic-preview";
import { projectLanguageAroundSelection } from "../material/language-projection";
import type { LanguageProjection } from "../material/language-projection";
import { segmentText, type SegmentSelection } from "../material/text-segments";
import { deriveExpandInPlaceLength } from "../protocol/expand-in-place-policy";
import { deriveTextSwapLength } from "../protocol/text-swap-policy";
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
import {
  findAdmissionFeedbackParentBox,
  projectAdmissionFeedbackPresentation,
} from "./admission-feedback-geometry";
import { CanvasChrome } from "./CanvasChrome";
import { CanvasRuling } from "./CanvasRuling";
import { NodeActionLens } from "./NodeActionLens";
import type { CanvasPreferencesBinding } from "./use-canvas-preferences";
import type { CanvasLanguage } from "./canvas-preferences";
import {
  canMoveNodeToParent,
  createNodeMovePolicy,
  type NodeMovePolicy,
} from "../runtime/move";
import { useVoiceReadiness } from "../interaction/use-voice-readiness";
import { projectInquiryContext } from "../material/inquiry-context";
import {
  createHeldAsideNodeIds,
  isNodeHeldAside,
  projectWorkingContext,
  reconcileHeldAsideNodeIds,
  restoreHeldAsideLineage,
  toggleHeldAsideBranch,
} from "../material/working-context";
import {
  projectNodeDropLanes,
  resolveBlankNodeDropTarget,
  type NodeDropBounds,
  type NodeDropLane,
  type NodeDropMode,
} from "../interaction/node-drop-target";
import { clientMatterBasePath } from "../config/base-path";
import { useInquiryRecord } from "../interaction/use-inquiry-record";
import type { TransformEnvelope, TransformPlan } from "../protocol/transform-contract";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import { useFixedExpandTurn } from "./use-fixed-expand-turn";
import {
  useTextSwap,
  type TextSwapController,
} from "../interaction/use-text-swap";
import {
  isTransformPresentationCurrent,
  useTransformPresentation,
} from "../interaction/use-transform-presentation";
import type {
  MaterialTextCommittedChange,
  TextSwapCommittedChange,
  TransformCommittedChange,
} from "../store/matter-store";
import type { TextSwapCommitResult } from "../interaction/text-swap-driver";
import { isRepairPresentationCurrent } from "../interaction/use-repair-presentation";
import { RepairingMaterialText } from "./RepairingMaterialText";
import { TransformingMaterialText } from "./TransformingMaterialText";
import { isCurrentNodeActionIntent } from "../tools/project-node-actions";
import {
  admissionFeedbackActions,
  admissionFeedbackMessage,
} from "./admission-feedback-copy";

export type RootedMaterialProps = {
  admission: AdmissionController;
  admissionAnchor: InteractionAdmissionAnchor | null;
  archive?: MaterialArchiveActions;
  canUndo: boolean;
  canRedo: boolean;
  canvasPreferences: CanvasPreferencesBinding;
  documentEpoch: number;
  locale: CanvasLanguage;
  navigation: NavigationState;
  onExitFocus: () => void;
  onFocusNode: (nodeId: string) => void;
  onInsertChild: (parentNodeId: string) => void;
  onRemoveSelected: () => void;
  onMoveNode: (nodeId: string, targetParentId: string, targetIndex?: number) => void;
  onRenameDocument: (title: string) => void;
  onClearSelection: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleFold: (nodeId: string) => void;
  onTransformCommit: (
    envelope: TransformEnvelope,
    plan: TransformPlan,
    expectedDocumentEpoch: number,
  ) => TransformCommittedChange | null;
  onTextSwapCommit: (
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    expectedDocumentEpoch: number,
  ) => TextSwapCommitResult<TextSwapCommittedChange>;
  onUndo: () => void;
  onRedo: () => void;
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

type NodeDragGesture = {
  pointerId: number;
  sourceId: string | null;
  sourceElement: HTMLElement | null;
  policy: NodeMovePolicy | null;
  originNodeId: string | null;
  startX: number;
  startY: number;
  zoom: number;
  dragging: boolean;
  targetId: string | null;
  targetIndex: number | null;
  targetMode: NodeDropMode | null;
  targetElement: HTMLElement | null;
  dropLanes: readonly NodeDropLane[];
  documentBounds: NodeDropBounds | null;
};

export function RootedMaterial(props: RootedMaterialProps) {
  const { canRedo, canUndo, navigation, onRedo, onRemoveSelected, onUndo, tree } = props;
  const matterBasePath = clientMatterBasePath();
  const { canvasPreferences } = props;
  const inquiryRecord = useInquiryRecord(tree.id, props.performanceMarking !== true);
  // A revision orders one known lineage; it cannot reconcile edits made before
  // IndexedDB has identified that lineage. Keep durable gestures inert during
  // bootstrap so hydration can never discard a load-window edit.
  const persistenceLoading = props.persistence.status.phase === "loading";
  const [workingContextState, setWorkingContextState] = useState<Readonly<{
    documentEpoch: number;
    epoch: number;
    heldAsideRootIds: ReadonlySet<string>;
  }>>(() => ({
    documentEpoch: props.documentEpoch,
    epoch: 0,
    heldAsideRootIds: createHeldAsideNodeIds(),
  }));
  const heldAsideRootIds = useMemo(
    () => reconcileHeldAsideNodeIds(
      tree,
      workingContextState.documentEpoch === props.documentEpoch
        ? workingContextState.heldAsideRootIds
        : createHeldAsideNodeIds(),
    ),
    [props.documentEpoch, tree, workingContextState.documentEpoch, workingContextState.heldAsideRootIds],
  );
  if (
    workingContextState.documentEpoch !== props.documentEpoch ||
    heldAsideRootIds !== workingContextState.heldAsideRootIds
  ) {
    // Commit reconciliation before children observe this render. Once a durable
    // edit removes a held root, Undo must not resurrect that obsolete decision.
    setWorkingContextState({
      documentEpoch: props.documentEpoch,
      epoch: workingContextState.epoch + 1,
      heldAsideRootIds,
    });
  }
  const workingContext = useMemo(
    () => projectWorkingContext(tree, heldAsideRootIds),
    [heldAsideRootIds, tree],
  );
  const toggleHeldAside = useCallback((nodeId: string) => {
    const next = toggleHeldAsideBranch(tree, heldAsideRootIds, nodeId);
    if (next === heldAsideRootIds) return;
    if (
      navigation.selectedNodeId !== null &&
      isNodeHeldAside(tree, next, navigation.selectedNodeId)
    ) props.onClearSelection();
    if (
      navigation.mode === "focus" &&
      isNodeHeldAside(tree, next, navigation.focusNodeId)
    ) props.onExitFocus();
    setWorkingContextState((current) => ({
      documentEpoch: props.documentEpoch,
      epoch: current.epoch + 1,
      heldAsideRootIds: next,
    }));
  }, [heldAsideRootIds, navigation.focusNodeId, navigation.mode, navigation.selectedNodeId, props, tree]);
  const focusWorkingNode = useCallback((nodeId: string) => {
    setWorkingContextState((current) => {
      const currentIds = current.documentEpoch === props.documentEpoch
        ? current.heldAsideRootIds
        : createHeldAsideNodeIds();
      const next = restoreHeldAsideLineage(tree, currentIds, nodeId);
      return next === currentIds && current.documentEpoch === props.documentEpoch
        ? current
        : {
            documentEpoch: props.documentEpoch,
            epoch: current.epoch + 1,
            heldAsideRootIds: next,
          };
    });
    props.onFocusNode(nodeId);
  }, [props, tree]);
  const restoreWorkingNode = useCallback((nodeId: string) => {
    setWorkingContextState((current) => {
      const currentIds = current.documentEpoch === props.documentEpoch
        ? current.heldAsideRootIds
        : createHeldAsideNodeIds();
      const next = restoreHeldAsideLineage(tree, currentIds, nodeId);
      return next === currentIds && current.documentEpoch === props.documentEpoch
        ? current
        : {
            documentEpoch: props.documentEpoch,
            epoch: current.epoch + 1,
            heldAsideRootIds: next,
          };
    });
    props.onSelectNode(nodeId);
  }, [props, tree]);
  const shellRef = useRef<HTMLElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutEpochRef = useRef(0);
  const revealedDocumentEpochRef = useRef<number | null>(null);
  const measuredLayoutCacheRef = useRef(new Map<string, ColumnarLayout>());
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
  const [stretchPresentationDamage, setStretchPresentationDamage] = useState<PresentationDamage | null>(null);
  const stretchPresentationDamageRef = useRef<PresentationDamage | null>(null);
  const [admissionFeedbackHeight, setAdmissionFeedbackHeight] = useState(0);
  const admissionAnchor = props.admission.state.phase === "idle" ? null : props.admission.state.anchor;
  const [canvasNavigationState, setCanvasNavigationState] = useState(
    () => createCanvasNavigationSession(props.documentEpoch),
  );
  const canvasNavigation = reconcileCanvasNavigationSession(
    canvasNavigationState,
    props.documentEpoch,
  );
  if (canvasNavigation !== canvasNavigationState) {
    // Reconcile before children can observe a camera from another document.
    setCanvasNavigationState(canvasNavigation);
  }
  const { canvasMode, viewport, wheelMotionActive } = canvasNavigation;
  const setViewport = useCallback((update: (current: CanvasViewportState) => CanvasViewportState) => {
    setCanvasNavigationState((current) => {
      if (current.documentEpoch !== props.documentEpoch) return current;
      const next = update(current.viewport);
      return next === current.viewport ? current : Object.freeze({ ...current, viewport: next });
    });
  }, [props.documentEpoch]);
  const setCanvasMode = useCallback((canvasMode: "material" | "pan") => {
    setCanvasNavigationState((current) => current.documentEpoch !== props.documentEpoch || current.canvasMode === canvasMode
      ? current
      : Object.freeze({ ...current, canvasMode }));
  }, [props.documentEpoch]);
  const setWheelMotionActive = useCallback((wheelMotionActive: boolean) => {
    setCanvasNavigationState((current) =>
      current.documentEpoch !== props.documentEpoch || current.wheelMotionActive === wheelMotionActive
        ? current
        : Object.freeze({ ...current, wheelMotionActive }));
  }, [props.documentEpoch]);
  const voiceReadiness = useVoiceReadiness();
  const wheelMotionTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressCompatibilityClickUntilRef = useRef(0);
  const suppressCompatibilityClick = useCallback(() => {
    // A touch tap can move this transient control before Chromium dispatches
    // its compatibility click. Own that one follow-up event without blocking
    // a later intentional click if the browser emits none.
    suppressCompatibilityClickUntilRef.current = performance.now() + 700;
  }, []);
  const pointerOriginNodeRef = useRef<string | null>(null);
  const nodeDragRef = useRef<NodeDragGesture | null>(null);
  const clearNodeDrag = useCallback(() => {
    const gesture = nodeDragRef.current;
    if (gesture?.targetElement) delete gesture.targetElement.dataset.dragOver;
    if (gesture?.sourceElement) {
      delete gesture.sourceElement.dataset.dragSource;
      gesture.sourceElement.style.removeProperty("--node-drag-x");
      gesture.sourceElement.style.removeProperty("--node-drag-y");
    }
    if (shellRef.current) {
      delete shellRef.current.dataset.nodeDragging;
      delete shellRef.current.dataset.nodeDropMode;
    }
    nodeDragRef.current = null;
  }, []);
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
  const projectionKey = useMemo(
    () => layoutProjectionKey(layoutInput),
    [layoutInput],
  );
  const projection = useMemo(
    () => projectLayoutProjection(layoutInput),
    [layoutInput],
  );
  const activeWorkingProjection = useMemo(
    () => projection
      .filter(({ node }) => workingContext.activeNodeIds.has(node.id))
      .map(({ node, depth }) => Object.freeze({ nodeId: node.id, depth })),
    [projection, workingContext.activeNodeIds],
  );
  const activeLayout = published?.key === projectionKey ? published.layout : null;
  const admissionParentBox = useMemo(
    () => findAdmissionFeedbackParentBox(
      admissionAnchor,
      activeLayout?.boxes ?? null,
      navigation.selectedNodeId,
    ),
    [activeLayout?.boxes, admissionAnchor, navigation.selectedNodeId],
  );
  const admissionPresentationDamage = useMemo<PresentationDamage | null>(
    () => projectAdmissionFeedbackPresentation(
      admissionParentBox?.nodeId ?? null,
      admissionFeedbackHeight,
    ),
    [admissionFeedbackHeight, admissionParentBox?.nodeId],
  );
  // Voice admission and stretch are mutually exclusive interactions. Giving
  // admission precedence still makes the rendering boundary deterministic if
  // a stale stretch receipt survives until the next layout publication.
  const presentationDamage = admissionPresentationDamage ?? stretchPresentationDamage;
  const stretchInvalidationRef = useRef<() => void>(() => undefined);
  const invalidateStretchGeometry = useCallback(() => {
    stretchInvalidationRef.current();
  }, []);
  const labels = useThoughtLabels({
    tree,
    documentEpoch: props.documentEpoch,
    locale: props.locale,
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
    surfaceRef: documentRef,
    epoch: {
      treeRevision: tree.revision,
      layoutEpoch: activeLayout?.layoutEpoch ?? 0,
      viewportX: viewport.x,
      viewportY: viewport.y,
      viewportZoom: viewport.zoom,
    },
    navigationKey: `${navigation.mode}:${navigation.focusNodeId ?? ""}:${navigation.selectedNodeId ?? ""}:${Array.from(navigation.foldedNodeIds).sort().join(",")}:${workingContextState.epoch}`,
    eligibleNodeIds: workingContext.activeNodeIds,
    onGeometryInvalidated: invalidateStretchGeometry,
  });
  useEffect(() => {
    const cancelMoveFromKeyboard = (event: KeyboardEvent) => {
      const gesture = nodeDragRef.current;
      const shell = shellRef.current;
      if (event.key !== "Escape" || gesture === null || shell === null) return;
      event.preventDefault();
      suppressClickRef.current = true;
      clearNodeDrag();
      if (shell.hasPointerCapture(gesture.pointerId)) shell.releasePointerCapture(gesture.pointerId);
    };
    window.addEventListener("keydown", cancelMoveFromKeyboard);
    return () => window.removeEventListener("keydown", cancelMoveFromKeyboard);
  }, [clearNodeDrag]);
  useEffect(() => () => clearNodeDrag(), [clearNodeDrag, props.documentEpoch, navigation.mode, tree.revision]);
  const elasticRef = useRef<HTMLDivElement>(null);
  const splitProjectionRef = useRef<HTMLDivElement>(null);
  const projectionHandleReceiptRef = useRef<ProjectionHandleReceipt | null>(null);
  const stretchSelectionRef = useRef<SegmentSelection | null>(null);
  // Range fragments and their visual-line grouping are stable until lasso
  // geometry changes. Keeping them out of the pointer-move path prevents a
  // long wrapped selection from paying that O(n log n) work every frame.
  const elasticPreviewSource = useMemo(
    () => prepareElasticPreviewSource(
      lasso.selectionRects,
      lasso.selectionColumn ?? undefined,
    ),
    [lasso.selectionColumn, lasso.selectionRects],
  );
  const updateElasticPreview = useCallback((signal: StretchPreviewSignal) => {
    const element = elasticRef.current;
    const split = splitProjectionRef.current;
    const preview = elasticPreviewSource === null
      ? null
      : projectElasticPreview(
          elasticPreviewSource,
          signal.amount,
          clientViewport(),
          signal.handle,
          signal.handle,
          hasCoarsePointer(),
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
    const topY = clampClient(
      rawTopY,
      visible?.top,
      visible?.bottom,
      preview.handleViewportInset,
    );
    const bottomY = clampClient(
      rawBottomY,
      visible?.top,
      visible?.bottom,
      preview.handleViewportInset,
    );
    const rawTopCenter = receipt?.centerX ?? (preview.topHandle.x1 + preview.topHandle.x2) / 2;
    const rawBottomCenter = receipt?.centerX ?? (preview.bottomHandle.x1 + preview.bottomHandle.x2) / 2;
    const topCenter = clampClient(rawTopCenter, visible?.left, visible?.right, 26);
    const bottomCenter = clampClient(rawBottomCenter, visible?.left, visible?.right, 26);
    element.style.setProperty("--elastic-anchor-top", `${topY}px`);
    element.style.setProperty("--elastic-handle-top", `${bottomY}px`);
    element.style.setProperty("--elastic-rail-top", `${clampStretchRailTop(
      receipt?.afterTopClient ?? preview.bottomHandle.y - preview.pocketDepth,
      visible,
    )}px`);
    element.style.setProperty("--elastic-top-center", `${topCenter}px`);
    element.style.setProperty("--elastic-bottom-center", `${bottomCenter}px`);
    element.style.setProperty("--pocket-left", `${preview.pocket.left}px`);
    element.style.setProperty("--pocket-top", `${rawTopY}px`);
    element.style.setProperty("--pocket-width", `${preview.pocket.right - preview.pocket.left}px`);
    element.style.setProperty("--pocket-height", `${Math.max(0, rawBottomY - rawTopY)}px`);
    element.style.setProperty("--elastic-opacity", String(preview.opacity));
    const control = element.querySelector<HTMLElement>(".stretch-handle");
    const ratioLabel = element.querySelector<HTMLElement>(".stretch-handle__ratio");
    const ratio = stretchExpansionRatio(tree, stretchSelectionRef.current, signal.amount);
    if (control !== null) {
      control.dataset.stretchAmount = String(Number(signal.amount.toFixed(3)));
      control.setAttribute("aria-valuenow", String(Number(signal.amount.toFixed(3))));
      control.setAttribute("aria-valuetext", stretchValueText(signal.amount, ratio, props.locale));
      if (signal.amount >= STRETCH_COMMIT_THRESHOLD) control.dataset.stretchCommitReady = "true";
      else delete control.dataset.stretchCommitReady;
      if (ratio === null) delete control.dataset.stretchRatio;
      else control.dataset.stretchRatio = String(Number(ratio.toFixed(3)));
    }
    if (ratioLabel !== null) {
      ratioLabel.textContent = formatStretchRatio(ratio, props.locale);
      if (signal.amount > 0) ratioLabel.dataset.visible = "true";
      else delete ratioLabel.dataset.visible;
    }
  }, [elasticPreviewSource, props.locale, tree, viewport.zoom]);
  const navigationKey = `${navigation.mode}:${navigation.focusNodeId ?? ""}:${navigation.selectedNodeId ?? ""}:${Array.from(navigation.foldedNodeIds).sort().join(",")}`;
  const stretchSelection = eligibleStretchSelection({
    candidate: lasso.selections.length === 1 ? lasso.selection : null,
    currentText: lasso.sourceText,
    focusView: navigation.mode === "focus",
    tree,
  });
  const textSwapSelection = eligibleTextSwapSelection({
    candidate: lasso.selections.length === 1 ? lasso.selection : null,
    currentText: lasso.sourceText,
    focusView: navigation.mode === "focus",
    tree,
  });
  useLayoutEffect(() => {
    stretchSelectionRef.current = stretchSelection;
  }, [stretchSelection]);
  const transformPresentation = useTransformPresentation({
    treeId: tree.id,
    documentEpoch: props.documentEpoch,
  });
  const { publish: publishTransformPresentation } = transformPresentation;
  const publishMaterialTextChange = useCallback((change: MaterialTextCommittedChange) => {
    publishTransformPresentation(change);
  }, [publishTransformPresentation]);
  const transform = useFixedExpandTurn({
    tree,
    documentEpoch: props.documentEpoch,
    selection: stretchSelection,
    locale: props.locale,
    enabled: stretchSelection !== null && !persistenceLoading,
    interactionScopeKey: `${navigationKey}:${workingContextState.epoch}`,
    commit: props.onTransformCommit,
    onCommitted: publishMaterialTextChange,
  });
  const {
    cancel: cancelTransform,
    clearError: clearTransformError,
    start: startTransform,
    state: transformState,
  } = transform;
  const startFixedExpansion = useCallback((basis: Parameters<typeof startTransform>[0]) => {
    startTransform(basis);
  }, [startTransform]);
  const stretch = useStretch({
    selection: stretchSelection,
    treeId: tree.id,
    revision: tree.revision,
    documentEpoch: props.documentEpoch,
    navigationKey,
    layoutKey: `${activeLayout?.layoutEpoch ?? 0}:${viewport.x}:${viewport.y}:${viewport.zoom}`,
    onPreview: updateElasticPreview,
    onCommit: startFixedExpansion,
  });
  const textSwap = useTextSwap<TextSwapCommittedChange>({
    tree,
    documentEpoch: props.documentEpoch,
    selection: textSwapSelection,
    locale: props.locale,
    enabled: textSwapSelection !== null && !persistenceLoading,
    interactionScopeKey: `${navigationKey}:${workingContextState.epoch}`,
    commit: props.onTextSwapCommit,
    onCommitted: publishMaterialTextChange,
  });
  const textSwapPhase = textSwap.state.phase;
  const textSwapActive = textSwapPhase !== "idle" &&
    textSwapPhase !== "success" && textSwapPhase !== "stale";
  const elasticLanguageActive = stretch.dragging || stretch.amount > 0 ||
    transformState.phase !== "idle";
  useEffect(() => {
    if (textSwapPhase === "success" || textSwapPhase === "stale") textSwap.dismiss();
  }, [textSwap, textSwapPhase]);
  const { reopen: reopenStretch } = stretch;
  useEffect(() => {
    if (transformState.phase === "error") reopenStretch();
  }, [reopenStretch, transformState.phase]);
  const beginStretchAdjustment = useCallback(() => {
    if (textSwap.state.phase !== "idle") textSwap.cancel();
    if (transformState.phase === "requesting") {
      cancelTransform();
    } else if (transformState.phase === "error") {
      clearTransformError();
    }
  }, [cancelTransform, clearTransformError, textSwap, transformState.phase]);
  const abortElasticExpansion = useCallback(() => {
    if (transformState.phase === "requesting") cancelTransform();
    else if (transformState.phase === "error") clearTransformError();
    stretch.keyDown("Escape");
  }, [cancelTransform, clearTransformError, stretch, transformState.phase]);
  const abortFixedExpansion = useCallback(() => {
    if (textSwap.state.phase !== "idle") textSwap.cancel();
    abortElasticExpansion();
  }, [abortElasticExpansion, textSwap]);
  const textSwapSelectionKey = textSwapSelection === null
    ? ""
    : `${textSwapSelection.nodeId}:${textSwapSelection.start}:${textSwapSelection.end}:${textSwapSelection.selectedText}`;
  const [typedTextSwap, setTypedTextSwap] = useState<Readonly<{
    selectionKey: string;
    value: string;
  }> | null>(null);
  const currentTypedTextSwap = typedTextSwap?.selectionKey === textSwapSelectionKey
    ? typedTextSwap
    : null;
  const startTypedTextSwap = useCallback(() => {
    if (textSwapSelection === null) return;
    abortElasticExpansion();
    props.admission.discardPendingRepairs();
    if (textSwap.state.phase !== "idle") textSwap.cancel();
    if (!textSwap.enter()) return;
    setTypedTextSwap({ selectionKey: textSwapSelectionKey, value: "" });
  }, [abortElasticExpansion, props.admission, textSwap, textSwapSelection, textSwapSelectionKey]);
  const cancelTypedTextSwap = useCallback(() => {
    setTypedTextSwap(null);
    textSwap.cancel();
  }, [textSwap]);
  const submitTypedTextSwap = useCallback(() => {
    if (currentTypedTextSwap === null || !textSwap.acceptDirection(currentTypedTextSwap.value)) {
      return false;
    }
    const submitted = textSwap.submit();
    if (submitted) setTypedTextSwap(null);
    return submitted;
  }, [currentTypedTextSwap, textSwap]);
  useEffect(() => {
    if (transformState.phase !== "requesting") return;
    const clearCommittedDegree = (event: KeyboardEvent) => {
      if (event.key === "Escape") stretch.keyDown("Escape");
    };
    window.addEventListener("keydown", clearCommittedDegree);
    return () => window.removeEventListener("keydown", clearCommittedDegree);
  }, [stretch, transformState.phase]);
  const stretchRatio = stretchExpansionRatio(tree, stretchSelection, stretch.amount);
  const currentTransformChange = isTransformPresentationCurrent(
    transformPresentation.change,
    { treeId: tree.id, documentEpoch: props.documentEpoch },
    tree,
  ) ? transformPresentation.change : null;
  const lassoHasSelectionGeometry = lasso.selectionSetRects.length > 0 ||
    lasso.selectionRects.length > 0;
  const interactionPending = persistenceLoading || (
    props.admission.state.phase !== "idle" && props.admission.state.phase !== "error"
  );
  const selectNodeAfterAbort = useCallback((nodeId: string) => {
    abortFixedExpansion();
    props.onSelectNode(nodeId);
  }, [abortFixedExpansion, props]);
  const archiveAfterAbort = useMemo<MaterialArchiveActions | undefined>(() => {
    if (props.archive === undefined) return undefined;
    return Object.freeze({
      exportCopy: () => {
        abortFixedExpansion();
        return props.archive!.exportCopy();
      },
      validateImport: (file: File) => {
        abortFixedExpansion();
        return props.archive!.validateImport(file);
      },
      replaceImport: (file: File) => {
        abortFixedExpansion();
        return props.archive!.replaceImport(file);
      },
    });
  }, [abortFixedExpansion, props.archive]);
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
      abortFixedExpansion();
      onRemoveSelected();
    };
    window.addEventListener("keydown", removeSelected);
    return () => window.removeEventListener("keydown", removeSelected);
  }, [abortFixedExpansion, interactionPending, lasso.active, lasso.drawing, navigation.mode, navigation.selectedNodeId, onRemoveSelected, tree.rootId]);
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
      abortFixedExpansion();
      onUndo();
    };
    window.addEventListener("keydown", undoFromKeyboard);
    return () => window.removeEventListener("keydown", undoFromKeyboard);
  }, [abortFixedExpansion, canUndo, interactionPending, onUndo]);
  useEffect(() => {
    const redoFromKeyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented || event.isComposing || event.altKey ||
        (!event.metaKey && !event.ctrlKey) || !canRedo || interactionPending ||
        isEditableEventTarget(event.target) || hasNativeTextSelection()
      ) return;
      const key = event.key.toLowerCase();
      if ((key !== "z" || !event.shiftKey) && key !== "y") return;
      event.preventDefault();
      abortFixedExpansion();
      onRedo();
    };
    window.addEventListener("keydown", redoFromKeyboard);
    return () => window.removeEventListener("keydown", redoFromKeyboard);
  }, [abortFixedExpansion, canRedo, interactionPending, onRedo]);
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
      if (samePresentationDamage(stretchPresentationDamageRef.current, nextDamage)) return;
      stretchPresentationDamageRef.current = nextDamage;
      setStretchPresentationDamage(nextDamage);
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
  const toolTargetNode = resolveToolTargetNode(navigation, tree);
  const textSwapRetryAvailable = textSwap.state.phase === "error" &&
    textSwap.state.retryable && textSwap.state.direction !== undefined;
  const textSwapVoiceCanCancel = textSwap.state.phase === "permission" ||
    textSwap.state.phase === "recording" || textSwap.state.phase === "transcribing" ||
    textSwap.state.phase === "pending";
  const textSwapVoiceAvailable = textSwapVoiceCanCancel || (
    !elasticLanguageActive && textSwapSelection !== null && (
      textSwapRetryAvailable || (
        voiceAdmissionIsEnabled() && voiceReadiness.status === "ready"
      )
    )
  );
  const admissionVoiceAvailable = props.admissionAnchor !== null &&
    voiceAdmissionIsEnabled() &&
    voiceReadiness.status === "ready";
  const voiceAvailable = textSwapVoiceAvailable || admissionVoiceAvailable;
  const tools = useMemo(
    () =>
      projectTools({
        view: navigation.mode,
          selected:
          toolTargetNode === null
            ? null
            : {
                nodeId: toolTargetNode.id,
                hasChildren: toolTargetNode.children.length > 0,
                isFolded: navigation.foldedNodeIds.has(toolTargetNode.id),
              },
        canUndo,
        interaction: interactionPending ? "pending" : "idle",
      }),
    [canUndo, interactionPending, navigation.foldedNodeIds, navigation.mode, toolTargetNode],
  );
  const toolSurface = useMemo(() => projectToolSurface(tools), [tools]);
  const handleNodeActionIntent = useCallback((nodeId: string, intent: ToolIntent) => {
    const context = {
      activeNodeIds: workingContext.activeNodeIds,
      interaction: interactionPending ? "pending" as const : "idle" as const,
      navigation,
      nodeId,
      tree,
    };
    if (!isCurrentNodeActionIntent(context, intent)) return;
    abortFixedExpansion();
    applyToolIntent(intent, props);
  }, [abortFixedExpansion, interactionPending, navigation, props, tree, workingContext.activeNodeIds]);
  const projectInquiryPayload = useCallback(
    () => projectInquiryContext(tree, activeWorkingProjection, lasso.selections),
    [activeWorkingProjection, lasso.selections, tree],
  );
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
  const selectedLanguageNodeId = stretchSelection?.nodeId ?? textSwapSelection?.nodeId ?? null;
  const selectedLanguageIsCurrent = selectedLanguageNodeId !== null &&
    projection.some(({ node }) => node.id === selectedLanguageNodeId);
  const textSwapGuidancePhase: Extract<CanvasLanguageGuidanceState, { kind: "text-swap" }>["phase"] | null =
    currentTypedTextSwap !== null && textSwap.state.phase === "eligible"
      ? "typing"
      : textSwap.state.phase === "permission" || textSwap.state.phase === "recording" ||
          textSwap.state.phase === "transcribing" || textSwap.state.phase === "pending" ||
          textSwap.state.phase === "error"
        ? textSwap.state.phase
        : textSwap.state.phase === "ready"
          ? "typing"
          : null;
  let languageGuidance: CanvasLanguageGuidanceState;
  if (lasso.drawing) {
    languageGuidance = { kind: "lasso-drawing" };
  } else if (textSwapGuidancePhase !== null) {
    languageGuidance = { kind: "text-swap", phase: textSwapGuidancePhase };
  } else if (selectedLanguageIsCurrent) {
    languageGuidance = {
      kind: "selected",
      stretch: transformState.phase === "requesting"
        ? { kind: "pending", amount: transformState.basis?.amount ?? stretch.amount }
        : transformState.phase === "error"
          ? { kind: "error", amount: transformState.basis?.amount ?? stretch.amount }
          : stretch.dragging
            ? { kind: "dragging", amount: stretch.amount }
            : stretch.amount > 0
              ? { kind: "adjusted", amount: stretch.amount }
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
  const lassoSelectedNodeIds = useMemo(
    () => new Set(lasso.selections.map((selection) => selection.nodeId)),
    [lasso.selections],
  );

  useEffect(() => {
    let mounted = true;
    const remeasure = () => {
      measuredLayoutCacheRef.current.clear();
      measuredHeightCacheRef.current.clear();
      requestMeasurement();
    };
    const remeasureWhenVisible = () => {
      if (!document.hidden) remeasure();
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("pageshow", remeasureWhenVisible);
    document.addEventListener("visibilitychange", remeasureWhenVisible);
    const initialFrame = requestAnimationFrame(remeasure);
    void document.fonts?.ready.then(() => {
      if (mounted) remeasure();
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(initialFrame);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("pageshow", remeasureWhenVisible);
      document.removeEventListener("visibilitychange", remeasureWhenVisible);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || projection.length === 0) {
      setPublished(null);
      return;
    }
    if (revealedDocumentEpochRef.current !== props.documentEpoch) {
      canvas.removeAttribute("data-layout-revealed");
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
    const elements = canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]");
    if (elements.length !== projection.length) return;
    for (let index = 0; index < projection.length; index += 1) {
      if (elements[index]?.dataset.layoutNodeId !== projection[index]?.node.id) return;
    }
    const layoutCacheKey = presentationDamage === null
      ? `${projectionKey}:${columnWidth}:${columnGap}:${siblingGap}`
      : null;
    const cachedLayout = layoutCacheKey === null
      ? undefined
      : measuredLayoutCacheRef.current.get(layoutCacheKey);
    if (cachedLayout !== undefined) {
      // Reuse only immutable pure geometry; every publication still receives
      // a fresh epoch, and resize/font invalidation clears this bounded cache.
      retainBoundedCache(measuredLayoutCacheRef.current, layoutCacheKey!, cachedLayout);
      const layout = Object.freeze({
        ...cachedLayout,
        layoutEpoch: layoutEpochRef.current + 1,
      });
      if (!publishCanvasGeometry(canvas, elements, layout)) return;
      layoutEpochRef.current = layout.layoutEpoch;
      setPublished({ key: projectionKey, layout });
      return;
    }
    const nodes: LayoutNode[] = [];
    if (!initialPerformanceMarksRef.current.heightReadStarted) {
      initialPerformanceMarksRef.current.heightReadStarted = true;
      markPerformance("matter:performance:height-read-start");
    }
    for (let index = 0; index < projection.length; index += 1) {
      const item = projection[index];
      if (item === undefined) return;
      const element = elements[index];
      const root = item.parentId === null;
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
    if (layoutCacheKey !== null) {
      retainBoundedCache(measuredLayoutCacheRef.current, layoutCacheKey, result.layout);
    }
    if (!publishCanvasGeometry(canvas, elements, result.layout)) return;
    layoutEpochRef.current = result.layout.layoutEpoch;
    if (!initialPerformanceMarksRef.current.geometryPublished) {
      initialPerformanceMarksRef.current.geometryPublished = true;
      markPerformance("matter:performance:geometry-dom-published");
    }
    setPublished({ key: projectionKey, layout: result.layout });
  }, [markPerformance, measureRevision, presentationDamage, projection, projectionKey, props.documentEpoch, tree.rootId]);

  useLayoutEffect(() => {
    if (activeLayout === null) return;
    canvasRef.current?.setAttribute("data-layout-ready", "true");
    canvasRef.current?.setAttribute("data-layout-revealed", "true");
    revealedDocumentEpochRef.current = props.documentEpoch;
    if (!props.performanceMarking || initialPerformanceMarksRef.current.published) return;
    initialPerformanceMarksRef.current.published = true;
    markPerformance("matter:performance:published-canvas-commit");
  }, [activeLayout, markPerformance, props.documentEpoch, props.performanceMarking]);

  useEffect(() => () => {
    const retry = measurementRetryRef.current;
    if (retry.frame !== null) cancelAnimationFrame(retry.frame);
    if (wheelMotionTimerRef.current !== null) window.clearTimeout(wheelMotionTimerRef.current);
  }, [props.documentEpoch]);

  const worldStyle = {
    transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
  } as CSSProperties;
  const nodeActionsEnabled = activeLayout !== null &&
    canvasMode === "material" &&
    !interactionPending &&
    !lasso.active &&
    !lasso.drawing &&
    !stretch.dragging &&
    stretch.amount === 0 &&
    transformState.phase === "idle" &&
    !wheelMotionActive &&
    viewport.gesture?.dragging !== true;

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
      if (canvasMode !== "pan") return;
      event.preventDefault();
      const paper = documentRef.current;
      if (paper === null) return;
      const paperRect = paper.getBoundingClientRect();
      // Wheel navigation has no persistent gesture state, so give atmosphere
      // one short pulse and let repeated events extend it without polling.
      setWheelMotionActive(true);
      if (wheelMotionTimerRef.current !== null) window.clearTimeout(wheelMotionTimerRef.current);
      wheelMotionTimerRef.current = window.setTimeout(() => {
        wheelMotionTimerRef.current = null;
        setWheelMotionActive(false);
      }, 180);
      setViewport((current) => {
        const result = reduceCanvasViewport(current, {
          type: "wheel",
          surfaceX: event.clientX - paperRect.left - paper.clientLeft,
          surfaceY: event.clientY - paperRect.top - paper.clientTop,
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
  }, [canvasMode, lasso.active, setViewport, setWheelMotionActive]);

  return (
    <main
      className="matter-shell"
      data-dragging={viewport.gesture?.dragging || undefined}
      data-canvas-mode={lasso.active ? "lasso" : canvasMode}
      data-interaction-pending={interactionPending || undefined}
      data-lasso-mode={lasso.active || undefined}
      data-stretching={stretch.dragging || undefined}
      data-transform-phase={transformState.phase === "idle" ? undefined : transformState.phase}
      data-tree-revision={tree.revision}
      data-view={navigation.mode}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-zoom={viewport.zoom}
      ref={shellRef}
      onClickCapture={(event) => {
        if (performance.now() <= suppressCompatibilityClickUntilRef.current) {
          suppressCompatibilityClickUntilRef.current = 0;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        suppressCompatibilityClickUntilRef.current = 0;
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive]")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onLostPointerCapture={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) return;
        if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "lost-pointer-capture", pointerId: event.pointerId });
      }}
      onPointerCancel={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) return;
        if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
      }}
      onPointerDown={(event) => {
        if (interactionPending) return;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive], a")) return;
        abortFixedExpansion();
        if (lasso.pointerDown(event)) {
          props.admission.discardPendingRepairs();
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A detached capture target cannot own a trustworthy lasso stroke.
            lasso.pointerCancel(event.pointerId);
          }
          return;
        }
        if (!event.isPrimary || (event.pointerType !== "touch" && event.button !== 0)) return;
        const pointerCandidateId =
          (event.target as HTMLElement).closest<HTMLElement>("[data-thought-id]")?.dataset
            .thoughtId ?? null;
        pointerOriginNodeRef.current = pointerCandidateId !== null && workingContext.activeNodeIds.has(pointerCandidateId)
          ? pointerCandidateId
          : null;
        const originNodeId = pointerOriginNodeRef.current;
        if (canvasMode === "material") {
          const sourceId = navigation.mode === "full" && originNodeId !== null &&
            originNodeId === navigation.selectedNodeId &&
            tree.nodes[originNodeId]?.parentId !== null
              ? originNodeId
              : null;
          const sourceElement = sourceId === null
            ? null
            : (event.target as HTMLElement).closest<HTMLElement>("[data-thought-id]");
          const policy = sourceId === null ? null : createNodeMovePolicy(tree, sourceId);
          const canvasBounds = canvasRef.current?.getBoundingClientRect() ?? null;
          const documentBounds = documentRef.current?.getBoundingClientRect() ?? null;
          nodeDragRef.current = {
            pointerId: event.pointerId,
            sourceId,
            sourceElement,
            policy,
            originNodeId,
            startX: event.clientX,
            startY: event.clientY,
            zoom: viewport.zoom,
            dragging: false,
            targetId: null,
            targetIndex: null,
            targetMode: null,
            targetElement: null,
            dropLanes: activeLayout === null || canvasBounds === null
              ? []
              : projectNodeDropLanes(tree, activeLayout, canvasBounds, viewport.zoom),
            documentBounds: documentBounds === null
              ? null
              : {
                  left: documentBounds.left,
                  top: documentBounds.top,
                  right: documentBounds.right,
                  bottom: documentBounds.bottom,
                },
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            clearNodeDrag();
          }
          return;
        }
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
        if (lasso.pointerMove(event)) {
          event.preventDefault();
          return;
        }
        const nodeDrag = nodeDragRef.current;
        if (nodeDrag?.pointerId === event.pointerId) {
          if (!nodeDrag.dragging && Math.hypot(event.clientX - nodeDrag.startX, event.clientY - nodeDrag.startY) >= (event.pointerType === "touch" ? 8 : 4)) {
            nodeDrag.dragging = true;
            if (nodeDrag.sourceId !== null && nodeDrag.policy !== null && nodeDrag.sourceElement !== null) {
              props.admission.discardPendingRepairs();
              event.currentTarget.dataset.nodeDragging = "true";
              nodeDrag.sourceElement.dataset.dragSource = "true";
            }
          }
          if (
            !nodeDrag.dragging ||
            nodeDrag.sourceId === null ||
            nodeDrag.policy === null ||
            nodeDrag.sourceElement === null
          ) return;
          event.preventDefault();
          nodeDrag.sourceElement.style.setProperty(
            "--node-drag-x",
            `${(event.clientX - nodeDrag.startX) / nodeDrag.zoom}px`,
          );
          nodeDrag.sourceElement.style.setProperty(
            "--node-drag-y",
            `${(event.clientY - nodeDrag.startY) / nodeDrag.zoom}px`,
          );
          const hitElement = document.elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-thought-id]") ?? null;
          const hitId = hitElement?.dataset.thoughtId ?? null;
          const directTargetId = hitId !== null &&
            workingContext.activeNodeIds.has(hitId) &&
            nodeDrag.policy.validTargetIds.has(hitId)
            ? hitId
            : null;
          const blankTarget = directTargetId === null && hitId === null
            ? resolveBlankNodeDropTarget({
                clientX: event.clientX,
                clientY: event.clientY,
                documentBounds: nodeDrag.documentBounds,
                lanes: nodeDrag.dropLanes,
                policy: nodeDrag.policy,
                rootId: tree.rootId,
                startX: nodeDrag.startX,
                startY: nodeDrag.startY,
              })
            : null;
          const targetCandidateId = directTargetId ?? blankTarget?.targetId ?? null;
          const targetId = targetCandidateId !== null && (
            targetCandidateId === tree.rootId || workingContext.activeNodeIds.has(targetCandidateId)
          )
            ? targetCandidateId
            : null;
          const targetMode = directTargetId !== null ? "nest" : blankTarget?.mode ?? null;
          const targetIndex = directTargetId !== null
            ? null
            : blankTarget?.targetIndex === Number.MAX_SAFE_INTEGER && targetId !== null
              ? tree.nodes[targetId]?.children.length ?? null
              : blankTarget?.targetIndex ?? null;
          const indicatorId = directTargetId ?? blankTarget?.indicatorId ?? null;
          const targetElement = indicatorId === null
            ? null
            : event.currentTarget.querySelector<HTMLElement>(`[data-thought-id="${CSS.escape(indicatorId)}"]`);
          publishNodeDragTarget(nodeDrag, targetElement, targetId, targetIndex, targetMode, event.currentTarget);
          return;
        }
        if (viewport.gesture?.pointerId !== event.pointerId) return;
        updateViewport({ type: "pointer-move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      }}
      onPointerUp={(event) => {
        if (interactionPending) {
          lasso.pointerCancel(event.pointerId);
          if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
          pointerOriginNodeRef.current = null;
          updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        if (lasso.pointerUp(event)) {
          event.preventDefault();
          suppressClickRef.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        const nodeDrag = nodeDragRef.current;
        if (nodeDrag?.pointerId === event.pointerId) {
          const targetId = nodeDrag.targetId;
          const targetIndex = nodeDrag.targetIndex;
          const sourceParentId = nodeDrag.sourceId === null ? null : tree.nodes[nodeDrag.sourceId]?.parentId ?? null;
          const shouldMove = nodeDrag.sourceId !== null &&
            nodeDrag.dragging &&
            targetId !== null &&
            (targetId !== sourceParentId || targetIndex !== null) &&
            canMoveNodeToParent(tree, nodeDrag.sourceId, targetId);
          clearNodeDrag();
          suppressClickRef.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (shouldMove && nodeDrag.sourceId !== null) {
            abortFixedExpansion();
            props.onMoveNode(nodeDrag.sourceId, targetId, targetIndex ?? undefined);
          }
          else if (!nodeDrag.dragging) {
            if (nodeDrag.originNodeId !== null && tree.nodes[nodeDrag.originNodeId] !== undefined) selectNodeAfterAbort(nodeDrag.originNodeId);
            else {
              abortFixedExpansion();
              props.onClearSelection();
            }
          }
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
          setCanvasMode("material");
          if (originNodeId !== null && tree.nodes[originNodeId] !== undefined) {
            selectNodeAfterAbort(originNodeId);
          } else {
            abortFixedExpansion();
            props.onClearSelection();
          }
        }
        suppressClickRef.current = true;
        updateViewport({ type: "pointer-up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {currentTransformChange === null ? null : (
        <span className="visually-hidden" key={currentTransformChange.id} role="status">
          {materialTextSuccessAnnouncement(currentTransformChange.motionHint, props.locale)}
        </span>
      )}
      <PaperTexture />
      <header className="matter-header" data-canvas-interactive>
        <a className="matter-brand" href="https://www.ptoq.io/" aria-label="p to q — Matter">
          <Image
            alt="[p → q]"
            className="matter-brand__logo"
            height={235}
            src={`${matterBasePath}/matter-ui/ptoq-logo.png`}
            unoptimized
            width={726}
          />
        </a>
        <span aria-hidden="true" className="matter-brand__divider">/</span>
        <span className="matter-brand__product">matter</span>
      </header>
      <MaterialFiles
        archive={archiveAfterAbort}
        documentEpoch={props.documentEpoch}
        interactionPending={interactionPending || lasso.active}
        lassoSelectedNodeIds={lassoSelectedNodeIds}
        labels={labelByNodeId}
        labelOrigins={labelOriginByNodeId}
        locale={props.canvasPreferences.preferences.language}
        navigation={navigation}
        heldAsideNodeIds={workingContext.heldAsideNodeIds}
        heldAsideRootIds={heldAsideRootIds}
        onFocusNode={(nodeId) => {
          abortFixedExpansion();
          focusWorkingNode(nodeId);
        }}
        onRenameNode={labels.rename}
        onRenameDocument={(title) => {
          abortFixedExpansion();
          props.onRenameDocument(title);
        }}
        onResetNodeName={labels.resetName}
        onRestoreNode={(nodeId) => {
          abortFixedExpansion();
          restoreWorkingNode(nodeId);
        }}
        onSelectNode={selectNodeAfterAbort}
        onToggleHeldAside={(nodeId) => {
          abortFixedExpansion();
          toggleHeldAside(nodeId);
        }}
        onVisibleNodes={labels.observe}
        persistence={props.persistence}
        tree={tree}
      />
      <ToolRail
        interactionPending={interactionPending}
        lassoActive={lasso.active}
        lassoAvailable={workingContext.activeNodeIds.size > 0 && (lasso.active || activeLayout !== null)}
        onLasso={() => {
          abortFixedExpansion();
          if (lasso.active) {
            lasso.deactivate();
            setCanvasMode("material");
            return;
          }
          if (activeLayout !== null) {
            setCanvasMode("material");
            lasso.activate();
          }
        }}
        onMove={() => {
          abortFixedExpansion();
          if (canvasMode === "pan" && !lasso.active) {
            setCanvasMode("material");
            return;
          }
          lasso.deactivate();
          setCanvasMode("pan");
        }}
        onIntent={(intent) => {
          abortFixedExpansion();
          dispatchToolIntent(intent, props);
        }}
        onVoice={() => {
          if (textSwapSelection !== null || textSwap.state.phase !== "idle") {
            abortElasticExpansion();
            props.admission.discardPendingRepairs();
            setTypedTextSwap(null);
            if (textSwap.state.phase === "recording") {
              textSwap.stopRecording();
            } else if (
              textSwap.state.phase === "permission" ||
              textSwap.state.phase === "transcribing" ||
              textSwap.state.phase === "pending"
            ) {
              textSwap.cancel();
            } else if (textSwapRetryAvailable) {
              textSwap.retry();
            } else if (textSwap.state.phase === "idle") {
              if (textSwap.enter()) textSwap.startRecording();
            } else {
              textSwap.startRecording();
            }
            return;
          }
          abortFixedExpansion();
          if (props.admission.state.phase === "recording") {
            props.admission.stop();
          } else if (props.admissionAnchor !== null) {
            // Recording and lasso are mutually exclusive handles; clear the
            // visual selection mode before the admission interaction starts.
            if (lasso.active) lasso.deactivate();
            props.admission.start(props.admissionAnchor);
          }
        }}
        surface={toolSurface}
        panActive={!lasso.active && canvasMode === "pan"}
        voiceActive={props.admission.state.phase === "recording" || textSwapActive}
        voiceAvailable={voiceAvailable}
        // A navigation restriction must be named as one. The generic build
        // limitation is the last branch, because reaching for it first told a
        // person in focus view that the preview cannot record at all — and left
        // both navigation explanations unreachable.
        voiceLabel={
          textSwap.state.phase === "permission"
            ? "Cancel rewrite microphone request"
            : textSwap.state.phase === "recording"
              ? "Stop rewrite direction"
              : textSwap.state.phase === "transcribing" || textSwap.state.phase === "pending"
                ? "Cancel selected language rewrite"
                : textSwapRetryAvailable
                  ? "Retry selected language rewrite"
                  : textSwapSelection !== null
                  ? "Rewrite selected language"
          : props.admission.state.phase === "recording"
            ? "Stop recording"
            : props.admissionAnchor?.kind === "root"
            ? "Record a root thought"
            : props.admissionAnchor?.kind === "child" && props.admissionAnchor.parentNodeId === tree.rootId
              ? "Record a top-level thought"
              : props.admissionAnchor?.kind === "child"
                ? "Record a thought below the selected material"
              : navigation.mode === "focus"
                ? "Voice admission unavailable in focus view"
                : voiceReadiness.status === "checking"
                  ? "Preparing voice input"
                  : !voiceAdmissionIsEnabled() || voiceReadiness.status !== "ready"
                  ? "Voice admission is unavailable in this preview"
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
        <AmbientWorkbench
          enabled={canvasPreferences.preferences.leafFx}
          navigationActive={wheelMotionActive || viewport.gesture?.dragging === true}
        />
        <CanvasRuling
          active={!canvasPreferences.preferences.leafFx}
          viewport={{ x: viewport.x, y: viewport.y, zoom: viewport.zoom }}
        />
        {lasso.selections.length > 1 ? (
          <div
            aria-live="polite"
            className="lasso-selection-count"
            data-canvas-interactive
            data-selection-count={lasso.selections.length}
          >
            {props.locale === "zh-CN"
              ? `已选 ${lasso.selections.length} 段文字`
              : props.locale === "zh-TW"
                ? `已選 ${lasso.selections.length} 段文字`
                : props.locale === "ja-JP"
                  ? `${lasso.selections.length} 件を選択`
                  : props.locale === "de-DE"
                    ? `${lasso.selections.length} Passagen ausgewählt`
                    : `${lasso.selections.length} passages selected`}
          </div>
        ) : null}
        {projection.length === 0 ? (
          <p className="matter-document__empty">
            {navigation.mode === "focus" ? "This focus is no longer available." : "No material yet."}
          </p>
        ) : (
          <div className="matter-world" style={worldStyle}>
          <div
            aria-busy={activeLayout === null || persistenceLoading || undefined}
            className="matter-canvas"
            ref={canvasRef}
          >
            <CanvasThoughtList
              documentEpoch={props.documentEpoch}
              interactionPending={interactionPending}
              lassoSelection={stretchSelection}
              lassoSelections={lasso.selections}
              lassoSourceText={lasso.sourceText}
              navigation={navigation}
              onSelectNode={selectNodeAfterAbort}
              activeNodeIds={workingContext.activeNodeIds}
              heldAsideNodeIds={workingContext.heldAsideNodeIds}
              projection={projection}
              repairPresentations={props.admission.repairPresentations}
              splitProjectionRef={splitProjectionRef}
              transformChange={currentTransformChange}
              transformStatus={transformState.phase !== "idle" && transformState.basis !== null
                ? {
                    nodeId: transformState.basis.selection.nodeId,
                    phase: transformState.phase,
                    text: stretchStatusText(transformState.phase, props.locale),
                    announce: !lassoHasSelectionGeometry,
                  }
                : textSwap.state.phase !== "idle" &&
                    textSwap.state.phase !== "success" && textSwap.state.phase !== "stale"
                  ? {
                      nodeId: textSwap.state.basis.selection.nodeId,
                      phase: textSwap.state.phase === "error" ? "error" : "requesting",
                      text: textSwapStatusText(textSwap.state, props.locale),
                      announce: !lassoHasSelectionGeometry,
                    }
                  : null}
              tree={tree}
            />
            <AdmissionFeedback
              anchor={admissionAnchor}
              parentBox={admissionParentBox}
              controller={props.admission}
              locale={props.locale}
              onHeightChange={setAdmissionFeedbackHeight}
            />
          </div>
          </div>
        )}
        {nodeActionsEnabled ? (
          <NodeActionLens
            activeNodeIds={workingContext.activeNodeIds}
            canvasRef={canvasRef}
            documentRef={documentRef}
            enabled
            geometryKey={`${activeLayout?.layoutEpoch ?? 0}:${viewport.x}:${viewport.y}:${viewport.zoom}:${navigation.mode}`}
            interaction="idle"
            key={`${props.documentEpoch}:${tree.revision}:${workingContextState.epoch}:${navigation.mode}`}
            navigation={navigation}
            onIntent={handleNodeActionIntent}
            tree={tree}
          />
        ) : null}
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
        <CanvasChrome
          {...canvasPreferences}
          inquiryContext={projectInquiryPayload}
          inquiryRecord={inquiryRecord}
          onInquiryOpen={abortFixedExpansion}
        />
      </section>
      <LassoOverlay
        active={lasso.active}
        drawing={lasso.drawing}
        closurePathRef={lasso.closurePathRef}
        inkRef={lasso.inkRef}
        inkPathRef={lasso.inkPathRef}
        particleCanvasRef={lasso.particleCanvasRef}
        rects={lasso.selectionSetRects.length > 0 ? lasso.selectionSetRects : lasso.selectionRects}
        selectedText={lasso.selection?.selectedText ?? null}
        elasticRef={elasticRef}
        locale={props.locale}
        onBeginAdjustment={beginStretchAdjustment}
        onPreciseGesture={props.admission.discardPendingRepairs}
        onSuppressCompatibilityClick={suppressCompatibilityClick}
        ratio={stretchRatio}
        status={transformState.phase}
        stretchVisible={stretchSelection !== null && !textSwapActive}
        textSwapState={textSwap.state}
        textSwapEligible={textSwapSelection !== null && !elasticLanguageActive}
        onTextSwapRetry={textSwap.retry}
        typedTextSwap={currentTypedTextSwap}
        onStartTypedTextSwap={startTypedTextSwap}
        onChangeTypedTextSwap={(value) => setTypedTextSwap((current) => current === null
          ? null
          : { ...current, value: Array.from(value).slice(0, 240).join("") })}
        onCancelTypedTextSwap={cancelTypedTextSwap}
        onSubmitTypedTextSwap={submitTypedTextSwap}
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
  documentEpoch,
  interactionPending,
  lassoSelection,
  lassoSelections,
  lassoSourceText,
  navigation,
  onSelectNode,
  activeNodeIds,
  heldAsideNodeIds,
  projection,
  repairPresentations,
  splitProjectionRef,
  transformChange,
  transformStatus,
  tree,
}: {
  documentEpoch: number;
  interactionPending: boolean;
  lassoSelection: ReturnType<typeof useLasso>["selection"];
  lassoSelections: ReturnType<typeof useLasso>["selections"];
  lassoSourceText: string | null;
  navigation: NavigationState;
  onSelectNode: (nodeId: string) => void;
  activeNodeIds: ReadonlySet<string>;
  heldAsideNodeIds: ReadonlySet<string>;
  projection: readonly LayoutProjectionItem[];
  repairPresentations: AdmissionController["repairPresentations"];
  splitProjectionRef: React.RefObject<HTMLDivElement | null>;
  transformChange: MaterialTextCommittedChange | null;
  transformStatus: Readonly<{
    nodeId: string;
    phase: "requesting" | "error";
    text: string;
    announce: boolean;
  }> | null;
  tree: ThoughtTree;
}) {
  const lassoSelectedNodeIds = useMemo(
    () => new Set(lassoSelections.map(({ nodeId }) => nodeId)),
    [lassoSelections],
  );
  const repairPresentationScope = { treeId: tree.id, documentEpoch };
  const handleThoughtClick = useCallback((event: ReactMouseEvent<HTMLOListElement>) => {
    if (interactionPending) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-thought-text-id]")
      : null;
    const nodeId = target?.dataset.thoughtTextId;
    if (nodeId !== undefined && activeNodeIds.has(nodeId) && event.currentTarget.contains(target)) onSelectNode(nodeId);
  }, [activeNodeIds, interactionPending, onSelectNode]);

  return (
    <ol className="spatial-thoughts" onClick={handleThoughtClick}>
      {projection.map(({ node, parentId }) => {
        const isSelected = node.id === navigation.selectedNodeId;
        const isHeldAside = heldAsideNodeIds.has(node.id);
        const isFocused = navigation.mode === "focus" && node.id === navigation.focusNodeId;
        const isProjected = lassoSelection?.nodeId === node.id && lassoSourceText === node.text;
        const isLassoSelected = lassoSelectedNodeIds.has(node.id);
        const repairChange = repairPresentations.get(node.id);
        const isRepairSettling = repairPresentations.size > 0 &&
          isRepairPresentationCurrent(repairChange, repairPresentationScope, tree);
        const isTransformSettling = transformChange?.nodeId === node.id &&
          isTransformPresentationCurrent(transformChange, repairPresentationScope, tree);
        const isTransformPending = transformStatus?.nodeId === node.id;
        const materialText = isTransformSettling
          ? <TransformingMaterialText change={transformChange} text={node.text} />
          : (
              <RepairingMaterialText
                change={isRepairSettling ? repairChange : undefined}
                text={node.text}
              />
            );
        const languageProjection = isProjected && lassoSelection !== null
          ? projectLanguageAroundSelection(node.text, lassoSelection)
          : null;
        return (
          <li
            className="spatial-thought"
            data-focused={isFocused || undefined}
            data-context-excluded={isHeldAside || undefined}
            data-layout-node-id={node.id}
            data-selected={isSelected || undefined}
            data-lasso-selected={isLassoSelected || undefined}
            data-thought-id={node.id}
            data-parent-id={parentId ?? undefined}
            data-tree-parent-id={node.parentId ?? undefined}
            data-movable={node.parentId !== null || undefined}
            data-material-motion={isTransformSettling ? "transform" : isRepairSettling ? "repair" : undefined}
            data-transform-phase={isTransformPending ? transformStatus.phase : undefined}
            key={node.id}
          >
            <button
              aria-pressed={isSelected}
              aria-keyshortcuts={isHeldAside ? undefined : "ArrowRight"}
              className="spatial-thought__text"
              data-thought-text-id={node.id}
              data-visual-projection={isProjected || undefined}
              disabled={isHeldAside}
              type="button"
            >
              {isSelected
                ? <span className="spatial-thought__label">{materialText}</span>
                : materialText}
            </button>
            {isTransformPending && transformStatus.announce ? (
              <span aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">
                {transformStatus.text}
              </span>
            ) : null}
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

function publishNodeDragTarget(
  gesture: NodeDragGesture,
  targetElement: HTMLElement | null,
  targetId: string | null,
  targetIndex: number | null,
  targetMode: NodeDropMode | null,
  shell: HTMLElement,
): void {
  if (gesture.targetElement !== targetElement || gesture.targetMode !== targetMode) {
    if (gesture.targetElement !== null) delete gesture.targetElement.dataset.dragOver;
    if (targetElement !== null && targetMode !== null) targetElement.dataset.dragOver = targetMode;
  }
  gesture.targetElement = targetElement;
  gesture.targetId = targetId;
  gesture.targetIndex = targetIndex;
  gesture.targetMode = targetMode;
  if (targetMode === null) delete shell.dataset.nodeDropMode;
  else shell.dataset.nodeDropMode = targetMode;
}

function publishCanvasGeometry(
  canvas: HTMLDivElement,
  elements: NodeListOf<HTMLElement>,
  layout: ColumnarLayout,
): boolean {
  // Do not mark a partial DOM as geometrically valid. This cannot happen for
  // one synchronous React commit, but the guard makes a future render-edge
  // refactor fail closed rather than offer stale pointer geometry.
  if (elements.length !== layout.boxes.length) return false;
  for (let index = 0; index < layout.boxes.length; index += 1) {
    if (elements[index]?.dataset.layoutNodeId !== layout.boxes[index]?.nodeId) return false;
  }

  canvas.style.setProperty("--matter-canvas-width", `${layout.bounds.width}px`);
  canvas.style.setProperty("--matter-canvas-height", `${layout.bounds.height}px`);
  for (let index = 0; index < layout.boxes.length; index += 1) {
    const box = layout.boxes[index];
    const element = elements[index];
    if (box !== undefined && element !== undefined) {
      element.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    }
  }
  return true;
}

function retainBoundedCache<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > 3) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) return;
    cache.delete(oldestKey);
  }
}

function LassoOverlay({
  active,
  drawing,
  closurePathRef,
  inkRef,
  inkPathRef,
  particleCanvasRef,
  rects,
  selectedText,
  elasticRef,
  locale,
  onBeginAdjustment,
  onPreciseGesture,
  onSuppressCompatibilityClick,
  ratio,
  status,
  stretchVisible,
  textSwapState,
  textSwapEligible,
  onTextSwapRetry,
  typedTextSwap,
  onStartTypedTextSwap,
  onChangeTypedTextSwap,
  onCancelTypedTextSwap,
  onSubmitTypedTextSwap,
  textColumn,
  stretch,
}: {
  active: boolean;
  drawing: boolean;
  closurePathRef: React.RefObject<SVGPathElement | null>;
  inkRef: React.RefObject<SVGSVGElement | null>;
  inkPathRef: React.RefObject<SVGPathElement | null>;
  particleCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  rects: readonly { x: number; y: number; width: number; height: number }[];
  selectedText: string | null;
  elasticRef: React.RefObject<HTMLDivElement | null>;
  locale: CanvasLanguage;
  onBeginAdjustment: () => void;
  onPreciseGesture: () => void;
  onSuppressCompatibilityClick: () => void;
  ratio: number | null;
  status: "idle" | "requesting" | "error";
  stretchVisible: boolean;
  textSwapState: TextSwapController["state"];
  textSwapEligible: boolean;
  onTextSwapRetry: () => boolean;
  typedTextSwap: Readonly<{ selectionKey: string; value: string }> | null;
  onStartTypedTextSwap: () => void;
  onChangeTypedTextSwap: (value: string) => void;
  onCancelTypedTextSwap: () => void;
  onSubmitTypedTextSwap: () => boolean;
  textColumn: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  stretch: ReturnType<typeof useStretch>;
}) {
  const bounds = selectionBounds(rects);
  const descriptionId = useId();
  const textSwapInputId = useId();
  const preview = elasticPreviewGeometry(
    rects,
    stretch.amount,
    clientViewport(),
    textColumn ?? undefined,
    stretch.activeHandle,
    stretch.lastHandle,
    hasCoarsePointer(),
  );
  return (
    <div
      className="lasso-layer"
      data-active={active || undefined}
      data-drawing={drawing || undefined}
      data-selected={selectedText !== null || undefined}
      data-text-swap-phase={textSwapState.phase === "idle" ? undefined : textSwapState.phase}
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
      {bounds === null || !textSwapEligible || textSwapState.phase !== "idle" ? null : (
        <button
          aria-label={textSwapTypeEntryLabel(locale)}
          className="text-swap-type-entry"
          data-canvas-interactive
          onClick={onStartTypedTextSwap}
          style={{
            // Keep the transient no-voice alternative on the material side of
            // the selection. On a 390px surface, placing it after the last
            // glyph moves its hit target under the fixed tool rail.
            left: clampClient(bounds.left - 30, clientViewport()?.left, clientViewport()?.right, 28),
            top: selectionLocalOverlayTop(bounds, 48, 8, clientViewport()),
          }}
          type="button"
        >
          {textSwapTypeEntryShortLabel(locale)}
        </button>
      )}
      {bounds === null || typedTextSwap === null || textSwapState.phase !== "eligible" ? null : (
        <form
          className="text-swap-composer"
          data-canvas-interactive
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitTypedTextSwap();
          }}
          style={{
            left: clampClient(
              (bounds.left + bounds.right) / 2,
              clientViewport()?.left,
              clientViewport()?.right,
              138,
            ),
            top: selectionLocalOverlayTop(bounds, 60, 12, clientViewport()),
          }}
        >
          <label className="visually-hidden" htmlFor={textSwapInputId}>{textSwapTypeEntryLabel(locale)}</label>
          <input
            autoFocus
            dir="auto"
            id={textSwapInputId}
            onChange={(event) => onChangeTypedTextSwap(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              onCancelTypedTextSwap();
            }}
            placeholder={textSwapTypePlaceholder(locale)}
            type="text"
            value={typedTextSwap.value}
          />
          <button
            className="text-swap-composer__cancel"
            onClick={onCancelTypedTextSwap}
            type="button"
          >
            {textSwapCancelLabel(locale)}
          </button>
          <button
            className="text-swap-composer__submit"
            disabled={typedTextSwap.value.trim().length === 0}
            type="submit"
          >
            {textSwapApplyLabel(locale)}
          </button>
        </form>
      )}
      {bounds === null || textSwapState.phase === "idle" ||
      textSwapState.phase === "eligible" || textSwapState.phase === "success" ||
      textSwapState.phase === "stale" ? null : (
        <TextSwapFeedback
          bounds={bounds}
          locale={locale}
          onRetry={onTextSwapRetry}
          state={textSwapState}
        />
      )}
      {bounds === null || !stretchVisible ? null : (
        <>
          <div
            className="elastic-preview"
            data-preview-mode={stretch.amount === 0 ? "neutral" : "expand"}
            data-stretch-handle={stretch.activeHandle ?? stretch.lastHandle ?? "bottom"}
            ref={elasticRef}
            style={{
              "--elastic-anchor-top": `${preview?.topHandle.y ?? bounds.top}px`,
              "--elastic-handle-top": `${preview?.bottomHandle.y ?? bounds.bottom}px`,
              "--elastic-rail-top": `${clampStretchRailTop(
                preview === null ? bounds.bottom : preview.bottomHandle.y - preview.pocketDepth,
                clientViewport(),
              )}px`,
              "--elastic-top-center": `${((preview?.topHandle.x1 ?? bounds.left) + (preview?.topHandle.x2 ?? bounds.right)) / 2}px`,
              "--elastic-bottom-center": `${((preview?.bottomHandle.x1 ?? bounds.left) + (preview?.bottomHandle.x2 ?? bounds.right)) / 2}px`,
              "--pocket-left": `${preview?.pocket.left ?? bounds.left}px`,
              "--pocket-top": `${preview?.pocket.top ?? bounds.bottom}px`,
              "--pocket-width": `${(preview?.pocket.right ?? bounds.right) - (preview?.pocket.left ?? bounds.left)}px`,
              "--pocket-height": `${preview === null ? 0 : preview.pocket.bottom - preview.pocket.top}px`,
              "--elastic-opacity": String(preview?.opacity ?? .08),
            } as CSSProperties}
          >
            <span className="visually-hidden" id={descriptionId}>
              Pull the lower handle down to preview expansion. Release at 15% or more to expand. You can also tap the vertical track to set an amount, then tap the handle to apply it. Arrow, Page Up, Page Down, Home, and End adjust the degree. Enter or Space applies it. Escape resets it.
            </span>
            <span aria-hidden="true" className="language-pocket" />
            {status === "idle" ? null : (
              <span
                aria-hidden="true"
                className="stretch-status-marker"
                data-phase={status}
              >
                {stretchStatusText(status, locale)}
              </span>
            )}
            <StretchAmountRail
              descriptionId={descriptionId}
              locale={locale}
              onBeginAdjustment={onBeginAdjustment}
              onPreciseGesture={onPreciseGesture}
              onSuppressCompatibilityClick={onSuppressCompatibilityClick}
              ratio={ratio}
              status={status}
              stretch={stretch}
            />
            <StretchHandleButton
              descriptionId={descriptionId}
              locale={locale}
              onBeginAdjustment={onBeginAdjustment}
              onPreciseGesture={onPreciseGesture}
              ratio={ratio}
              status={status}
              stretch={stretch}
            />
          </div>
        </>
      )}
      <canvas aria-hidden="true" className="lasso-particles" ref={particleCanvasRef} />
      <svg aria-hidden="true" className="lasso-ink" ref={inkRef}>
        <path className="lasso-ink__trace" ref={inkPathRef} />
        <path className="lasso-ink__closure" ref={closurePathRef} />
      </svg>
    </div>
  );
}

function TextSwapFeedback({
  bounds,
  locale,
  onRetry,
  state,
}: {
  bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  locale: CanvasLanguage;
  onRetry: () => boolean;
  state: Exclude<TextSwapController["state"], { phase: "idle" | "eligible" | "success" | "stale" }>;
}) {
  const viewport = clientViewport();
  const center = clampClient(
    (bounds.left + bounds.right) / 2,
    viewport?.left,
    viewport?.right,
    116,
  );
  const partial = state.phase === "recording" ? state.partialDirection?.trim() : undefined;
  const retryable = state.phase === "error" && state.retryable && state.direction !== undefined;
  const status = textSwapStatusText(state, locale);
  return (
    <div
      className="text-swap-feedback"
      data-canvas-interactive
      data-phase={state.phase}
      style={{ left: center, top: selectionLocalOverlayTop(bounds, 56, 14, viewport) }}
    >
      <span
        aria-hidden="true"
        className="text-swap-feedback__state"
        dir="auto"
      >
        {partial || status}
      </span>
      <span aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">
        {status}
      </span>
      {retryable ? (
        <button
          className="text-swap-feedback__action"
          onClick={() => onRetry()}
          type="button"
        >
          {textSwapRetryLabel(locale)}
        </button>
      ) : null}
    </div>
  );
}

function StretchAmountRail({
  descriptionId,
  locale,
  onBeginAdjustment,
  onPreciseGesture,
  onSuppressCompatibilityClick,
  ratio,
  status,
  stretch,
}: {
  descriptionId: string;
  locale: CanvasLanguage;
  onBeginAdjustment: () => void;
  onPreciseGesture: () => void;
  onSuppressCompatibilityClick: () => void;
  ratio: number | null;
  status: "idle" | "requesting" | "error";
  stretch: ReturnType<typeof useStretch>;
}) {
  const pointerRef = useRef<Readonly<{
    id: number;
    startX: number;
    startY: number;
    tolerance: number;
  }> | null>(null);
  const applyRailAmount = useCallback((clientY: number, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    const amount = stretchAmountFromRailPosition(clientY, rect.top, rect.height);
    if (amount === null) return;
    onBeginAdjustment();
    if (status !== "idle") stretch.reopen();
    onPreciseGesture();
    stretch.setAmount(amount, "bottom");
  }, [onBeginAdjustment, onPreciseGesture, status, stretch]);
  useEffect(() => {
    const clearPointer = () => {
      pointerRef.current = null;
    };
    window.addEventListener("scroll", clearPointer, true);
    window.addEventListener("resize", clearPointer);
    return () => {
      window.removeEventListener("scroll", clearPointer, true);
      window.removeEventListener("resize", clearPointer);
    };
  }, []);
  return (
    <button
      aria-describedby={descriptionId}
      aria-label="Set selected language expansion amount without dragging"
      aria-orientation="vertical"
      aria-valuemax={1}
      aria-valuemin={0}
      aria-valuenow={Number(stretch.amount.toFixed(3))}
      aria-valuetext={stretchValueText(stretch.amount, ratio, locale)}
      className="stretch-amount-rail"
      data-canvas-interactive
      data-phase={status}
      data-stretch-amount={Number(stretch.amount.toFixed(3))}
      data-stretch-mode={stretch.mode}
      onKeyDown={(event) => {
        if (!isStretchInteractionKey(event.key)) return;
        event.preventDefault();
        if (status === "requesting" && (event.key === "Enter" || event.key === " ")) return;
        onBeginAdjustment();
        if (status !== "idle" && event.key !== "Escape") stretch.reopen();
        stretch.keyDown(event.key);
        onPreciseGesture();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!event.isPrimary || event.button !== 0) {
          pointerRef.current = null;
          return;
        }
        pointerRef.current = Object.freeze({
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          tolerance: event.pointerType === "touch"
            ? STRETCH_TOUCH_DEADZONE_PX
            : STRETCH_MOUSE_PEN_DEADZONE_PX,
        });
      }}
      onPointerMove={(event) => {
        const pointer = pointerRef.current;
        if (pointer === null || pointer.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > pointer.tolerance) {
          pointerRef.current = null;
        }
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        pointerRef.current = null;
      }}
      onLostPointerCapture={(event) => {
        event.stopPropagation();
        pointerRef.current = null;
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const pointer = pointerRef.current;
        pointerRef.current = null;
        const primaryRelease = event.isPrimary &&
          (event.pointerType === "touch" || event.button === 0);
        if (!primaryRelease || pointer?.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > pointer.tolerance) return;
        onSuppressCompatibilityClick();
        event.preventDefault();
        applyRailAmount(event.clientY, event.currentTarget);
      }}
      role="slider"
      type="button"
    />
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
  descriptionId,
  locale,
  onBeginAdjustment,
  onPreciseGesture,
  ratio,
  status,
  stretch,
}: {
  descriptionId: string;
  locale: CanvasLanguage;
  onBeginAdjustment: () => void;
  onPreciseGesture: () => void;
  ratio: number | null;
  status: "idle" | "requesting" | "error";
  stretch: ReturnType<typeof useStretch>;
}) {
  return (
    <button
      aria-describedby={descriptionId}
      aria-label="Set selected language expansion with the lower handle"
      aria-orientation="vertical"
      aria-valuemax={1}
      aria-valuemin={0}
      aria-valuenow={Number(stretch.amount.toFixed(3))}
      aria-valuetext={stretchValueText(stretch.amount, ratio, locale)}
      className="stretch-handle stretch-handle--bottom"
      data-canvas-interactive
      data-stretch-amount={Number(stretch.amount.toFixed(3))}
      data-stretch-commit-ready={stretch.amount >= STRETCH_COMMIT_THRESHOLD || undefined}
      data-stretch-ratio={ratio === null ? undefined : Number(ratio.toFixed(3))}
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
        if (stretch.pointerDown("bottom", event)) {
          // Only the primary lower-grip gesture may supersede a pending turn.
          // Rejected secondary or foreign pointers leave its authority intact.
          onBeginAdjustment();
          onPreciseGesture();
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
        if (!isStretchInteractionKey(event.key)) return;
        event.preventDefault();
        if (status === "requesting" && (event.key === "Enter" || event.key === " ")) return;
        onBeginAdjustment();
        if (status !== "idle" && event.key !== "Escape") stretch.reopen();
        stretch.keyDown(event.key);
        onPreciseGesture();
        const control = event.currentTarget;
        // A layout publication can move the control. Preserve the current
        // physical handle rather than querying a duplicate control globally.
        window.requestAnimationFrame(() => {
          if (control.isConnected) control.focus();
        });
      }}
      role="slider"
      type="button"
    >
      <span
        aria-hidden="true"
        className="stretch-handle__ratio"
        data-visible={stretch.amount > 0 || undefined}
      >
        {formatStretchRatio(ratio, locale)}
      </span>
    </button>
  );
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable=true], [role=textbox]") !== null;
}

function hasNativeTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
}

function stretchValueText(
  amount: number,
  ratio: number | null,
  locale: CanvasLanguage,
): string {
  if (amount === 0 || ratio === null) {
    if (locale === "zh-CN") return "尚未设置展开程度";
    if (locale === "zh-TW") return "尚未設定展開程度";
    if (locale === "ja-JP") return "展開量は未設定です";
    if (locale === "de-DE") return "Noch kein Erweiterungsgrad";
    return "No expansion set";
  }
  const ratioText = formatStretchRatio(ratio, locale);
  if (amount < STRETCH_COMMIT_THRESHOLD) {
    if (locale === "zh-CN") return `${ratioText}；未达到 15% 提交阈值`;
    if (locale === "zh-TW") return `${ratioText}；未達到 15% 提交門檻`;
    if (locale === "ja-JP") return `${ratioText}、15%の確定しきい値未満`;
    if (locale === "de-DE") return `${ratioText}; unter der 15-%-Schwelle`;
    return `${ratioText}; below the 15% release threshold`;
  }
  if (locale === "zh-CN") return `${ratioText}；松开或按回车展开`;
  if (locale === "zh-TW") return `${ratioText}；放開或按 Enter 展開`;
  if (locale === "ja-JP") return `${ratioText}、放すかEnterで展開`;
  if (locale === "de-DE") return `${ratioText}; loslassen oder Enter drücken`;
  return `${ratioText}; release or press Enter to expand`;
}

function stretchStatusText(
  status: "requesting" | "error",
  locale: CanvasLanguage,
): string {
  if (status === "requesting") {
    if (locale === "zh-CN" || locale === "zh-TW") return "正在展开";
    if (locale === "ja-JP") return "展開中";
    if (locale === "de-DE") return "Wird erweitert";
    return "Expanding";
  }
  if (locale === "zh-CN") return "未展开，原文保留；再拉一次";
  if (locale === "zh-TW") return "未展開，原文保留；再拉一次";
  if (locale === "ja-JP") return "展開せず原文を保持。もう一度引いてください";
  if (locale === "de-DE") return "Nicht erweitert; Text bleibt. Erneut ziehen";
  return "No change—text kept. Pull again";
}

function textSwapStatusText(
  state: Exclude<TextSwapController["state"], { phase: "idle" | "success" | "stale" }>,
  locale: CanvasLanguage,
): string {
  const kind = state.phase === "permission"
    ? "permission"
    : state.phase === "recording"
      ? "recording"
      : state.phase === "transcribing"
        ? "transcribing"
        : state.phase === "pending"
          ? "pending"
          : state.phase === "error"
            ? "error"
            : "ready";
  const copy = {
    "zh-CN": {
      permission: "等待麦克风",
      recording: "正在听你想怎样换一种说法",
      transcribing: "正在听清方向",
      ready: "改写方向已就绪",
      pending: "正在换个说法",
      error: "没有改写，原文保留",
    },
    "zh-TW": {
      permission: "等待麥克風",
      recording: "正在聽你想怎樣換一種說法",
      transcribing: "正在聽清方向",
      ready: "改寫方向已就緒",
      pending: "正在換一種說法",
      error: "沒有改寫，原文保留",
    },
    "ja-JP": {
      permission: "マイクを待っています",
      recording: "言い換え方を聞いています",
      transcribing: "方向を聞き取っています",
      ready: "言い換えの方向を受け取りました",
      pending: "言い換えています",
      error: "言い換えず、原文を保持しました",
    },
    "de-DE": {
      permission: "Mikrofon wird vorbereitet",
      recording: "Die gewünschte Umformulierung wird gehört",
      transcribing: "Richtung wird verstanden",
      ready: "Richtung ist bereit",
      pending: "Text wird umformuliert",
      error: "Nicht umformuliert; Original bleibt erhalten",
    },
    "en-US": {
      permission: "Waiting for the microphone",
      recording: "Listening for how to reword this",
      transcribing: "Understanding the direction",
      ready: "Rewrite direction is ready",
      pending: "Rewording in place",
      error: "No rewrite—the original is unchanged",
    },
  } satisfies Record<CanvasLanguage, Record<typeof kind, string>>;
  return copy[locale][kind];
}

function textSwapRetryLabel(locale: CanvasLanguage): string {
  if (locale === "zh-CN") return "再试一次";
  if (locale === "zh-TW") return "再試一次";
  if (locale === "ja-JP") return "もう一度試す";
  if (locale === "de-DE") return "Erneut versuchen";
  return "Try again";
}

function textSwapTypeEntryLabel(locale: CanvasLanguage): string {
  if (locale === "zh-CN") return "输入所选文字的改写方向";
  if (locale === "zh-TW") return "輸入所選文字的改寫方向";
  if (locale === "ja-JP") return "選択した文章の言い換え方を入力";
  if (locale === "de-DE") return "Richtung für die Umformulierung eingeben";
  return "Type a rewrite direction for the selected language";
}

function textSwapTypeEntryShortLabel(locale: CanvasLanguage): string {
  if (locale === "zh-CN" || locale === "zh-TW") return "输入";
  if (locale === "ja-JP") return "入力";
  if (locale === "de-DE") return "Tippen";
  return "Type";
}

function textSwapTypePlaceholder(locale: CanvasLanguage): string {
  if (locale === "zh-CN") return "例如：更凝练一些";
  if (locale === "zh-TW") return "例如：更凝練一些";
  if (locale === "ja-JP") return "例：もう少し簡潔に";
  if (locale === "de-DE") return "z. B. etwas knapper";
  return "For example: make it more concise";
}

function textSwapApplyLabel(locale: CanvasLanguage): string {
  if (locale === "zh-CN") return "改写";
  if (locale === "zh-TW") return "改寫";
  if (locale === "ja-JP") return "言い換える";
  if (locale === "de-DE") return "Umformulieren";
  return "Rewrite";
}

function textSwapCancelLabel(locale: CanvasLanguage): string {
  if (locale === "zh-CN" || locale === "zh-TW") return "取消";
  if (locale === "ja-JP") return "キャンセル";
  if (locale === "de-DE") return "Abbrechen";
  return "Cancel";
}

function materialTextSuccessAnnouncement(
  motionHint: MaterialTextCommittedChange["motionHint"],
  locale: CanvasLanguage,
): string {
  if (motionHint === "settle") {
    if (locale === "zh-CN") return "已换一种说法，可撤销。";
    if (locale === "zh-TW") return "已換一種說法，可復原。";
    if (locale === "ja-JP") return "選択した文章を言い換えました。元に戻せます。";
    if (locale === "de-DE") return "Ausgewählten Text umformuliert. Rückgängig ist verfügbar.";
    return "Reworded selected passage. Undo is available.";
  }
  if (locale === "zh-CN") return "已展开所选文字，可撤销。";
  if (locale === "zh-TW") return "已展開所選文字，可復原。";
  if (locale === "ja-JP") return "選択した文章を展開しました。元に戻せます。";
  if (locale === "de-DE") return "Ausgewählten Text erweitert. Rückgängig ist verfügbar.";
  return "Expanded selected passage. Undo is available.";
}

function formatStretchRatio(
  ratio: number | null,
  locale: CanvasLanguage = "en-US",
): string {
  if (ratio === null) return "";
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
  return `≈${value}×`;
}

function eligibleStretchSelection(input: Readonly<{
  candidate: SegmentSelection | null;
  currentText: string | null;
  focusView: boolean;
  tree: ThoughtTree;
}>): SegmentSelection | null {
  const { candidate } = input;
  if (!input.focusView || candidate === null) return null;
  const node = input.tree.nodes[candidate.nodeId];
  if (
    node === undefined ||
    input.currentText !== node.text ||
    node.text.slice(candidate.start, candidate.end) !== candidate.selectedText
  ) return null;
  const exactSegment = segmentText(node.text).some(
    (segment) => segment.start === candidate.start && segment.end === candidate.end,
  );
  if (!exactSegment) return null;
  return deriveExpandInPlaceLength(
    candidate.selectedText,
    node.text.slice(0, candidate.start),
    node.text.slice(candidate.end),
    1,
  ) === null ? null : candidate;
}

function eligibleTextSwapSelection(input: Readonly<{
  candidate: SegmentSelection | null;
  currentText: string | null;
  focusView: boolean;
  tree: ThoughtTree;
}>): SegmentSelection | null {
  const { candidate } = input;
  if (!input.focusView || candidate === null) return null;
  const node = input.tree.nodes[candidate.nodeId];
  if (
    node === undefined ||
    input.currentText !== node.text ||
    node.text.slice(candidate.start, candidate.end) !== candidate.selectedText ||
    !segmentText(node.text).some(
      (segment) => segment.start === candidate.start && segment.end === candidate.end,
    )
  ) return null;
  return deriveTextSwapLength(
    candidate.selectedText,
    node.text.slice(0, candidate.start),
    node.text.slice(candidate.end),
  ) === null ? null : candidate;
}

function stretchExpansionRatio(
  tree: ThoughtTree,
  selection: SegmentSelection | null,
  amount: number,
): number | null {
  if (selection === null || amount <= 0) return null;
  const node = tree.nodes[selection.nodeId];
  if (node === undefined) return null;
  const length = deriveExpandInPlaceLength(
    selection.selectedText,
    node.text.slice(0, selection.start),
    node.text.slice(selection.end),
    amount,
  );
  return length === null ? null : length.targetGraphemes / length.sourceGraphemes;
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

function hasCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function clampStretchRailTop(
  value: number,
  viewport: ReturnType<typeof clientViewport>,
): number {
  if (viewport === undefined) return value;
  const minimum = viewport.top + 8;
  const maximum = Math.max(minimum, viewport.bottom - STRETCH_TRAVEL_PX - 8);
  return Math.max(minimum, Math.min(maximum, value));
}

function selectionLocalOverlayTop(
  bounds: Readonly<{ top: number; bottom: number }>,
  height: number,
  gap: number,
  viewport: ReturnType<typeof clientViewport>,
): number {
  const below = bounds.bottom + gap;
  if (viewport === undefined) return below;
  const minimum = viewport.top + 8;
  const maximum = Math.max(minimum, viewport.bottom - height - 8);
  if (below <= maximum) return below;
  const above = bounds.top - height - gap;
  return Math.max(minimum, Math.min(maximum, above));
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
  locale,
  onHeightChange,
}: {
  anchor: InteractionAdmissionAnchor | null;
  parentBox: Readonly<{ nodeId: string; x: number; y: number; width: number; height: number }> | null;
  controller: AdmissionController;
  locale: CanvasLanguage;
  onHeightChange: (height: number) => void;
}) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const phase = controller.state.phase;
  useLayoutEffect(() => {
    const element = feedbackRef.current;
    if (element === null) {
      onHeightChange(0);
      return;
    }
    const publishHeight = () => onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    publishHeight();
    if (typeof ResizeObserver === "undefined") return () => onHeightChange(0);
    const observer = new ResizeObserver(publishHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [anchor, onHeightChange, phase]);
  if (controller.state.phase === "idle" || anchor === null) return null;
  const style = {
    transform: `translate3d(${parentBox?.x ?? 0}px, ${(parentBox?.y ?? 0) + (parentBox?.height ?? 0) + 18}px, 0)`,
  } as CSSProperties;
  const copy = admissionFeedbackMessage(locale, controller.state);
  const actions = admissionFeedbackActions(locale);
  return (
    <div
      aria-live={phase === "error" ? undefined : "polite"}
      className="admission-feedback"
      data-admission-anchor-node-id={parentBox?.nodeId}
      data-canvas-interactive
      data-phase={phase}
      ref={feedbackRef}
      role={phase === "error" ? "alert" : "status"}
      style={style}
    >
      <span aria-hidden="true" className="admission-feedback__signal" />
      <span>{copy}</span>
      {phase === "recording" &&
      "transcript" in controller.state &&
      controller.state.transcript ? (
        <span className="admission-feedback__preview" dir="auto">{controller.state.transcript}</span>
      ) : null}
      {phase === "recording" ? (
        <button onClick={controller.stop} type="button">{actions.stop}</button>
      ) : null}
      {phase === "error" ? (
        <>
          <button onClick={controller.retry} type="button">{actions.retry}</button>
          <button onClick={controller.dismiss} type="button">{actions.dismiss}</button>
        </>
      ) : (
        <button onClick={controller.cancel} type="button">{actions.cancel}</button>
      )}
    </div>
  );
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
  const toolTargetNode = resolveToolTargetNode(navigation, tree);
  if (
    !isCurrentToolIntent(
      {
        view: navigation.mode,
        selected:
          toolTargetNode === null
            ? null
            : {
                nodeId: toolTargetNode.id,
                hasChildren: toolTargetNode.children.length > 0,
                isFolded: navigation.foldedNodeIds.has(toolTargetNode.id),
              },
        canUndo: props.canUndo,
        interaction: "idle",
      },
      intent,
    )
  ) {
    return;
  }
  applyToolIntent(intent, props);
}

function applyToolIntent(intent: ToolIntent, props: RootedMaterialProps) {
  const { navigation, tree } = props;
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

function resolveToolTargetNode(
  navigation: NavigationState,
  tree: ThoughtTree,
) {
  const selectedNode = navigation.selectedNodeId === null
    ? null
    : tree.nodes[navigation.selectedNodeId] ?? null;
  if (selectedNode !== null) return selectedNode;
  if (navigation.mode !== "full" || tree.rootId === null) return null;
  const root = tree.nodes[tree.rootId] ?? null;
  if (root === null || !isDocumentRoot(tree, root.id)) return root;
  const firstId = root.children[0];
  return firstId === undefined ? null : tree.nodes[firstId] ?? null;
}

function voiceAdmissionIsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED !== "false";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool intent: ${String(value)}`);
}
