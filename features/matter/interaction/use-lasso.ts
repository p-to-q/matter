"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  analyzeLassoPath,
  lassoClickIntent,
  LASSO_THRESHOLDS,
  type ClientPoint,
} from "../material/lasso-geometry";
import { lassoRenderPaths } from "../material/lasso-path";
import { lassoPointerSamples } from "./lasso-pointer-samples";
import {
  segmentText,
  validateSelection,
  type SegmentSelection,
} from "../material/text-segments";
import {
  lassoTargetFromMeasurements,
  resolveLassoTargets,
  type LassoSegmentMeasurement,
  type LassoTarget,
} from "../material/lasso-targets";
import {
  primaryLassoSelection,
  settleLassoSelectionSet,
  type LassoSelectionSet,
} from "../material/lasso-selection";
import {
  createLassoInteractionState,
  reduceLassoInteraction,
  type LassoInteractionEvent,
} from "../runtime/lasso-interaction";
import type { ThoughtTree } from "../tree/model";
import { measureTextRange, type ClientTextRect } from "./range-measurement";
import { clearMeasuredSelectionRects } from "./selection-rects-state";
import { isCurrentLassoStroke, type LassoMeasurementEpoch } from "./lasso-stroke-epoch";
import { projectOutsideLassoParticles } from "../material/lasso-particles";
import { planLassoMaterialTransition } from "./lasso-material-validity";

export type LassoController = Readonly<{
  active: boolean;
  drawing: boolean;
  inkRef: React.RefObject<SVGSVGElement | null>;
  inkPathRef: React.RefObject<SVGPathElement | null>;
  closurePathRef: React.RefObject<SVGPathElement | null>;
  particleCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selection: SegmentSelection | null;
  selections: readonly SegmentSelection[];
  sourceText: string | null;
  selectionRects: readonly ClientTextRect[];
  selectionSetRects: readonly ClientTextRect[];
  selectionColumn: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  activate: () => void;
  /** Returns an owned in-flight pointer so the shell can release capture. */
  deactivate: () => number | null;
  clearSelection: () => void;
  selectKeyboardSegment: (nodeId: string, direction: "next" | "previous") => boolean;
  pointerDown: (event: React.PointerEvent<HTMLElement>) => boolean;
  pointerMove: (event: React.PointerEvent<HTMLElement>) => boolean;
  pointerUp: (event: React.PointerEvent<HTMLElement>) => LassoPointerSettlement | null;
  pointerCancel: (pointerId: number) => boolean;
}>;

export type LassoPointerSettlement = "selection" | "empty-closed" | "click" | "uncommitted" | "ambiguous";

type MeasurementEpoch = LassoMeasurementEpoch;

/**
 * Binds one transient lasso operation to client-space DOM geometry. Pointer
 * moves publish ink and resolve against one pointer-down geometry snapshot.
 * Range measurement never enters the per-frame path.
 */
export function useLasso(input: {
  tree: ThoughtTree;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLElement | null>;
  epoch: MeasurementEpoch;
  documentEpoch?: number;
  navigationKey: string;
  /** Render-edge eligibility prevents faded material from reaching DOM Range reads. */
  eligibleNodeIds?: ReadonlySet<string>;
  onGeometryInvalidated?: (pointerId: number | null) => void;
}): LassoController {
  const { onGeometryInvalidated } = input;
  const [state, dispatchBase] = useReducer(
    reduceLassoInteraction,
    null,
    () => createLassoInteractionState(),
  );
  const selection = useMemo(
    () => primaryLassoSelection(state.address),
    [state.address],
  );
  const stateRef = useRef(state);
  const sampledPointsRef = useRef<ClientPoint[]>([]);
  const inkRef = useRef<SVGSVGElement>(null);
  const inkPathRef = useRef<SVGPathElement>(null);
  const closurePathRef = useRef<SVGPathElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkFrameRef = useRef<number | null>(null);
  const pendingInkRef = useRef<readonly ClientPoint[]>([]);
  const targetSnapshotRef = useRef<readonly LassoTarget[] | null>(null);
  const targetSnapshotKeyRef = useRef<string | null>(null);
  const [selectionRects, setSelectionRects] = useState<readonly ClientTextRect[]>([]);
  const [selectionSetRects, setSelectionSetRects] = useState<readonly ClientTextRect[]>([]);
  const [selections, setSelections] = useState<LassoSelectionSet>(Object.freeze([]));
  const selectionsRef = useRef<LassoSelectionSet>(Object.freeze([]));
  const startSelectionsRef = useRef<LassoSelectionSet>(Object.freeze([]));
  const [selectionColumn, setSelectionColumn] = useState<Readonly<{
    left: number; top: number; right: number; bottom: number;
  }> | null>(null);
  const strokeEpochRef = useRef<MeasurementEpoch | null>(null);
  const strokeDocumentEpochRef = useRef(input.documentEpoch ?? 0);
  const measurementGenerationRef = useRef(0);
  const latestEpochRef = useRef(input.epoch);
  useLayoutEffect(() => {
    // Pointer ownership can transfer synchronously from an in-flight camera.
    // Publish the committed measurement epoch before that same event continues
    // into pointerDown; a passive effect would leave one stale-camera frame.
    latestEpochRef.current = input.epoch;
  }, [input.epoch]);

  const dispatch = useCallback((event: LassoInteractionEvent) => {
    stateRef.current = reduceLassoInteraction(stateRef.current, event);
    dispatchBase(event);
  }, []);

  const commitSelections = useCallback((next: LassoSelectionSet) => {
    selectionsRef.current = next;
    setSelections(next);
  }, []);

  const writeInk = useCallback((points: readonly ClientPoint[]) => {
    pendingInkRef.current = points;
    if (points.length === 0) {
      if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current);
      inkFrameRef.current = null;
      inkPathRef.current?.setAttribute("d", "");
      closurePathRef.current?.setAttribute("d", "");
      clearParticleCanvas(particleCanvasRef.current);
      clipInkToPaper(inkRef.current, null, 0);
      return;
    }
    if (inkFrameRef.current !== null) return;
    inkFrameRef.current = requestAnimationFrame(() => {
      inkFrameRef.current = null;
      const pendingPoints = pendingInkRef.current;
      const paths = lassoRenderPaths(pendingPoints);
      const analysis = analyzeLassoPath(pendingPoints);
      const showClosure = analysis.kind === "prepared" &&
        targetSnapshotRef.current !== null &&
        resolveLassoTargets(analysis.lasso, targetSnapshotRef.current).kind === "selection";
      inkPathRef.current?.setAttribute("d", paths.ink);
      closurePathRef.current?.setAttribute(
        "d",
        showClosure ? paths.closure : "",
      );
      const paperElement = input.surfaceRef.current;
      const paper = paperElement?.getBoundingClientRect() ?? null;
      // One boundary for both layers: the paper's own corner, read from the
      // element rather than restated, so ink and echo can never disagree.
      const radius = paperCornerRadius(paperElement);
      clipInkToPaper(inkRef.current, paper, radius);
      renderOutsideParticles(particleCanvasRef.current, pendingPoints, paper, radius);
    });
  }, [input.surfaceRef]);

  useEffect(() => () => {
    if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current);
  }, []);

  const remeasureSelection = useCallback((selection: SegmentSelection | null) => {
    if (selection === null) {
      setSelectionRects(clearMeasuredSelectionRects);
      setSelectionColumn(null);
      return;
    }
    const node = input.tree.nodes[selection.nodeId];
    const root = findTextRoot(input.canvasRef.current, selection.nodeId);
    if (node === undefined || root === null || !validateSelection(node.text, selection, node.id).ok) {
      setSelectionRects(clearMeasuredSelectionRects);
      setSelectionSetRects(clearMeasuredSelectionRects);
      setSelectionColumn(null);
      commitSelections(Object.freeze([]));
      dispatch({ type: "material-invalidated" });
      return;
    }
    const measured = measureTextRange(root, node.text, selection);
    if (!measured.ok) {
      // Keep the semantic selection and request authority, but never render a
      // pocket from stale client geometry. A later measurement may restore it.
      setSelectionRects(clearMeasuredSelectionRects);
      setSelectionSetRects(clearMeasuredSelectionRects);
      setSelectionColumn(null);
      return;
    }
    setSelectionRects(measured.rects);
    const column = root.getBoundingClientRect();
    setSelectionColumn({
      left: column.left,
      top: column.top,
      right: column.right,
      bottom: column.bottom,
    });
  }, [commitSelections, dispatch, input.canvasRef, input.tree]);

  const remeasureSelectionSet = useCallback((current: LassoSelectionSet) => {
    if (current.length <= 1) {
      setSelectionSetRects(clearMeasuredSelectionRects);
      return;
    }
    const rects: ClientTextRect[] = [];
    for (const selected of current) {
      const node = input.tree.nodes[selected.nodeId];
      const root = findTextRoot(input.canvasRef.current, selected.nodeId);
      if (node === undefined || root === null || !validateSelection(node.text, selected, node.id).ok) {
        dispatch({ type: "material-invalidated" });
        commitSelections(Object.freeze([]));
        setSelectionRects(clearMeasuredSelectionRects);
        setSelectionSetRects(clearMeasuredSelectionRects);
        setSelectionColumn(null);
        return;
      }
      const measured = measureTextRange(root, node.text, selected);
      if (!measured.ok) {
        // A selection set has one semantic lifetime. Never paint a partial
        // set when one passage temporarily loses trustworthy DOM geometry.
        setSelectionSetRects(clearMeasuredSelectionRects);
        return;
      }
      rects.push(...measured.rects);
    }
    setSelectionSetRects(Object.freeze(rects));
  }, [commitSelections, dispatch, input.canvasRef, input.tree]);

  useEffect(() => {
    const generation = measurementGenerationRef.current;
    const frame = requestAnimationFrame(() => {
      if (measurementGenerationRef.current === generation) {
        remeasureSelectionSet(selections);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    input.epoch.layoutEpoch,
    input.epoch.treeRevision,
    input.epoch.viewportX,
    input.epoch.viewportY,
    input.epoch.viewportZoom,
    remeasureSelectionSet,
    selections,
  ]);

  const previousMaterialRef = useRef({ treeId: input.tree.id, revision: input.tree.revision, documentEpoch: input.documentEpoch ?? 0 });
  useLayoutEffect(() => {
    const previous = previousMaterialRef.current;
    previousMaterialRef.current = { treeId: input.tree.id, revision: input.tree.revision, documentEpoch: input.documentEpoch ?? 0 };
    if (previous.treeId === input.tree.id && previous.revision === input.tree.revision && previous.documentEpoch === (input.documentEpoch ?? 0)) return;
    measurementGenerationRef.current += 1;
    const ownerChanged = previous.treeId !== input.tree.id ||
      previous.documentEpoch !== (input.documentEpoch ?? 0);
    const interrupted = stateRef.current;
    const retainedSelections = interrupted.mode === "drawing"
      ? startSelectionsRef.current
      : selectionsRef.current;
    const transition = planLassoMaterialTransition({
      tree: input.tree,
      selections: retainedSelections,
      ownerChanged,
      drawingPointerId: interrupted.mode === "drawing" ? interrupted.pointerId : null,
    });
    if (transition.releasePointerId !== null) {
      onGeometryInvalidated?.(transition.releasePointerId);
    }
    if (transition.retainSelections) {
      if (interrupted.mode === "drawing") {
        dispatch({ type: "layout-invalidated" });
        commitSelections(retainedSelections);
        startSelectionsRef.current = Object.freeze([]);
      }
      sampledPointsRef.current = [];
      strokeEpochRef.current = null;
      targetSnapshotRef.current = null;
      targetSnapshotKeyRef.current = null;
      writeInk([]);
      // The semantic address survives, but old DOM geometry does not. Clearing
      // in the layout phase prevents one paint and one pointer hit against a
      // handle measured from the previous material.
      setSelectionRects(clearMeasuredSelectionRects);
      setSelectionSetRects(clearMeasuredSelectionRects);
      setSelectionColumn(null);
      return;
    }
    dispatch({ type: "material-invalidated" });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    startSelectionsRef.current = Object.freeze([]);
    writeInk([]);
    setSelectionRects(clearMeasuredSelectionRects);
    setSelectionSetRects(clearMeasuredSelectionRects);
    setSelectionColumn(null);
    commitSelections(Object.freeze([]));
  }, [commitSelections, dispatch, input.documentEpoch, input.tree, onGeometryInvalidated, writeInk]);

  const previousNavigationRef = useRef(input.navigationKey);
  useLayoutEffect(() => {
    if (previousNavigationRef.current === input.navigationKey) return;
    previousNavigationRef.current = input.navigationKey;
    measurementGenerationRef.current += 1;
    dispatch({ type: "navigation-invalidated" });
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    startSelectionsRef.current = Object.freeze([]);
    writeInk([]);
    setSelectionRects(clearMeasuredSelectionRects);
    setSelectionSetRects(clearMeasuredSelectionRects);
    setSelectionColumn(null);
    commitSelections(Object.freeze([]));
  }, [commitSelections, dispatch, input.navigationKey, writeInk]);

  useEffect(() => {
    if (state.mode === "drawing") return;
    const generation = measurementGenerationRef.current;
    const frame = requestAnimationFrame(() => {
      if (measurementGenerationRef.current === generation) {
        remeasureSelection(selection);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    input.epoch.layoutEpoch,
    input.epoch.treeRevision,
    input.epoch.viewportX,
    input.epoch.viewportY,
    input.epoch.viewportZoom,
    remeasureSelection,
    state.mode,
    selection,
  ]);

  useEffect(() => {
    let outerFrame = 0;
    let innerFrame = 0;
    const invalidate = () => {
      const generation = ++measurementGenerationRef.current;
      const interrupted = stateRef.current;
      const restoreSelections = interrupted.mode === "drawing"
        ? startSelectionsRef.current
        : selectionsRef.current;
      // Return pointer authority before geometry disappears and capture can be lost.
      onGeometryInvalidated?.(
        interrupted.mode === "drawing" ? interrupted.pointerId : null,
      );
      dispatch({ type: "layout-invalidated" });
      if (interrupted.mode === "drawing") {
        commitSelections(restoreSelections);
        startSelectionsRef.current = Object.freeze([]);
      }
      sampledPointsRef.current = [];
      strokeEpochRef.current = null;
      targetSnapshotRef.current = null;
      targetSnapshotKeyRef.current = null;
      writeInk([]);
      // Keep the last trustworthy geometry visible while the next frame
      // remeasures an existing semantic selection after a viewport change.
      if (stateRef.current.address === null && selectionsRef.current.length === 0) {
        setSelectionRects(clearMeasuredSelectionRects);
        setSelectionSetRects(clearMeasuredSelectionRects);
        setSelectionColumn(null);
      }
      // One remeasure is owed per invalidation burst, and it must not outlive
      // the effect: a scroll or blur immediately before unmount would otherwise
      // measure a detached canvas and set state on a gone component.
      if (outerFrame !== 0) cancelAnimationFrame(outerFrame);
      if (innerFrame !== 0) cancelAnimationFrame(innerFrame);
      outerFrame = requestAnimationFrame(() => {
        outerFrame = 0;
        if (measurementGenerationRef.current !== generation) return;
        innerFrame = requestAnimationFrame(() => {
          innerFrame = 0;
          if (measurementGenerationRef.current !== generation) return;
          remeasureSelection(primaryLassoSelection(stateRef.current.address));
          remeasureSelectionSet(selectionsRef.current);
        });
      });
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("blur", invalidate);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") invalidate();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.visualViewport?.addEventListener("resize", invalidate);
    window.visualViewport?.addEventListener("scroll", invalidate);
    document.fonts?.addEventListener?.("loadingdone", invalidate);
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("blur", invalidate);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.visualViewport?.removeEventListener("resize", invalidate);
      window.visualViewport?.removeEventListener("scroll", invalidate);
      document.fonts?.removeEventListener?.("loadingdone", invalidate);
      if (outerFrame !== 0) cancelAnimationFrame(outerFrame);
      if (innerFrame !== 0) cancelAnimationFrame(innerFrame);
    };
  }, [commitSelections, dispatch, onGeometryInvalidated, remeasureSelection, remeasureSelectionSet, writeInk]);

  const activate = useCallback(() => dispatch({ type: "activate" }), [dispatch]);
  const deactivate = useCallback(() => {
    measurementGenerationRef.current += 1;
    const pointerId = stateRef.current.mode === "drawing"
      ? stateRef.current.pointerId
      : null;
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    dispatch({ type: "deactivate" });
    return pointerId;
  }, [dispatch, writeInk]);
  const clearSelection = useCallback(() => {
    measurementGenerationRef.current += 1;
    startSelectionsRef.current = Object.freeze([]);
    commitSelections(Object.freeze([]));
    setSelectionRects(clearMeasuredSelectionRects);
    setSelectionSetRects(clearMeasuredSelectionRects);
    setSelectionColumn(null);
    dispatch({ type: "clear-selection" });
  }, [commitSelections, dispatch]);

  const selectKeyboardSegment = useCallback((
    nodeId: string,
    direction: "next" | "previous",
  ) => {
    if (stateRef.current.mode !== "ready") return false;
    if (input.eligibleNodeIds !== undefined && !input.eligibleNodeIds.has(nodeId)) return false;
    const node = input.tree.nodes[nodeId];
    if (node === undefined) return false;
    const segments = segmentText(node.text);
    if (segments.length === 0) return false;
    const current = primaryLassoSelection(stateRef.current.address);
    const currentIndex = current?.nodeId === nodeId
      ? segments.findIndex((segment) => (
          segment.start === current.start && segment.end === current.end
        ))
      : -1;
    const nextIndex = currentIndex < 0
      ? direction === "next" ? 0 : segments.length - 1
      : direction === "next"
        ? Math.min(segments.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
    const segment = segments[nextIndex];
    if (segment === undefined) return false;
    const nextSelection: SegmentSelection = Object.freeze({
      type: "segment-range",
      nodeId,
      start: segment.start,
      end: segment.end,
      selectedText: node.text.slice(segment.start, segment.end),
    });
    measurementGenerationRef.current += 1;
    dispatch({ type: "keyboard-select", selection: nextSelection });
    commitSelections(Object.freeze([nextSelection]));
    writeInk([]);
    remeasureSelection(nextSelection);
    return true;
  }, [commitSelections, dispatch, input.eligibleNodeIds, input.tree, remeasureSelection, writeInk]);

  const pointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (stateRef.current.mode !== "ready") return false;
    const startEvent: LassoInteractionEvent = {
      type: "pointer-down",
      pointerId: event.pointerId,
      pointerType: normalizeLassoPointerType(event.pointerType),
      isPrimary: event.isPrimary,
      button: event.button,
    };
    const started = reduceLassoInteraction(stateRef.current, startEvent);
    stateRef.current = started;
    dispatchBase(startEvent);
    if (started.mode !== "drawing" || started.pointerId !== event.pointerId) return false;
    measurementGenerationRef.current += 1;
    strokeEpochRef.current = latestEpochRef.current;
    strokeDocumentEpochRef.current = input.documentEpoch ?? 0;
    const snapshotKey = measurementEpochKey(latestEpochRef.current, input.navigationKey);
    if (targetSnapshotKeyRef.current !== snapshotKey || targetSnapshotRef.current === null) {
      targetSnapshotRef.current = measureLassoTargets(
        input.canvasRef.current,
        input.tree,
        input.eligibleNodeIds,
      );
      targetSnapshotKeyRef.current = snapshotKey;
    }
    sampledPointsRef.current = [{ x: event.clientX, y: event.clientY }];
    startSelectionsRef.current = selectionsRef.current;
    setSelectionRects(clearMeasuredSelectionRects);
    setSelectionSetRects(clearMeasuredSelectionRects);
    setSelectionColumn(null);
    commitSelections(Object.freeze([]));
    writeInk(sampledPointsRef.current);
    return true;
  }, [commitSelections, input.canvasRef, input.documentEpoch, input.eligibleNodeIds, input.navigationKey, input.tree, writeInk]);

  const pointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== event.pointerId) return false;
    for (const pointer of lassoPointerSamples(event.nativeEvent)) {
      appendSampledPoint(sampledPointsRef.current, { x: pointer.clientX, y: pointer.clientY });
    }
    if (sampledPointsRef.current.length > 0) {
      writeInk(sampledPointsRef.current);
    }
    return true;
  }, [writeInk]);

  const pointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== event.pointerId) return null;
    for (const pointer of lassoPointerSamples(event.nativeEvent)) {
      appendSampledPoint(
        sampledPointsRef.current,
        { x: pointer.clientX, y: pointer.clientY },
        true,
      );
    }
    appendSampledPoint(
      sampledPointsRef.current,
      { x: event.clientX, y: event.clientY },
      true,
    );
    const analysis = analyzeLassoPath(sampledPointsRef.current);
    const click = analysis.kind === "uncommitted" && lassoClickIntent(
      sampledPointsRef.current,
      current.pointerType === "touch" ? 8 : LASSO_THRESHOLDS.sampleDistance,
    );
    const resolution = !isCurrentLassoStroke(
      strokeEpochRef.current,
      latestEpochRef.current,
      strokeDocumentEpochRef.current,
      input.documentEpoch ?? 0,
    )
      ? { kind: "ambiguous" as const }
      : analysis.kind === "prepared"
      ? resolveLassoTargets(
          analysis.lasso,
          targetSnapshotRef.current ?? measureLassoTargets(
            input.canvasRef.current,
            input.tree,
            input.eligibleNodeIds,
          ),
        )
      : { kind: analysis.kind };
    dispatch({ type: "pointer-up", pointerId: event.pointerId, resolution });
    commitSelections(settleLassoSelectionSet(startSelectionsRef.current, resolution));
    startSelectionsRef.current = Object.freeze([]);
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    strokeDocumentEpochRef.current = input.documentEpoch ?? 0;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    remeasureSelection(primaryLassoSelection(stateRef.current.address));
    return click ? "click" : resolution.kind;
  }, [commitSelections, dispatch, input.canvasRef, input.documentEpoch, input.eligibleNodeIds, input.tree, remeasureSelection, writeInk]);

  const pointerCancel = useCallback((pointerId: number) => {
    const current = stateRef.current;
    if (current.mode !== "drawing" || current.pointerId !== pointerId) return false;
    dispatch({ type: "pointer-cancel", pointerId });
    commitSelections(startSelectionsRef.current);
    startSelectionsRef.current = Object.freeze([]);
    sampledPointsRef.current = [];
    strokeEpochRef.current = null;
    targetSnapshotRef.current = null;
    targetSnapshotKeyRef.current = null;
    writeInk([]);
    remeasureSelection(primaryLassoSelection(stateRef.current.address));
    return true;
  }, [commitSelections, dispatch, remeasureSelection, writeInk]);

  return {
    active: state.mode !== "inactive",
    drawing: state.mode === "drawing",
    inkRef,
    inkPathRef,
    closurePathRef,
    particleCanvasRef,
    selection,
    selections,
    sourceText: selection === null
      ? null
      : input.tree.nodes[selection.nodeId]?.text ?? null,
    selectionRects,
    selectionSetRects,
    selectionColumn,
    activate,
    deactivate,
    clearSelection,
    selectKeyboardSegment,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
  };
}

/**
 * Ink belongs to the paper. A stroke may travel anywhere on screen and still
 * mean what it meant — the semantic geometry below is untouched — but off the
 * paper a person sees only the particle echo, never a line drawn across the
 * material field. Clipping is presentation, so it is applied here at the
 * rendering edge and never reaches selection.
 */
function clipInkToPaper(ink: SVGSVGElement | null, paper: DOMRect | null, radius: number): void {
  if (ink === null) return;
  if (paper === null || paper.width <= 0 || paper.height <= 0) {
    ink.style.removeProperty("clip-path");
    return;
  }
  const top = Math.max(0, paper.top);
  const right = Math.max(0, window.innerWidth - paper.right);
  const bottom = Math.max(0, window.innerHeight - paper.bottom);
  const left = Math.max(0, paper.left);
  ink.style.setProperty(
    "clip-path",
    `inset(${round(top)}px ${round(right)}px ${round(bottom)}px ${round(left)}px round ${round(radius)}px)`,
  );
}

/** The paper's own corner. Reading it keeps one boundary rather than two. */
function paperCornerRadius(paper: HTMLElement | null): number {
  if (paper === null) return 0;
  const value = Number.parseFloat(window.getComputedStyle(paper).borderTopLeftRadius);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function round(value: number): number {
  return Math.round(value);
}

function clearParticleCanvas(canvas: HTMLCanvasElement | null): void {
  canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

function renderOutsideParticles(
  canvas: HTMLCanvasElement | null,
  points: readonly ClientPoint[],
  paper: DOMRect | null,
  radius: number,
): void {
  if (canvas === null || paper === null) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (context === null) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  // The same rounded outline the ink is clipped to, so a stroke crossing a
  // corner keeps its echo instead of falling into a gap between two shapes.
  if (radius > 0 && typeof context.roundRect === "function") {
    context.roundRect(paper.left, paper.top, paper.width, paper.height, radius);
  } else {
    context.rect(paper.left, paper.top, paper.width, paper.height);
  }
  context.clip("evenodd");
  for (const particle of projectOutsideLassoParticles(points, paper, radius)) {
    context.globalAlpha = particle.opacity;
    // The echo lands on the material field, never on the paper, so both weights
    // are field ink rather than the paper's own palette.
    context.fillStyle = particle.tone === "ink" ? "rgba(22,29,39,.62)" : "rgba(88,97,106,.34)";
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  context.globalAlpha = 1;
  context.restore();
}

function appendSampledPoint(
  points: ClientPoint[],
  point: ClientPoint,
  force = false,
): void {
  const previous = points.at(-1);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  if (
    previous &&
    !force &&
    Math.hypot(point.x - previous.x, point.y - previous.y) <
      LASSO_THRESHOLDS.sampleDistance
  ) return;
  if (previous?.x === point.x && previous.y === point.y) return;
  if (points.length < LASSO_THRESHOLDS.maximumPointCount) {
    points.push(point);
    return;
  }
  // Preserve the already-painted line. The last slot follows the pointer once
  // the semantic buffer is full, so old geometry never jumps under the hand.
  points[points.length - 1] = point;
}

function measureLassoTargets(
  canvas: HTMLDivElement | null,
  tree: ThoughtTree,
  eligibleNodeIds?: ReadonlySet<string>,
): readonly LassoTarget[] {
  if (canvas === null) return Object.freeze([]);
  const viewport = clientViewportBounds();
  const targets: LassoTarget[] = [];
  for (const root of canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]")) {
    const nodeId = root.dataset.thoughtTextId ?? "";
    if (eligibleNodeIds !== undefined && !eligibleNodeIds.has(nodeId)) continue;
    const node = tree.nodes[nodeId];
    if (node === undefined) continue;
    const rect = root.getBoundingClientRect();
    // A client-space stroke cannot reach off-screen material. Keeping those
    // nodes out of the snapshot bounds Range work on large spatial documents.
    if (!clientRectsOverlap(rect, viewport)) continue;
    const segments = segmentText(node.text);
    if (segments.length === 0) continue;
    const measurements: LassoSegmentMeasurement[] = [];
    for (const segment of segments) {
      const measured = measureTextRange(root, node.text, {
        start: segment.start,
        end: segment.end,
        selectedText: node.text.slice(segment.start, segment.end),
      });
      measurements.push(Object.freeze({
        index: segment.index,
        rects: measured.ok ? measured.rects : null,
      }));
    }
    const target = lassoTargetFromMeasurements({
      nodeId,
      text: node.text,
      rootBounds: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      measurements,
    });
    if (target !== null) targets.push(target);
  }
  return Object.freeze(targets);
}

function clientViewportBounds(): Readonly<{
  left: number; top: number; right: number; bottom: number;
}> {
  const viewport = window.visualViewport;
  if (viewport !== null) {
    return Object.freeze({
      left: viewport.offsetLeft,
      top: viewport.offsetTop,
      right: viewport.offsetLeft + viewport.width,
      bottom: viewport.offsetTop + viewport.height,
    });
  }
  return Object.freeze({
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  });
}

function clientRectsOverlap(
  left: Readonly<{ left: number; top: number; right: number; bottom: number }>,
  right: Readonly<{ left: number; top: number; right: number; bottom: number }>,
): boolean {
  return left.right >= right.left && left.left <= right.right &&
    left.bottom >= right.top && left.top <= right.bottom;
}

function findTextRoot(canvas: HTMLDivElement | null, nodeId: string): HTMLElement | null {
  if (canvas === null) return null;
  return Array.from(canvas.querySelectorAll<HTMLElement>("[data-thought-text-id]"))
    .find((element) => element.dataset.thoughtTextId === nodeId) ?? null;
}

function normalizeLassoPointerType(pointerType: string): "mouse" | "pen" | "touch" {
  return pointerType === "pen" || pointerType === "touch" ? pointerType : "mouse";
}

function measurementEpochKey(epoch: MeasurementEpoch, navigationKey: string): string {
  return `${epoch.treeRevision}:${epoch.layoutEpoch}:${epoch.viewportX}:${epoch.viewportY}:${epoch.viewportZoom}:${navigationKey}`;
}
