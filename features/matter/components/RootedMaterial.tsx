"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { NavigationState } from "../runtime/navigation";
import { layoutColumnarTree } from "../layout/columnar-layout";
import type { ColumnarLayout, LayoutNode } from "../layout/model";
import type { TypographyHeightAuthorityToken } from "../layout/typography-height-ledger";
import { projectVerticalPresentationBand } from "../layout/vertical-presentation-band";
import type { ThoughtTree } from "../tree/model";
import { isDocumentRoot } from "../tree/document-root";
import { projectTools } from "../tools/project-tools";
import { projectToolSurface } from "../tools/project-tool-surface";
import { isCurrentToolIntent } from "../tools/validate-intent";
import type { ToolIntent } from "../tools/model";
import { ToolRail } from "./ToolRail";
import { PaperTexture } from "./PaperTexture";
import {
  planCanvasViewportForClientRect,
  projectCanvasAttentionField,
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
  isStretchInteractionKey,
} from "../runtime/stretch-interaction";
import {
  elasticPreviewGeometry,
  prepareElasticPreviewSource,
  projectElasticPreview,
} from "../interaction/elastic-preview";
import { projectLanguageAroundSelection } from "../material/language-projection";
import type { LanguageProjection } from "../material/language-projection";
import {
  validateSelection,
  type SegmentSelection,
} from "../material/text-segments";
import { deriveExpandInPlaceLength } from "../protocol/expand-in-place-policy";
import {
  clientDepthToWorld,
  projectLanguageFlow,
} from "../interaction/language-flow";
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
import { useFixedExpandTurn } from "./use-fixed-expand-turn";
import {
  isTransformPresentationCurrent,
  useTransformPresentation,
} from "../interaction/use-transform-presentation";
import type {
  MaterialTextCommittedChange,
  TransformCommittedChange,
} from "../store/matter-store";
import { isRepairPresentationCurrent } from "../interaction/use-repair-presentation";
import { RepairingMaterialText } from "./RepairingMaterialText";
import { TransformingMaterialText } from "./TransformingMaterialText";
import { isCurrentNodeActionIntent } from "../tools/project-node-actions";
import {
  admissionFeedbackActions,
  admissionFeedbackMessage,
} from "./admission-feedback-copy";
import { lassoAccessibilityCopy } from "./lasso-accessibility-copy";
import { voiceToolCopy } from "./voice-tool-copy";
import type { TypographyHeightAuthority } from "./typography-height-authority";

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
  /** Research fixture only. The product renderer remains the complete DOM path. */
  performanceViewport?: Readonly<{
    batchSize: 32;
    source: "viewport-research";
  }>;
};

type PublishedGeometry = {
  heightBasis?: TypographyHeightAuthorityToken;
  key: string;
  layout: ColumnarLayout;
  nodeIds?: readonly string[];
};

type ViewportResearchRuntime = typeof import("./viewport-research-runtime");

type RenderedViewportCamera = Readonly<{
  epoch: string;
  x: number;
  y: number;
  zoom: number;
}>;

type ViewportWindowBasis = Readonly<{
  completePublication: PublishedGeometry;
  documentEpoch: number;
  projection: readonly LayoutProjectionItem[];
  renderedCamera: RenderedViewportCamera;
  windowEpoch: number;
}>;

type ViewportRenderWindow = Readonly<{
  basis: ViewportWindowBasis;
  nodeIds: readonly string[];
}>;

type ViewportGeometryAcknowledgement = Readonly<{
  basis: ViewportWindowBasis;
  nodeIds: readonly string[];
}>;

type PresentationDamage = Readonly<{
  nodeId: string;
  topExtent: number;
  bottomExtent: number;
}>;

type ProjectionHandleReceipt = Readonly<{
  centerX: number;
  selectedTopClient: number;
  selectedBottomClient: number;
  afterTopClient: number;
  selectedTopWorld: number;
  selectedBottomWorld: number;
  afterTopWorld: number;
}>;

type SelectionPreviewMode = "neutral" | "expand";

type IndexCenterRequest = Readonly<{
  afterLayoutEpoch: number;
  documentEpoch: number;
  mode: "full" | "focus";
  nodeId: string;
}>;

function sameViewportCamera(left: CanvasViewportState, right: CanvasViewportState): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom && left.gesture === null;
}

function clearIndexCameraMotion(world: HTMLDivElement | null): void {
  if (world === null) return;
  delete world.dataset.cameraMotion;
  world.style.removeProperty("--index-camera-duration");
}

function readRenderedIndexCamera(
  world: HTMLDivElement | null,
  basis: CanvasViewportState,
): CanvasViewportState | null {
  if (world?.dataset.cameraMotion !== "index") return null;
  try {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
    const zoom = (matrix.a + matrix.d) / 2;
    if (
      !Number.isFinite(matrix.e) ||
      !Number.isFinite(matrix.f) ||
      !Number.isFinite(zoom) ||
      zoom <= 0 ||
      Math.abs(matrix.b) > .001 ||
      Math.abs(matrix.c) > .001 ||
      Math.abs(matrix.a - matrix.d) > .001
    ) return null;
    return Object.freeze({
      ...basis,
      x: Math.round(matrix.e * 1_000) / 1_000,
      y: Math.round(matrix.f * 1_000) / 1_000,
      zoom: Math.round(zoom * 1_000) / 1_000,
      userMoved: true,
    });
  } catch {
    return null;
  }
}

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
  if (props.performanceViewport !== undefined && props.performanceMarking !== true) {
    throw new Error("Viewport research requires the explicit performance fixture.");
  }
  const viewportRenderer = props.performanceViewport?.source === "viewport-research";
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
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutEpochRef = useRef(0);
  const typographyAuthorityRef = useRef<TypographyHeightAuthority | null>(null);
  const viewportWindowEpochRef = useRef(0);
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
  const [viewportResearchRuntime, setViewportResearchRuntime] =
    useState<ViewportResearchRuntime | null>(null);
  const [viewportWindow, setViewportWindow] = useState<ViewportRenderWindow | null>(null);
  const [viewportGeometryAcknowledgement, setViewportGeometryAcknowledgement] =
    useState<ViewportGeometryAcknowledgement | null>(null);
  const failViewportCandidate = useCallback((canvas: HTMLDivElement, code: string) => {
    // Research rendering is fail-closed: stale geometry must lose interaction
    // authority in the same task that detects damage, before React reconciles.
    canvas.inert = true;
    markViewportRendererFailure(canvas, code);
    setViewportGeometryAcknowledgement(null);
    setViewportWindow(null);
    setPublished(null);
  }, []);
  const [languagePresentationDamage, setLanguagePresentationDamage] = useState<PresentationDamage | null>(null);
  const languagePresentationDamageRef = useRef<PresentationDamage | null>(null);
  const [admissionFeedbackHeight, setAdmissionFeedbackHeight] = useState(0);
  const admissionAnchor = props.admission.state.phase === "idle" ? null : props.admission.state.anchor;
  const [canvasNavigationState, setCanvasNavigationState] = useState(
    () => createCanvasNavigationSession(props.documentEpoch),
  );
  const indexCenterRequestRef = useRef<IndexCenterRequest | null>(null);
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
  useLayoutEffect(() => {
    indexCenterRequestRef.current = null;
    clearIndexCameraMotion(worldRef.current);
  }, [props.documentEpoch]);
  const voiceReadiness = useVoiceReadiness();
  const wheelMotionTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const pointerOriginNodeRef = useRef<string | null>(null);
  const lassoClickOriginNodeRef = useRef<string | null>(null);
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
  const publicationKey = viewportRenderer
    ? `${projectionKey}::viewport-research:${measureRevision}`
    : projectionKey;
  const activeWorkingProjection = useMemo(
    () => projection
      .filter(({ node }) => workingContext.activeNodeIds.has(node.id))
      .map(({ node, depth }) => Object.freeze({ nodeId: node.id, depth })),
    [projection, workingContext.activeNodeIds],
  );
  const completePublication = published?.key === publicationKey ? published : null;
  const completeLayout = completePublication?.layout ?? null;
  const viewportWindowIsCurrent = viewportRenderer && completeLayout !== null &&
    viewportWindow?.basis.documentEpoch === props.documentEpoch &&
    viewportWindow.basis.completePublication === completePublication &&
    viewportWindow.basis.projection === projection;
  const viewportGeometryIsCurrent = viewportWindowIsCurrent &&
    viewportGeometryAcknowledgement?.basis === viewportWindow.basis &&
    viewportGeometryAcknowledgement.nodeIds === viewportWindow.nodeIds;
  const activeLayout = viewportRenderer
    ? viewportGeometryIsCurrent ? completeLayout : null
    : completeLayout;
  const renderedProjection = useMemo(() => {
    if (!viewportRenderer) return projection;
    if (!viewportWindowIsCurrent || viewportWindow === null) return Object.freeze([]);
    const visible = new Set(viewportWindow.nodeIds);
    return Object.freeze(projection.filter(({ node }) => visible.has(node.id)));
  }, [projection, viewportRenderer, viewportWindow, viewportWindowIsCurrent]);
  useLayoutEffect(() => {
    const request = indexCenterRequestRef.current;
    if (request === null) return;
    if (
      request.documentEpoch !== props.documentEpoch ||
      tree.nodes[request.nodeId] === undefined
    ) {
      indexCenterRequestRef.current = null;
      return;
    }
    const navigationReady = request.mode === "focus"
      ? navigation.mode === "focus" && navigation.focusNodeId === request.nodeId
      : navigation.mode === "full" && navigation.selectedNodeId === request.nodeId;
    if (!navigationReady || activeLayout === null) return;
    if (wheelMotionActive) return;
    if (activeLayout.layoutEpoch <= request.afterLayoutEpoch) return;
    // The initial font settlement republishes layout below. Centring against a
    // fallback-font column would become stale as soon as that publication lands.
    if (document.fonts?.status === "loading") return;
    if (!activeLayout.boxes.some((box) => box.nodeId === request.nodeId)) {
      indexCenterRequestRef.current = null;
      return;
    }
    const canvas = canvasRef.current;
    const world = worldRef.current;
    if (canvas === null || world === null) return;
    const owner = Array.from(canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]"))
      .find((element) => element.dataset.layoutNodeId === request.nodeId);
    const target = owner?.querySelector<HTMLElement>(".spatial-thought__text") ?? null;
    const visual = clientViewport();
    if (target === null || visual === undefined) {
      indexCenterRequestRef.current = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    const targetFontCssPx = Number.parseFloat(getComputedStyle(target).fontSize);
    const worldRect = world.getBoundingClientRect();
    const documentRect = documentRef.current?.getBoundingClientRect();
    const openIndexRect = shellRef.current
      ?.querySelector<HTMLElement>('.material-files[data-open="true"]')
      ?.getBoundingClientRect();
    const basis = viewport;
    const visualRect = {
      left: visual.left,
      top: visual.top,
      width: visual.right - visual.left,
      height: visual.bottom - visual.top,
    };
    const attentionPoint = documentRect === undefined
      ? undefined
      : projectCanvasAttentionField(
          visualRect,
          {
            left: documentRect.left,
            top: documentRect.top,
            width: documentRect.width,
            height: documentRect.height,
          },
          openIndexRect === undefined
            ? undefined
            : {
                left: openIndexRect.left,
                top: openIndexRect.top,
                width: openIndexRect.width,
                height: openIndexRect.height,
              },
        ) ?? undefined;
    const plan = planCanvasViewportForClientRect(
      basis,
      {
        fontCssPx: targetFontCssPx,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      visualRect,
      { x: worldRect.left - basis.x, y: worldRect.top - basis.y },
      attentionPoint,
    );
    if (plan === null) {
      indexCenterRequestRef.current = null;
      return;
    }
    if (!viewportRenderer && plan.motion === "smooth" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      world.dataset.cameraMotion = "index";
      world.style.setProperty("--index-camera-duration", `${plan.durationMs}ms`);
      // Commit the transition rule before React publishes the new camera.
      void world.getBoundingClientRect();
    } else {
      clearIndexCameraMotion(world);
    }
    setViewport((current) => sameViewportCamera(current, basis) ? plan.state : current);
    if (indexCenterRequestRef.current === request) indexCenterRequestRef.current = null;
  }, [
    activeLayout,
    navigation.focusNodeId,
    navigation.mode,
    navigation.selectedNodeId,
    props.documentEpoch,
    setViewport,
    tree.nodes,
    viewport,
    viewportRenderer,
    wheelMotionActive,
  ]);
  const liveLanguageLayoutBasisRef = useRef<ColumnarLayout | null>(null);
  useLayoutEffect(() => {
    if (viewportRenderer) return;
    const canvas = canvasRef.current;
    if (activeLayout === null || canvas === null) {
      liveLanguageLayoutBasisRef.current = null;
      return;
    }
    const style = getComputedStyle(canvas);
    const nodes = activeLayout.boxes.map((box) => Object.freeze({
      id: box.nodeId,
      parentId: box.parentId,
      depth: box.depth,
      size: Object.freeze({ width: box.width, height: box.height }),
    } satisfies LayoutNode));
    const result = layoutColumnarTree({
      nodes,
      origin: { x: 0, y: 0 },
      layoutEpoch: activeLayout.layoutEpoch,
      columnWidth: readCssPixels(style, "--matter-column-width", 300),
      columnGap: readCssPixels(style, "--matter-column-gap", 72),
      siblingGap: readCssPixels(style, "--matter-sibling-gap", 28),
    });
    liveLanguageLayoutBasisRef.current = result.ok ? result.layout : null;
  }, [activeLayout, viewportRenderer]);
  const publishLiveLanguageLayout = useCallback((damage: PresentationDamage | null) => {
    const basis = liveLanguageLayoutBasisRef.current;
    const canvas = canvasRef.current;
    if (basis === null || canvas === null) return;
    const layout = damage === null
      ? basis
      : projectVerticalPresentationBand(basis, damage);
    if (layout === null) return;
    publishCanvasGeometry(
      canvas,
      canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]"),
      layout,
    );
  }, []);
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
  // Voice admission and selected-language work are mutually exclusive. Giving
  // admission precedence still makes the rendering boundary deterministic if
  // a stale local-lane receipt survives until the next layout publication.
  const presentationDamage = admissionPresentationDamage ?? languagePresentationDamage;
  const stretchInvalidationRef = useRef<() => void>(() => undefined);
  const invalidateStretchGeometry = useCallback((pointerId: number | null) => {
    stretchInvalidationRef.current();
    const shell = shellRef.current;
    if (pointerId !== null && shell?.hasPointerCapture(pointerId)) {
      shell.releasePointerCapture(pointerId);
    }
  }, []);
  const labels = useThoughtLabels({
    tree,
    documentEpoch: props.documentEpoch,
    locale: props.locale,
    enabled: props.performanceMarking !== true,
  });
  const labelByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    if (labels.session.treeId !== tree.id || labels.session.documentEpoch !== props.documentEpoch) {
      return values;
    }
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.label);
    return values;
  }, [labels.session, props.documentEpoch, tree.id]);
  const labelOriginByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    if (labels.session.treeId !== tree.id || labels.session.documentEpoch !== props.documentEpoch) {
      return values;
    }
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.origin);
    return values;
  }, [labels.session, props.documentEpoch, tree.id]);
  const lassoEligibleNodeIds = useMemo<ReadonlySet<string>>(() => {
    if (navigation.mode === "full") return workingContext.activeNodeIds;
    const focusNodeId = navigation.focusNodeId;
    return focusNodeId !== null && workingContext.activeNodeIds.has(focusNodeId)
      ? new Set([focusNodeId])
      : new Set<string>();
  }, [navigation.focusNodeId, navigation.mode, workingContext.activeNodeIds]);
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
    eligibleNodeIds: lassoEligibleNodeIds,
    onGeometryInvalidated: invalidateStretchGeometry,
  });
  const deactivateLasso = lasso.deactivate;
  const clearLassoSelection = lasso.clearSelection;
  const exitLasso = useCallback(() => {
    const pointerId = deactivateLasso();
    clearLassoSelection();
    const shell = shellRef.current;
    if (pointerId !== null && shell?.hasPointerCapture(pointerId)) {
      shell.releasePointerCapture(pointerId);
    }
    setCanvasMode("material");
  }, [clearLassoSelection, deactivateLasso, setCanvasMode]);
  useEffect(() => {
    const exitLassoFromKeyboard = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" || event.defaultPrevented || event.isComposing ||
        !lasso.active || isEditableEventTarget(event.target)
      ) return;
      event.preventDefault();
      exitLasso();
    };
    window.addEventListener("keydown", exitLassoFromKeyboard);
    return () => window.removeEventListener("keydown", exitLassoFromKeyboard);
  }, [exitLasso, lasso.active]);
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
      publishLiveLanguageLayout(null);
      return;
    }
    element.dataset.previewMode = preview.mode;
    const handle = signal.handle ?? "bottom";
    element.dataset.stretchHandle = handle;
    const receipt = projectionHandleReceiptRef.current;
    const selectedTop = receipt?.selectedTopClient ?? preview.sourceBounds.top;
    const selectedBottom = receipt?.selectedBottomClient ?? preview.sourceBounds.bottom;
    const neutral = preview.mode === "neutral";
    const travelDepth = neutral ? 0 : preview.pocketDepth;
    let worldDepth = 0;
    if (split !== null) {
      split.dataset.previewMode = neutral ? "neutral" : "expand";
      split.dataset.stretchHandle = handle;
      worldDepth = clientDepthToWorld(travelDepth, viewport.zoom) ?? 0;
      const selectedTopWorld = receipt?.selectedTopWorld ?? 0;
      const selectedBottomWorld = receipt?.selectedBottomWorld ?? 0;
      const pocketTop = handle === "top"
        ? selectedTopWorld
        : selectedBottomWorld;
      split.style.setProperty("--split-depth", `${worldDepth ?? 0}px`);
      split.style.setProperty("--split-pocket-top", `${pocketTop}px`);
      split.style.setProperty("--split-pocket-depth", `${worldDepth}px`);
      split.style.setProperty("--elastic-opacity", String(preview.opacity));
    }
    if (neutral) {
      publishLiveLanguageLayout(null);
    } else if (split !== null && receipt !== null) {
      const owner = split.closest<HTMLElement>(".spatial-thought");
      const source = owner?.querySelector<HTMLElement>(".spatial-thought__text") ?? null;
      const projectedAfter = split.querySelector<HTMLElement>(".language-split-block--after");
      const flow = source === null ? null : projectLanguageFlow({
        sourceHeight: source.offsetHeight,
        selectedTop: receipt.selectedTopWorld,
        afterNaturalTop: receipt.afterTopWorld,
        afterHeight: projectedAfter?.offsetHeight ?? 0,
        slotDepth: worldDepth,
        handle,
      });
      const nodeId = stretchSelectionRef.current?.nodeId;
      if (flow !== null && nodeId !== undefined) {
        publishLiveLanguageLayout({
          nodeId,
          topExtent: flow.topExtent,
          bottomExtent: flow.bottomExtent,
        });
      }
    }
    const visible = clientViewport();
    // The pure projection owns viewport clamping and deterministic separation;
    // duplicating just the clamp here made the two controls merge at an edge.
    const topY = preview.topHandle.y;
    const bottomY = preview.bottomHandle.y;
    const projectionCenter = preview.mode === "expand" ? receipt?.centerX : undefined;
    const rawTopCenter = projectionCenter ?? (preview.topHandle.x1 + preview.topHandle.x2) / 2;
    const rawBottomCenter = projectionCenter ?? (preview.bottomHandle.x1 + preview.bottomHandle.x2) / 2;
    const topCenter = clampClient(rawTopCenter, visible?.left, visible?.right, 26);
    const bottomCenter = clampClient(rawBottomCenter, visible?.left, visible?.right, 26);
    element.style.setProperty("--elastic-anchor-top", `${topY}px`);
    element.style.setProperty("--elastic-handle-top", `${bottomY}px`);
    element.style.setProperty("--elastic-top-center", `${topCenter}px`);
    element.style.setProperty("--elastic-bottom-center", `${bottomCenter}px`);
    element.style.setProperty("--pocket-left", `${preview.pocket.left}px`);
    element.style.setProperty("--pocket-top", `${handle === "top" ? selectedTop : selectedBottom}px`);
    element.style.setProperty("--pocket-width", `${preview.pocket.right - preview.pocket.left}px`);
    element.style.setProperty("--pocket-height", `${travelDepth}px`);
    element.style.setProperty("--elastic-opacity", String(preview.opacity));
    const controls = element.querySelectorAll<HTMLElement>(".stretch-handle");
    for (const control of controls) {
      control.dataset.stretchAmount = String(Number(signal.amount.toFixed(3)));
      control.setAttribute("aria-valuenow", String(Number(signal.amount.toFixed(3))));
      control.setAttribute("aria-valuetext", stretchValueText(signal.amount, props.locale));
      if (signal.amount >= STRETCH_COMMIT_THRESHOLD) control.dataset.stretchCommitReady = "true";
      else delete control.dataset.stretchCommitReady;
    }
  }, [elasticPreviewSource, props.locale, publishLiveLanguageLayout, viewport.zoom]);
  const navigationKey = `${navigation.mode}:${navigation.focusNodeId ?? ""}:${navigation.selectedNodeId ?? ""}:${Array.from(navigation.foldedNodeIds).sort().join(",")}`;
  const stretchSelection = eligibleStretchSelection({
    candidate: lasso.selections.length === 1 && lasso.selection?.type === "segment-range"
      ? lasso.selection
      : null,
    currentText: lasso.sourceText,
    view: navigation.mode,
    focusNodeId: navigation.focusNodeId,
    activeNodeIds: workingContext.activeNodeIds,
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
  const stretchRecoveryRef = useRef<() => void>(() => undefined);
  const admissionInteractionPending =
    props.admission.state.phase !== "idle" && props.admission.state.phase !== "error";
  const elasticSelection = persistenceLoading || admissionInteractionPending
    ? null
    : stretchSelection;
  const transform = useFixedExpandTurn({
    tree,
    documentEpoch: props.documentEpoch,
    selection: elasticSelection,
    locale: props.locale,
    enabled: elasticSelection !== null,
    interactionScopeKey: `${navigationKey}:${workingContextState.epoch}`,
    commit: props.onTransformCommit,
    onCommitted: publishMaterialTextChange,
    onUnavailable: () => stretchRecoveryRef.current(),
  });
  const {
    cancel: cancelTransform,
    start: startTransform,
    state: transformState,
  } = transform;
  const startFixedExpansion = useCallback((basis: Parameters<typeof startTransform>[0]) => {
    startTransform(basis);
  }, [startTransform]);
  const stretch = useStretch({
    selection: elasticSelection,
    treeId: tree.id,
    revision: tree.revision,
    documentEpoch: props.documentEpoch,
    navigationKey,
    layoutKey: `${activeLayout?.layoutEpoch ?? 0}:${viewport.x}:${viewport.y}:${viewport.zoom}`,
    onPreview: updateElasticPreview,
    onCommit: startFixedExpansion,
  });
  useLayoutEffect(() => {
    stretchRecoveryRef.current = stretch.reopen;
  }, [stretch.reopen]);
  const elasticLanguageActive = stretch.dragging || stretch.amount > 0 ||
    transformState.phase !== "idle";
  const beginStretchAdjustment = useCallback(() => {
    if (transformState.phase === "requesting") cancelTransform();
  }, [cancelTransform, transformState.phase]);
  const abortElasticExpansion = useCallback(() => {
    if (transformState.phase === "requesting") cancelTransform();
    stretch.keyDown("Escape");
  }, [cancelTransform, stretch, transformState.phase]);
  const abortFixedExpansion = abortElasticExpansion;
  const selectionPreviewMode: SelectionPreviewMode = elasticSelection !== null && elasticLanguageActive
    ? "expand"
    : "neutral";
  useEffect(() => {
    if (transformState.phase !== "requesting") return;
    const clearCommittedDegree = (event: KeyboardEvent) => {
      if (event.key === "Escape") stretch.keyDown("Escape");
    };
    window.addEventListener("keydown", clearCommittedDegree);
    return () => window.removeEventListener("keydown", clearCommittedDegree);
  }, [stretch, transformState.phase]);
  const currentTransformChange = isTransformPresentationCurrent(
    transformPresentation.change,
    { treeId: tree.id, documentEpoch: props.documentEpoch },
    tree,
  ) ? transformPresentation.change : null;
  const lassoHasSelectionGeometry = lasso.selectionRects.length > 0;
  const interactionPending = persistenceLoading || admissionInteractionPending;
  const interruptIndexCameraMotion = useCallback(() => {
    const basis = viewport;
    const world = worldRef.current;
    const rendered = readRenderedIndexCamera(world, basis);
    const plannedTransform = world?.style.transform ?? "";
    if (rendered !== null && world !== null) {
      // Pointer ownership and its render-edge measurements continue in this
      // event. Freeze the sampled matrix synchronously so they cannot observe
      // the unpainted destination before React commits the same camera.
      world.style.transform = `translate3d(${rendered.x}px, ${rendered.y}px, 0) scale(${rendered.zoom})`;
    }
    clearIndexCameraMotion(world);
    let adopted = false;
    if (rendered !== null) {
      // Hand a person's next gesture the camera they can actually see, not the
      // unpainted destination React already owns during the CSS transition.
      // Lasso snapshots its viewport epoch in this same pointer event, so the
      // sampled camera must commit before pointer ownership continues.
      flushSync(() => {
        setViewport((current) => {
          if (!sameViewportCamera(current, basis)) return current;
          adopted = true;
          return rendered;
        });
      });
    }
    if (!adopted && rendered !== null && world !== null) {
      world.style.transform = plannedTransform;
    }
    return adopted && rendered !== null ? rendered : basis;
  }, [setViewport, viewport]);
  const selectNodeAfterAbort = useCallback((nodeId: string) => {
    abortFixedExpansion();
    interruptIndexCameraMotion();
    indexCenterRequestRef.current = null;
    props.onSelectNode(nodeId);
  }, [abortFixedExpansion, interruptIndexCameraMotion, props]);
  const focusIndexNodeAfterAbort = useCallback((nodeId: string) => {
    abortFixedExpansion();
    interruptIndexCameraMotion();
    indexCenterRequestRef.current = Object.freeze({
      afterLayoutEpoch: layoutEpochRef.current,
      documentEpoch: props.documentEpoch,
      mode: "focus",
      nodeId,
    });
    requestMeasurement();
    focusWorkingNode(nodeId);
  }, [abortFixedExpansion, focusWorkingNode, interruptIndexCameraMotion, props.documentEpoch]);
  const restoreIndexNodeAfterAbort = useCallback((nodeId: string) => {
    abortFixedExpansion();
    interruptIndexCameraMotion();
    indexCenterRequestRef.current = Object.freeze({
      afterLayoutEpoch: layoutEpochRef.current,
      documentEpoch: props.documentEpoch,
      mode: "full",
      nodeId,
    });
    requestMeasurement();
    restoreWorkingNode(nodeId);
  }, [abortFixedExpansion, interruptIndexCameraMotion, props.documentEpoch, restoreWorkingNode]);
  const selectIndexNodeAfterAbort = useCallback((nodeId: string) => {
    abortFixedExpansion();
    interruptIndexCameraMotion();
    indexCenterRequestRef.current = Object.freeze({
      afterLayoutEpoch: layoutEpochRef.current,
      documentEpoch: props.documentEpoch,
      mode: "full",
      nodeId,
    });
    requestMeasurement();
    props.onSelectNode(nodeId);
  }, [abortFixedExpansion, interruptIndexCameraMotion, props]);
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
    const selected = projectionElement?.querySelector<HTMLElement>(".language-split-block--selected");
    const source = projectionElement?.querySelector<HTMLElement>(".language-split-source");
    const afterGhost = projectionElement?.querySelector<HTMLElement>(".language-split-after-ghost");
    const projectedAfter = projectionElement?.querySelector<HTMLElement>(".language-split-block--after");
    if (projectionElement == null || selected == null || source == null) {
      projectionHandleReceiptRef.current = null;
      return;
    }
    const projectionRect = projectionElement.getBoundingClientRect();
    const selectedRange = rangeBoundsAroundContents(selected);
    const afterRange = afterGhost == null ? null : rangeAroundContents(afterGhost);
    const projectedAfterRange = projectedAfter == null ? null : rangeAroundContents(projectedAfter);
    const sourceRect = source.getBoundingClientRect();
    const slot = projectionElement.querySelector<HTMLElement>(".language-split-slot");
    const currentHandle = stretch.activeHandle ?? stretch.lastHandle;
    // The upper-grip projection moves the source copy down. Recover natural
    // coordinates before freezing the next receipt so repeated keyboard steps,
    // zoom, or a settled remeasurement cannot compound that presentation shift.
    const sourceOffsetClient = selectionPreviewMode === "expand" && currentHandle === "top"
      ? slot?.getBoundingClientRect().height ?? 0
      : 0;
    const selectedTopClient = (selectedRange?.top ?? sourceRect.top) - sourceOffsetClient;
    const selectedBottomClient = (selectedRange?.bottom ?? sourceRect.bottom) - sourceOffsetClient;
    const afterTopClient = (afterRange?.top ?? sourceRect.bottom) - sourceOffsetClient;
    const selectedTop = clientDepthToWorld(
      Math.max(0, selectedTopClient - projectionRect.top),
      viewport.zoom,
    ) ?? 0;
    const afterTop = clientDepthToWorld(
      Math.max(0, afterTopClient - projectionRect.top),
      viewport.zoom,
    ) ?? 0;
    const selectedBottom = clientDepthToWorld(
      Math.max(0, selectedBottomClient - projectionRect.top),
      viewport.zoom,
    ) ?? selectedTop;
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
      selectedBottomClient,
      afterTopClient,
      selectedTopWorld: selectedTop,
      selectedBottomWorld: selectedBottom,
      afterTopWorld: afterTop,
    });
    if (selectionPreviewMode === "expand") {
      updateElasticPreview({
        amount: stretch.amount,
        handle: stretch.activeHandle ?? stretch.lastHandle,
        dragging: stretch.dragging,
      });
    }
  }, [activeLayout?.layoutEpoch, lasso.selection, selectionPreviewMode, stretch.activeHandle, stretch.amount, stretch.dragging, stretch.lastHandle, updateElasticPreview, viewport.x, viewport.y, viewport.zoom]);
  useLayoutEffect(() => {
    const projectionElement = splitProjectionRef.current;
    const owner = projectionElement?.closest<HTMLElement>(".spatial-thought");
    // Hot pointer movement publishes disposable DOM geometry through the same
    // pure layout policy. A React layout receipt would invalidate the gesture,
    // so canonical state publication still waits for pointer settlement.
    if (selectionPreviewMode === "expand" && stretch.dragging) return;
    let nextDamage: PresentationDamage | null = null;
    if (selectionPreviewMode === "expand") {
      if (projectionElement == null || owner == null) return;
      const source = owner.querySelector<HTMLElement>(".spatial-thought__text");
      const slot = projectionElement.querySelector<HTMLElement>(".language-split-slot");
      const receipt = projectionHandleReceiptRef.current;
      if (source === null || slot === null || receipt === null) return;
      const projectedAfter = projectionElement.querySelector<HTMLElement>(".language-split-block--after");
      const flow = projectLanguageFlow({
        sourceHeight: source.offsetHeight,
        selectedTop: receipt.selectedTopWorld,
        afterNaturalTop: receipt.afterTopWorld,
        afterHeight: projectedAfter?.offsetHeight ?? 0,
        slotDepth: slot.offsetHeight,
        handle: stretch.activeHandle ?? stretch.lastHandle ?? "bottom",
      });
      if (flow === null) return;
      nextDamage = Object.freeze({
        nodeId: lasso.selection?.nodeId ?? "",
        topExtent: flow.topExtent,
        bottomExtent: flow.bottomExtent,
      });
    }
    const frame = requestAnimationFrame(() => {
      if (samePresentationDamage(languagePresentationDamageRef.current, nextDamage)) return;
      languagePresentationDamageRef.current = nextDamage;
      setLanguagePresentationDamage(nextDamage);
      requestMeasurement();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    lasso.selection?.nodeId,
    selectionPreviewMode,
    stretch.amount,
    stretch.activeHandle,
    stretch.dragging,
    stretch.lastHandle,
    viewport.zoom,
  ]);
  const selectedNode =
    navigation.selectedNodeId === null ? null : tree.nodes[navigation.selectedNodeId] ?? null;
  const toolTargetNode = resolveToolTargetNode(navigation, tree);
  const admissionVoiceAvailable = props.admissionAnchor !== null &&
    voiceAdmissionIsEnabled() &&
    voiceReadiness.status === "ready";
  const voiceAvailable = admissionVoiceAvailable;
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
    () => projectInquiryContext(
      tree,
      activeWorkingProjection,
      lasso.selections,
    ),
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
  const selectedLanguageNodeId = stretchSelection?.nodeId ?? null;
  const selectedLanguageIsCurrent = selectedLanguageNodeId !== null &&
    projection.some(({ node }) => node.id === selectedLanguageNodeId);
  let languageGuidance: CanvasLanguageGuidanceState;
  if (lasso.drawing) {
    languageGuidance = { kind: "lasso-drawing" };
  } else if (selectedLanguageIsCurrent) {
    languageGuidance = {
      kind: "selected",
      stretch: transformState.phase === "requesting"
        ? { kind: "pending", amount: transformState.basis?.amount ?? stretch.amount }
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
    if (!viewportRenderer) return;
    let active = true;
    void import("./viewport-research-runtime").then((runtime) => {
      if (active) setViewportResearchRuntime(runtime);
    }).catch(() => {
      const canvas = canvasRef.current;
      if (active && canvas !== null) failViewportCandidate(canvas, "runtime-unavailable");
    });
    return () => {
      active = false;
    };
  }, [failViewportCandidate, viewportRenderer]);

  useLayoutEffect(() => {
    if (!viewportRenderer) {
      typographyAuthorityRef.current?.destroy();
      typographyAuthorityRef.current = null;
      return;
    }
    if (viewportResearchRuntime === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const authority = new viewportResearchRuntime.TypographyHeightAuthority({
      container: canvas,
      context: {
        dir: readWritingDirection(canvas),
        documentEpoch: props.documentEpoch,
        grammarEpoch: 1,
        locale: props.locale,
        styleEpoch: 0,
      },
      document,
      onInvalidated: () => requestMeasurement(),
    });
    typographyAuthorityRef.current = authority;
    requestMeasurement();
    return () => {
      if (typographyAuthorityRef.current === authority) {
        typographyAuthorityRef.current = null;
      }
      authority.destroy();
    };
  }, [props.documentEpoch, props.locale, viewportRenderer, viewportResearchRuntime]);

  useLayoutEffect(() => {
    if (!viewportRenderer || viewportResearchRuntime === null) return;
    const canvas = canvasRef.current;
    const authority = typographyAuthorityRef.current;
    if (canvas === null || authority === null || projection.length === 0) return;
    canvas.removeAttribute("data-layout-ready");
    if (revealedDocumentEpochRef.current !== props.documentEpoch) {
      canvas.removeAttribute("data-layout-revealed");
    }
    if (presentationDamage !== null) {
      failViewportCandidate(canvas, "presentation-damage");
      return;
    }
    if (!initialPerformanceMarksRef.current.canvasCommitted) {
      initialPerformanceMarksRef.current.canvasCommitted = true;
      markPerformance("matter:performance:initial-canvas-committed");
    }
    const style = getComputedStyle(canvas);
    const columnWidth = readRequiredCssPixels(style, "--matter-column-width");
    const columnGap = readRequiredCssPixels(style, "--matter-column-gap");
    const siblingGap = readRequiredCssPixels(style, "--matter-sibling-gap");
    if (columnWidth === null || columnGap === null || siblingGap === null) {
      failViewportCandidate(canvas, "layout-grammar-missing");
      return;
    }
    const direction = readWritingDirection(canvas);
    authority.setContext({
      dir: direction,
      documentEpoch: props.documentEpoch,
      grammarEpoch: 1,
      locale: props.locale,
      styleEpoch: measureRevision,
    });
    const token = authority.begin(publicationKey);
    if (token === null) {
      failViewportCandidate(canvas, "typography-not-ready");
      return;
    }
    if (!initialPerformanceMarksRef.current.heightReadStarted) {
      initialPerformanceMarksRef.current.heightReadStarted = true;
      markPerformance("matter:performance:height-read-start");
    }
    let snapshot;
    try {
      snapshot = authority.measure({
        batchSize: props.performanceViewport?.batchSize ?? 32,
        items: projection.map((item) => Object.freeze({
          columnWidthPx: columnWidth,
          dir: direction,
          locale: props.locale,
          nodeId: item.node.id,
          root: item.parentId === null,
          text: item.node.text,
        })),
        token,
      });
    } catch {
      failViewportCandidate(canvas, "typography-rejected");
      return;
    }
    if (snapshot === null || !authority.isCurrent(snapshot.basis)) {
      failViewportCandidate(canvas, "typography-stale");
      return;
    }
    if (!initialPerformanceMarksRef.current.heightReadComplete) {
      initialPerformanceMarksRef.current.heightReadComplete = true;
      markPerformance("matter:performance:height-read-complete");
    }
    if (!initialPerformanceMarksRef.current.pureLayoutStarted) {
      initialPerformanceMarksRef.current.pureLayoutStarted = true;
      markPerformance("matter:performance:pure-layout-start");
    }
    const result = viewportResearchRuntime.publishCompleteLayout({
      expectedBasis: snapshot.basis,
      layout: {
        columnGap,
        columnWidth,
        layoutEpoch: layoutEpochRef.current + 1,
        origin: { x: 0, y: 0 },
        siblingGap,
      },
      projection,
      snapshot,
    });
    if (!initialPerformanceMarksRef.current.pureLayoutComplete) {
      initialPerformanceMarksRef.current.pureLayoutComplete = true;
      markPerformance("matter:performance:pure-layout-complete");
    }
    if (!result.ok || !authority.isCurrent(result.publication.basis)) {
      failViewportCandidate(canvas, result.ok ? "layout-stale" : "layout-rejected");
      return;
    }
    delete canvas.dataset.viewportRendererError;
    layoutEpochRef.current = result.publication.layout.layoutEpoch;
    setPublished({
      heightBasis: result.publication.basis,
      key: publicationKey,
      layout: result.publication.layout,
      nodeIds: result.publication.nodeIds,
    });
  }, [
    failViewportCandidate,
    markPerformance,
    measureRevision,
    presentationDamage,
    projection,
    publicationKey,
    props.documentEpoch,
    props.locale,
    props.performanceViewport?.batchSize,
    viewportRenderer,
    viewportResearchRuntime,
  ]);

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
    if (viewportRenderer) return;
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
        presentation: admissionPresentationDamage?.nodeId === item.node.id
          ? {
              topExtent: admissionPresentationDamage.topExtent,
              bottomExtent: admissionPresentationDamage.bottomExtent,
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
    const layout = admissionPresentationDamage === null && languagePresentationDamage !== null
      ? projectVerticalPresentationBand(result.layout, languagePresentationDamage)
      : result.layout;
    if (layout === null) return;
    const retry = measurementRetryRef.current;
    if (retry.frame !== null) cancelAnimationFrame(retry.frame);
    retry.key = projectionKey;
    retry.attempts = 0;
    retry.frame = null;
    if (layoutCacheKey !== null) {
      retainBoundedCache(measuredLayoutCacheRef.current, layoutCacheKey, layout);
    }
    if (!publishCanvasGeometry(canvas, elements, layout)) return;
    layoutEpochRef.current = layout.layoutEpoch;
    if (!initialPerformanceMarksRef.current.geometryPublished) {
      initialPerformanceMarksRef.current.geometryPublished = true;
      markPerformance("matter:performance:geometry-dom-published");
    }
    setPublished({ key: projectionKey, layout });
  }, [admissionPresentationDamage, languagePresentationDamage, markPerformance, measureRevision, presentationDamage, projection, projectionKey, props.documentEpoch, tree.rootId, viewportRenderer]);

  useLayoutEffect(() => {
    if (!viewportRenderer || viewportResearchRuntime === null) return;
    const paper = documentRef.current;
    const world = worldRef.current;
    const canvas = canvasRef.current;
    if (completePublication === null || paper === null || world === null || canvas === null) {
      setViewportWindow(null);
      setViewportGeometryAcknowledgement(null);
      return;
    }
    const renderedCamera = readRenderedViewportCamera(world);
    if (renderedCamera === null) {
      failViewportCandidate(canvas, "camera-invalid");
      return;
    }
    const paperRect = paper.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const completeIds = new Set(completePublication.nodeIds ?? []);
    const pinLeases: Array<Readonly<{
      documentEpoch: number;
      ids: readonly string[];
      layoutEpoch: number;
      ownerId: string;
    }>> = [];
    const addPinLease = (ownerId: string, nodeId: string | null) => {
      if (nodeId === null || !completeIds.has(nodeId)) return;
      pinLeases.push(Object.freeze({
        documentEpoch: props.documentEpoch,
        ids: Object.freeze([nodeId]),
        layoutEpoch: completePublication.layout.layoutEpoch,
        ownerId,
      }));
    };
    addPinLease("navigation:selected", navigation.selectedNodeId);
    addPinLease("navigation:focus", navigation.mode === "focus" ? navigation.focusNodeId : null);
    addPinLease("camera:index-target", indexCenterRequestRef.current?.nodeId ?? null);
    const activeNodeId = document.activeElement instanceof Element
      ? document.activeElement.closest<HTMLElement>("[data-thought-id]")?.dataset.thoughtId ?? null
      : null;
    addPinLease("dom:active-focus", activeNodeId);
    const result = viewportResearchRuntime.projectSpatialViewport({
      cameraZoom: renderedCamera.zoom,
      completePreorderNodeIds: completePublication.nodeIds ?? [],
      expectedBasis: {
        documentEpoch: props.documentEpoch,
        layoutEpoch: completePublication.layout.layoutEpoch,
      },
      layout: completePublication.layout,
      pinLeases,
      screenPaperViewport: {
        x: paperRect.left + paper.clientLeft - canvasRect.left,
        y: paperRect.top + paper.clientTop - canvasRect.top,
        width: paper.clientWidth,
        height: paper.clientHeight,
      },
    });
    if (!result.ok) {
      failViewportCandidate(canvas, "window-rejected");
      return;
    }
    setViewportWindow((current) => {
      if (
        current?.basis.documentEpoch === props.documentEpoch &&
        current.basis.completePublication === completePublication &&
        current.basis.projection === projection &&
        sameRenderedViewportCamera(current.basis.renderedCamera, renderedCamera) &&
        sameOrderedIds(current.nodeIds, result.projection.nodeIds)
      ) return current;
      viewportWindowEpochRef.current += 1;
      return Object.freeze({
        basis: Object.freeze({
          completePublication,
          documentEpoch: props.documentEpoch,
          projection,
          renderedCamera,
          windowEpoch: viewportWindowEpochRef.current,
        }),
        nodeIds: result.projection.nodeIds,
      });
    });
  }, [
    completePublication,
    failViewportCandidate,
    navigation.focusNodeId,
    navigation.mode,
    navigation.selectedNodeId,
    projection,
    props.documentEpoch,
    viewport.x,
    viewport.y,
    viewport.zoom,
    viewportRenderer,
    viewportResearchRuntime,
  ]);

  useLayoutEffect(() => {
    if (!viewportRenderer) return;
    const canvas = canvasRef.current;
    const world = worldRef.current;
    const authority = typographyAuthorityRef.current;
    if (
      canvas === null || world === null || authority === null || completePublication === null ||
      completePublication.heightBasis === undefined || completePublication.nodeIds === undefined ||
      viewportWindow === null || !viewportWindowIsCurrent
    ) {
      canvas?.removeAttribute("data-layout-ready");
      setViewportGeometryAcknowledgement(null);
      return;
    }
    canvas.removeAttribute("data-layout-ready");
    const elements = canvas.querySelectorAll<HTMLElement>("[data-layout-node-id]");
    const cameraBeforeWrite = readRenderedViewportCamera(world);
    if (
      cameraBeforeWrite === null ||
      !sameRenderedViewportCamera(cameraBeforeWrite, viewportWindow.basis.renderedCamera) ||
      !authority.isCurrent(completePublication.heightBasis) ||
      !publishViewportCanvasGeometry(
        canvas,
        elements,
        completePublication.layout,
        viewportWindow.nodeIds,
      ) ||
      !authority.isCurrent(completePublication.heightBasis) ||
      !sameRenderedViewportCamera(
        readRenderedViewportCamera(world),
        viewportWindow.basis.renderedCamera,
      )
    ) {
      failViewportCandidate(canvas, "window-geometry-rejected");
      return;
    }
    delete canvas.dataset.viewportRendererError;
    canvas.dataset.completeLayoutNodeCount = String(completePublication.nodeIds.length);
    canvas.dataset.viewportNodeCount = String(viewportWindow.nodeIds.length);
    canvas.dataset.viewportWindowEpoch = String(viewportWindow.basis.windowEpoch);
    setViewportGeometryAcknowledgement((current) =>
      current?.basis === viewportWindow.basis && current.nodeIds === viewportWindow.nodeIds
        ? current
        : Object.freeze({ basis: viewportWindow.basis, nodeIds: viewportWindow.nodeIds }),
    );
    if (!initialPerformanceMarksRef.current.geometryPublished) {
      initialPerformanceMarksRef.current.geometryPublished = true;
      markPerformance("matter:performance:geometry-dom-published");
    }
  }, [
    completePublication,
    failViewportCandidate,
    markPerformance,
    renderedProjection,
    viewportRenderer,
    viewportWindow,
    viewportWindowIsCurrent,
  ]);

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
    indexCenterRequestRef.current = null;
    interruptIndexCameraMotion();
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
      indexCenterRequestRef.current = null;
      interruptIndexCameraMotion();
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
  }, [canvasMode, interruptIndexCameraMotion, lasso.active, setViewport, setWheelMotionActive]);

  return (
    <main
      className="matter-shell"
      lang={props.locale}
      data-canvas-theme={canvasPreferences.resolvedAppearance}
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
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive]")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onLostPointerCapture={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) {
          lassoClickOriginNodeRef.current = null;
          return;
        }
        if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "lost-pointer-capture", pointerId: event.pointerId });
      }}
      onPointerCancel={(event) => {
        if (stretch.pointerCancel(event.pointerId)) return;
        if (lasso.pointerCancel(event.pointerId)) {
          lassoClickOriginNodeRef.current = null;
          return;
        }
        if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
        pointerOriginNodeRef.current = null;
        updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
      }}
      onPointerDown={(event) => {
        if (interactionPending) return;
        if ((event.target as HTMLElement).closest("[data-canvas-interactive], a")) return;
        const pointerViewport = interruptIndexCameraMotion();
        abortFixedExpansion();
        if (lasso.pointerDown(event)) {
          const originNodeId = (event.target as HTMLElement)
            .closest<HTMLElement>("[data-thought-id]")?.dataset.thoughtId ?? null;
          lassoClickOriginNodeRef.current = originNodeId !== null && workingContext.activeNodeIds.has(originNodeId)
            ? originNodeId
            : null;
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
            zoom: pointerViewport.zoom,
            dragging: false,
            targetId: null,
            targetIndex: null,
            targetMode: null,
            targetElement: null,
            dropLanes: activeLayout === null || canvasBounds === null
              ? []
              : projectNodeDropLanes(tree, activeLayout, canvasBounds, pointerViewport.zoom),
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
          lassoClickOriginNodeRef.current = null;
          if (nodeDragRef.current?.pointerId === event.pointerId) clearNodeDrag();
          pointerOriginNodeRef.current = null;
          updateViewport({ type: "pointer-cancel", pointerId: event.pointerId });
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        const lassoSettlement = lasso.pointerUp(event);
        if (lassoSettlement !== null) {
          event.preventDefault();
          suppressClickRef.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (lassoSettlement === "click") {
            const nodeId = lassoClickOriginNodeRef.current;
            exitLasso();
            if (nodeId !== null && workingContext.activeNodeIds.has(nodeId)) {
              selectNodeAfterAbort(nodeId);
            } else {
              abortFixedExpansion();
              props.onClearSelection();
            }
          }
          lassoClickOriginNodeRef.current = null;
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
          focusIndexNodeAfterAbort(nodeId);
        }}
        onOpenOverlay={() => {
          abortFixedExpansion();
          if (lasso.active) exitLasso();
        }}
        onRenameNode={labels.rename}
        onRenameDocument={(title) => {
          abortFixedExpansion();
          props.onRenameDocument(title);
        }}
        onResetNodeName={labels.resetName}
        onRestoreNode={(nodeId) => {
          restoreIndexNodeAfterAbort(nodeId);
        }}
        onSelectNode={selectIndexNodeAfterAbort}
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
        lassoAvailable={lassoEligibleNodeIds.size > 0 && (lasso.active || activeLayout !== null)}
        locale={props.locale}
        onLasso={() => {
          abortFixedExpansion();
          if (lasso.active) {
            exitLasso();
            return;
          }
          if (activeLayout !== null) {
            // Entering Lasso transfers control of the visible coordinate space
            // to the person before their first stroke. Keeping an index-centre
            // transition alive until pointer-down makes a deliberate tool
            // choice race the camera the person is about to address.
            interruptIndexCameraMotion();
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
          exitLasso();
          setCanvasMode("pan");
        }}
        onIntent={(intent) => {
          abortFixedExpansion();
          dispatchToolIntent(intent, props);
        }}
        onVoice={() => {
          abortFixedExpansion();
          if (props.admission.state.phase === "recording") {
            props.admission.stop();
          } else if (props.admissionAnchor !== null) {
            // Admission temporarily owns the surface, while the validated
            // lasso address stays available to re-arm after cancellation.
            if (lasso.active) lasso.deactivate();
            props.admission.start(props.admissionAnchor);
          }
        }}
        surface={toolSurface}
        panActive={!lasso.active && canvasMode === "pan"}
        voiceActive={props.admission.state.phase === "recording"}
        voiceAvailable={voiceAvailable}
        // A navigation restriction must be named as one. The generic build
        // limitation is the last branch, because reaching for it first told a
        // person in focus view that the preview cannot record at all — and left
        // both navigation explanations unreachable.
        voiceLabel={voiceToolLabel({
          anchor: props.admissionAnchor,
          isPreviewReady: voiceAdmissionIsEnabled() && voiceReadiness.status === "ready",
          isRecording: props.admission.state.phase === "recording",
          isVoiceChecking: voiceReadiness.status === "checking",
          locale: props.locale,
          navigationMode: navigation.mode,
          rootId: tree.rootId,
        })}
      />
      <section
        aria-label="Thought material"
        className="matter-document"
        data-canvas-theme={canvasPreferences.resolvedAppearance}
        data-canvas-theme-preference={canvasPreferences.preferences.appearance}
        data-leaf-fx={canvasPreferences.preferences.leafFx ? "on" : "off"}
        ref={documentRef}
      >
        {lasso.selections.length > 1 ? (
          <div
            aria-live="polite"
            className="lasso-selection-count"
            data-canvas-interactive
            data-selection-count={lasso.selections.length}
          >
            {selectedPassageCount(lasso.selections.length, props.locale)}
          </div>
        ) : null}
        <AmbientWorkbench
          enabled={canvasPreferences.preferences.leafFx}
          navigationActive={wheelMotionActive || viewport.gesture?.dragging === true}
        />
        <CanvasRuling
          active={!canvasPreferences.preferences.leafFx}
          viewport={{ x: viewport.x, y: viewport.y, zoom: viewport.zoom }}
        />
        {projection.length === 0 ? (
          <p className="matter-document__empty">
            {navigation.mode === "focus" ? "This focus is no longer available." : "No material yet."}
          </p>
        ) : (
          <div
            className="matter-world"
            onTransitionEnd={(event) => {
              if (event.currentTarget === event.target && event.propertyName === "transform") {
                clearIndexCameraMotion(event.currentTarget);
              }
            }}
            ref={worldRef}
            style={worldStyle}
          >
          <div
            aria-busy={activeLayout === null || persistenceLoading || undefined}
            className="matter-canvas"
            data-renderer-source={viewportRenderer ? "viewport-research" : undefined}
            inert={viewportRenderer && activeLayout === null ? true : undefined}
            ref={canvasRef}
          >
            {viewportRenderer && renderedProjection.length === 0 ? (
              <ViewportMaterialGlimpse text={projection[0]?.node.text ?? ""} />
            ) : (
            <CanvasThoughtList
              documentEpoch={props.documentEpoch}
              interactionPending={interactionPending}
              lassoActive={lasso.active}
              lassoEligibleNodeIds={lassoEligibleNodeIds}
              lassoSelection={stretchSelection}
              lassoSourceText={lasso.sourceText}
              locale={props.locale}
              selectionPreviewMode={selectionPreviewMode}
              navigation={navigation}
              onSelectNode={selectNodeAfterAbort}
              onSelectLassoSegment={lasso.selectKeyboardSegment}
              activeNodeIds={workingContext.activeNodeIds}
              heldAsideNodeIds={workingContext.heldAsideNodeIds}
              projection={renderedProjection}
              repairPresentations={props.admission.repairPresentations}
              splitProjectionRef={splitProjectionRef}
              transformChange={currentTransformChange}
              transformStatus={transformState.phase !== "idle" && transformState.basis !== null
                ? {
                    nodeId: transformState.basis.selection.nodeId,
                    phase: transformState.phase,
                    text: stretchStatusText(props.locale),
                    announce: !lassoHasSelectionGeometry,
                  }
                : null}
              tree={tree}
            />
            )}
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
          data-optical-clearance="guidance"
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
        rects={lasso.selections.length > 1 ? lasso.selectionSetRects : lasso.selectionRects}
        selectedText={lasso.selections.length === 1 ? lasso.selection?.selectedText ?? null : null}
        selectionCount={lasso.selections.length}
        elasticRef={elasticRef}
        locale={props.locale}
        onBeginAdjustment={beginStretchAdjustment}
        onPreciseGesture={props.admission.discardPendingRepairs}
        status={transformState.phase}
        stretchVisible={elasticSelection !== null}
        textColumn={lasso.selectionColumn}
        stretch={stretch}
      />
    </main>
  );
}

function ViewportMaterialGlimpse({ text }: Readonly<{ text: string }>) {
  return (
    <div aria-hidden="true" data-viewport-bootstrap inert>
      <ol className="spatial-thoughts">
        <li className="spatial-thought">
          <span className="spatial-thought__text">{text}</span>
        </li>
      </ol>
    </div>
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
  lassoActive,
  lassoEligibleNodeIds,
  lassoSelection,
  lassoSourceText,
  locale,
  selectionPreviewMode,
  navigation,
  onSelectNode,
  onSelectLassoSegment,
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
  lassoActive: boolean;
  lassoEligibleNodeIds: ReadonlySet<string>;
  lassoSelection: SegmentSelection | null;
  lassoSourceText: string | null;
  locale: CanvasLanguage;
  selectionPreviewMode: SelectionPreviewMode;
  navigation: NavigationState;
  onSelectNode: (nodeId: string) => void;
  onSelectLassoSegment: (nodeId: string, direction: "next" | "previous") => boolean;
  activeNodeIds: ReadonlySet<string>;
  heldAsideNodeIds: ReadonlySet<string>;
  projection: readonly LayoutProjectionItem[];
  repairPresentations: AdmissionController["repairPresentations"];
  splitProjectionRef: React.RefObject<HTMLDivElement | null>;
  transformChange: MaterialTextCommittedChange | null;
  transformStatus: Readonly<{
    nodeId: string;
    phase: "requesting";
    text: string;
    announce: boolean;
  }> | null;
  tree: ThoughtTree;
}) {
  const repairPresentationScope = { treeId: tree.id, documentEpoch };
  const lassoKeyboardDescriptionId = useId();
  const handleThoughtClick = useCallback((event: ReactMouseEvent<HTMLOListElement>) => {
    if (interactionPending) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-thought-text-id]")
      : null;
    const nodeId = target?.dataset.thoughtTextId;
    if (nodeId !== undefined && activeNodeIds.has(nodeId) && event.currentTarget.contains(target)) onSelectNode(nodeId);
  }, [activeNodeIds, interactionPending, onSelectNode]);

  return (
    <>
    {lassoActive ? (
      <span className="visually-hidden" id={lassoKeyboardDescriptionId}>
        {lassoAccessibilityCopy(locale).keyboardSelectionHint}
      </span>
    ) : null}
    <ol className="spatial-thoughts" onClick={handleThoughtClick}>
      {projection.map(({ node, parentId }) => {
        const isSelected = node.id === navigation.selectedNodeId;
        const isHeldAside = heldAsideNodeIds.has(node.id);
        const isFocused = navigation.mode === "focus" && node.id === navigation.focusNodeId;
        const isProjected = lassoSelection?.nodeId === node.id && lassoSourceText === node.text;
        const isLassoSelected = lassoSelection?.nodeId === node.id;
        const isLassoKeyboardEligible = lassoActive && lassoEligibleNodeIds.has(node.id);
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
              aria-describedby={isLassoKeyboardEligible ? lassoKeyboardDescriptionId : undefined}
              aria-pressed={isSelected}
              aria-keyshortcuts={isHeldAside
                ? undefined
                : isLassoKeyboardEligible ? "ArrowLeft ArrowRight" : "ArrowRight"}
              className="spatial-thought__text"
              data-thought-text-id={node.id}
              data-visual-projection={isProjected || undefined}
              disabled={isHeldAside}
              onKeyDown={(event) => {
                if (
                  !isLassoKeyboardEligible || event.altKey || event.ctrlKey ||
                  event.metaKey || event.shiftKey ||
                  (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                ) return;
                if (!onSelectLassoSegment(
                  node.id,
                  event.key === "ArrowRight" ? "next" : "previous",
                )) return;
                event.preventDefault();
                event.stopPropagation();
              }}
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
                previewMode={selectionPreviewMode}
                projection={languageProjection.projection}
                projectionRef={splitProjectionRef}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
    </>
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

function publishViewportCanvasGeometry(
  canvas: HTMLDivElement,
  elements: NodeListOf<HTMLElement>,
  completeLayout: ColumnarLayout,
  windowNodeIds: readonly string[],
): boolean {
  if (elements.length !== windowNodeIds.length) return false;
  const boxesById = new Map(completeLayout.boxes.map((box) => [box.nodeId, box]));
  if (boxesById.size !== completeLayout.boxes.length) return false;
  const ordered: Array<Readonly<{ box: ColumnarLayout["boxes"][number]; element: HTMLElement }>> = [];
  for (let index = 0; index < windowNodeIds.length; index += 1) {
    const nodeId = windowNodeIds[index];
    const element = elements[index];
    const box = nodeId === undefined ? undefined : boxesById.get(nodeId);
    if (
      nodeId === undefined || element === undefined || box === undefined ||
      !element.isConnected || element.dataset.layoutNodeId !== nodeId
    ) return false;
    ordered.push({ box, element });
  }

  canvas.style.setProperty("--matter-canvas-width", `${completeLayout.bounds.width}px`);
  canvas.style.setProperty("--matter-canvas-height", `${completeLayout.bounds.height}px`);
  for (const { box, element } of ordered) {
    element.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
  }
  // DOM ownership can change synchronously through a nested render boundary.
  // Revalidate after writes so a detached or reordered partial window never
  // receives interaction authority.
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index]!;
    if (!entry.element.isConnected || entry.element.dataset.layoutNodeId !== windowNodeIds[index]) {
      return false;
    }
  }
  return true;
}

function readRenderedViewportCamera(
  world: HTMLDivElement,
): RenderedViewportCamera | null {
  try {
    const transform = getComputedStyle(world).transform;
    const matrix = transform === "none"
      ? new DOMMatrixReadOnly()
      : new DOMMatrixReadOnly(transform);
    const zoom = (matrix.a + matrix.d) / 2;
    if (
      !Number.isFinite(matrix.e) || !Number.isFinite(matrix.f) ||
      !Number.isFinite(zoom) || zoom <= 0 ||
      Math.abs(matrix.b) > .001 || Math.abs(matrix.c) > .001 ||
      Math.abs(matrix.a - matrix.d) > .001
    ) return null;
    const round = (value: number) => Math.round(value * 1_000) / 1_000;
    const x = round(matrix.e);
    const y = round(matrix.f);
    const roundedZoom = round(zoom);
    return Object.freeze({
      epoch: `${x}:${y}:${roundedZoom}`,
      x,
      y,
      zoom: roundedZoom,
    });
  } catch {
    return null;
  }
}

function sameRenderedViewportCamera(
  left: RenderedViewportCamera | null,
  right: RenderedViewportCamera,
): boolean {
  return left !== null && left.epoch === right.epoch && left.x === right.x &&
    left.y === right.y && left.zoom === right.zoom;
}

function readWritingDirection(element: HTMLElement): "ltr" | "rtl" {
  return getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

function sameOrderedIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function markViewportRendererFailure(canvas: HTMLDivElement, code: string): void {
  canvas.removeAttribute("data-layout-ready");
  canvas.removeAttribute("data-layout-revealed");
  delete canvas.dataset.completeLayoutNodeCount;
  delete canvas.dataset.viewportNodeCount;
  delete canvas.dataset.viewportWindowEpoch;
  canvas.dataset.viewportRendererError = code;
  canvas.style.removeProperty("--matter-canvas-width");
  canvas.style.removeProperty("--matter-canvas-height");
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
  selectionCount,
  elasticRef,
  locale,
  onBeginAdjustment,
  onPreciseGesture,
  status,
  stretchVisible,
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
  selectionCount: number;
  elasticRef: React.RefObject<HTMLDivElement | null>;
  locale: CanvasLanguage;
  onBeginAdjustment: () => void;
  onPreciseGesture: () => void;
  status: "idle" | "requesting";
  stretchVisible: boolean;
  textColumn: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  stretch: ReturnType<typeof useStretch>;
}) {
  const bounds = selectionBounds(rects);
  const coarsePointer = hasCoarsePointer();
  const accessibility = lassoAccessibilityCopy(locale);
  const selectionProjectionActive = bounds !== null && stretchVisible &&
    (stretch.dragging || stretch.amount > 0 || status !== "idle");
  const descriptionId = useId();
  const preview = elasticPreviewGeometry(
    rects,
    stretch.amount,
    clientViewport(),
    textColumn ?? undefined,
    stretch.activeHandle,
    stretch.lastHandle,
    coarsePointer,
  );
  return (
    <div
      className="lasso-layer"
      data-active={active || undefined}
      data-drawing={drawing || undefined}
      data-selected={selectionCount > 0 || undefined}
      data-selection-projection={selectionProjectionActive || undefined}
    >
      {selectedText === null ? null : (
        <span className="visually-hidden" lang={locale} role="status">
          {`${accessibility.selectedLanguage}: ${summarizeSelectedLanguage(selectedText, locale)}`}
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
      {bounds === null || !stretchVisible ? null : (
        <>
          <div
            aria-label={accessibility.groupLabel}
            aria-roledescription={accessibility.groupRoleDescription}
            className="elastic-preview"
            data-preview-mode={stretch.amount === 0 ? "neutral" : "expand"}
            data-stretch-handle={stretch.activeHandle ?? stretch.lastHandle ?? "bottom"}
            ref={elasticRef}
            role="group"
            lang={locale}
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
            <span className="visually-hidden" id={descriptionId}>
              {accessibility.groupInstructions}
            </span>
            <span aria-hidden="true" className="language-pocket" />
            {status === "idle" ? null : (
              <span
                aria-live="polite"
                className="visually-hidden"
                role="status"
              >
                {stretchStatusText(locale)}
              </span>
            )}
            <StretchHandleButton
              descriptionId={descriptionId}
              handle="top"
              locale={locale}
              onBeginAdjustment={onBeginAdjustment}
              onPreciseGesture={onPreciseGesture}
              status={status}
              stretch={stretch}
            />
            <StretchHandleButton
              descriptionId={descriptionId}
              handle="bottom"
              locale={locale}
              onBeginAdjustment={onBeginAdjustment}
              onPreciseGesture={onPreciseGesture}
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

function LanguageSplitProjection({
  previewMode,
  projection,
  projectionRef,
}: {
  previewMode: SelectionPreviewMode;
  projection: LanguageProjection;
  projectionRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-hidden="true"
      className="language-split-projection"
      data-preview-mode={previewMode}
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
  handle,
  locale,
  onBeginAdjustment,
  onPreciseGesture,
  status,
  stretch,
}: {
  descriptionId: string;
  handle: "top" | "bottom";
  locale: CanvasLanguage;
  onBeginAdjustment: () => void;
  onPreciseGesture: () => void;
  status: "idle" | "requesting";
  stretch: ReturnType<typeof useStretch>;
}) {
  return (
    <button
      aria-describedby={descriptionId}
      aria-label={handle === "top" ? lassoAccessibilityCopy(locale).upperGripLabel : lassoAccessibilityCopy(locale).lowerGripLabel}
      aria-orientation="vertical"
      aria-valuemax={1}
      aria-valuemin={0}
      aria-valuenow={Number(stretch.amount.toFixed(3))}
      aria-valuetext={stretchValueText(stretch.amount, locale)}
      className={`stretch-handle stretch-handle--${handle}`}
      data-canvas-interactive
      data-active={stretch.activeHandle === handle || undefined}
      data-stretch-amount={Number(stretch.amount.toFixed(3))}
      data-stretch-commit-ready={stretch.amount >= STRETCH_COMMIT_THRESHOLD || undefined}
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
          // Only a primary edge-grip gesture may supersede a pending turn.
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
        stretch.keyDown(event.key, handle);
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
    />
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

function selectedPassageCount(count: number, locale: CanvasLanguage): string {
  if (locale === "zh-CN") return `已选 ${count} 段文字`;
  if (locale === "zh-TW") return `已選 ${count} 段文字`;
  if (locale === "ja-JP") return `${count} 件を選択`;
  if (locale === "de-DE") return `${count} Passagen ausgewählt`;
  return `${count} passages selected`;
}

function summarizeSelectedLanguage(text: string, locale: CanvasLanguage): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= 80) return normalized;
  const suffix = locale === "zh-CN" ? "…（已截断）"
    : locale === "zh-TW" ? "…（已截短）"
    : locale === "ja-JP" ? "…（省略）"
    : locale === "de-DE" ? "… (gekürzt)"
    : "… (truncated)";
  return `${characters.slice(0, 80).join("")}${suffix}`;
}

function stretchValueText(
  amount: number,
  locale: CanvasLanguage,
): string {
  if (amount === 0) {
    if (locale === "zh-CN") return "尚未设置展开程度";
    if (locale === "zh-TW") return "尚未設定展開程度";
    if (locale === "ja-JP") return "展開量は未設定です";
    if (locale === "de-DE") return "Noch kein Erweiterungsgrad";
    return "No expansion set";
  }
  const degree = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(amount);
  if (amount < STRETCH_COMMIT_THRESHOLD) {
    if (locale === "zh-CN") return `${degree}；再拉开一点`;
    if (locale === "zh-TW") return `${degree}；再拉開一點`;
    if (locale === "ja-JP") return `${degree}、もう少し引いてください`;
    if (locale === "de-DE") return `${degree}; etwas weiter ziehen`;
    return `${degree}; pull a little farther`;
  }
  if (locale === "zh-CN") return `${degree}；松开或按回车展开`;
  if (locale === "zh-TW") return `${degree}；放開或按 Enter 展開`;
  if (locale === "ja-JP") return `${degree}、放すかEnterで展開`;
  if (locale === "de-DE") return `${degree}; loslassen oder Enter drücken`;
  return `${degree}; release or press Enter to expand`;
}

function stretchStatusText(locale: CanvasLanguage): string {
  if (locale === "zh-CN" || locale === "zh-TW") return "正在展开";
  if (locale === "ja-JP") return "展開中";
  if (locale === "de-DE") return "Wird erweitert";
  return "Expanding";
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

function eligibleStretchSelection(input: Readonly<{
  candidate: SegmentSelection | null;
  currentText: string | null;
  view: "full" | "focus";
  focusNodeId: string | null;
  activeNodeIds: ReadonlySet<string>;
  tree: ThoughtTree;
}>): SegmentSelection | null {
  const { candidate } = input;
  if (candidate === null) return null;
  const node = input.tree.nodes[candidate.nodeId];
  if (
    node === undefined ||
    !input.activeNodeIds.has(candidate.nodeId) ||
    (input.view === "focus" && input.focusNodeId !== candidate.nodeId) ||
    input.currentText !== node.text ||
    !validateSelection(node.text, candidate, node.id).ok
  ) return null;
  return deriveExpandInPlaceLength(
    candidate.selectedText,
    node.text.slice(0, candidate.start),
    node.text.slice(candidate.end),
    1,
  ) === null ? null : candidate;
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

function rangeBoundsAroundContents(
  element: HTMLElement,
): Readonly<{ top: number; bottom: number }> | null {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = Array.from(range.getClientRects()).filter(
    (candidate) => candidate.width > 0 && candidate.height > 0,
  );
  range.detach();
  if (rects.length === 0) return null;
  return Object.freeze({
    top: Math.min(...rects.map((rect) => rect.top)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  });
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
      ) : phase === "error" ? (
        <>
          <button onClick={controller.retry} type="button">{actions.retry}</button>
          <button onClick={controller.dismiss} type="button">{actions.dismiss}</button>
        </>
      ) : (
        <button onClick={controller.cancel} type="button">
          {phase === "transcribing" ? actions.cancelTranscription : actions.cancel}
        </button>
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

function readRequiredCssPixels(
  style: CSSStyleDeclaration,
  property: string,
): number | null {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) && value > 0 ? value : null;
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

export function voiceToolLabel(input: Readonly<{
  anchor: InteractionAdmissionAnchor | null;
  isPreviewReady: boolean;
  isRecording: boolean;
  isVoiceChecking: boolean;
  locale: CanvasLanguage;
  navigationMode: NavigationState["mode"];
  rootId: string | null;
}>): string {
  const copy = voiceToolCopy(input.locale);
  if (input.isRecording) return copy.stopRecording;
  if (input.anchor?.kind === "root") return copy.recordRootThought;
  if (input.anchor?.kind === "child" && input.anchor.parentNodeId === input.rootId) {
    return copy.recordTopLevelThought;
  }
  if (input.anchor?.kind === "child") return copy.recordBelowSelectedMaterial;
  if (input.navigationMode === "focus") return copy.unavailableInFocusView;
  if (input.isVoiceChecking) return copy.preparingVoiceInput;
  if (!input.isPreviewReady) return copy.unavailableInPreview;
  return copy.unavailableOutsideFullView;
}

function voiceAdmissionIsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MATTER_VOICE_ADMISSION_ENABLED !== "false";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool intent: ${String(value)}`);
}
